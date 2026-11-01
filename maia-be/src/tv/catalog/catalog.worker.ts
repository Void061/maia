import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss, type Job } from 'pg-boss';
import { CacheService } from '../../cache/cache.service.js';
import { HttpError, ServiceStoppedError } from '../providers/polite-fetch.js';
import { ServiceSwitches } from '../providers/service-switches.js';
import { CatalogScheduler } from './catalog.scheduler.js';
import { CatalogService, ProviderPausedError } from './catalog.service.js';
import { QUEUES, TZ, type CheckJob, type DiscoverJob, type SyncTitleJob } from './queues.js';

export { QUEUES };
// Catalog changes close together (a burst of titles) drop the cache once.
const INVALIDATE_DELAY_MS = 10_000;
// A title whose service is switched off waits this long before trying again.
const STOPPED_RETRY_SEC = 600;

// Runs the catalog jobs. On by default (production runs everything in the
// backend container); off with CATALOG_WORKERS=false, e.g. in local dev where
// `npm run catalog:worker` runs them in a process that survives code reloads.
@Injectable()
export class CatalogWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CatalogWorker.name);
  private boss: PgBoss | null = null;
  private invalidateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly catalog: CatalogService,
    private readonly config: ConfigService,
    private readonly cache: CacheService,
    private readonly switches: ServiceSwitches,
    private readonly scheduler: CatalogScheduler,
  ) {}

  // The services a job needs: the catalog service itself, and TMDB for matching.
  private stopped(provider: string) {
    return this.switches.isStopped(provider) || this.switches.isStopped('tmdb');
  }

  async onModuleInit() {
    if (process.env.VITEST || this.config.get('CATALOG_WORKERS') === 'false') return;
    await this.start();
  }

  async onModuleDestroy() {
    await this.boss?.stop({ graceful: true, timeout: 30_000 });
    if (this.invalidateTimer) await this.invalidateNow();
  }

  // Every catalog job that ran drops the whole MAIA cache: the API serves
  // fresh data on the next request and caches it again.
  private catalogChanged() {
    this.invalidateTimer ??= setTimeout(() => void this.invalidateNow(), INVALIDATE_DELAY_MS);
  }

  private async invalidateNow() {
    if (this.invalidateTimer) clearTimeout(this.invalidateTimer);
    this.invalidateTimer = null;
    const removed = await this.cache.invalidateAll();
    if (removed) this.logger.log(`Catalog changed: ${removed} cache entries dropped`);
  }

  async start() {
    const boss = new PgBoss({ connectionString: this.config.getOrThrow<string>('DATABASE_URL'), schema: 'pgboss' });
    boss.on('error', (err) => this.logger.error(`pg-boss: ${String(err)}`));
    await boss.start();
    this.boss = boss;

    await this.queue(QUEUES.discover, { policy: 'singleton', retryLimit: 2, retryDelay: 600, expireInSeconds: 3 * 3600 });
    // stately + singletonKey: at most one queued and one running job per title.
    await this.queue(QUEUES.syncTitle, { policy: 'stately', retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 900 });
    await this.queue(QUEUES.due, { policy: 'singleton', expireInSeconds: 1800 });
    await this.queue(QUEUES.check, { policy: 'singleton', expireInSeconds: 1800 });

    const closed = await this.catalog.closeInterruptedRuns();
    if (closed) this.logger.warn(`${closed} full pass(es) cut short by the previous worker closed`);

    // Expired videos go off every hour whatever the update settings (no request to any service).
    await boss.schedule(QUEUES.due, '15 * * * *', {}, { tz: TZ });
    // Full passes and checks follow each source's settings (admin panel).
    await boss.unschedule('catalog-news'); // replaced by catalog-check
    await this.scheduler.applyAll();

    await boss.work<DiscoverJob>(QUEUES.discover, { batchSize: 1 }, ([job]) => this.onDiscover(job));
    // Several in parallel: titles wait on TMDB and the database while the service's
    // requests stay one at a time (polite-fetch), so this does not load the service more.
    await boss.work<SyncTitleJob>(QUEUES.syncTitle, { batchSize: 1, localConcurrency: 8 }, ([job]) => this.onSyncTitle(job));
    await boss.work(QUEUES.due, { batchSize: 1 }, () => this.onDue());
    await boss.work<CheckJob>(QUEUES.check, { batchSize: 1 }, ([job]) => this.onCheck(job));
    this.logger.log('Catalog workers running');
  }

  private async queue(name: string, options: NonNullable<Parameters<PgBoss['createQueue']>[1]>) {
    if (!(await this.boss!.getQueue(name))) return this.boss!.createQueue(name, options);
    // The policy is fixed at creation; the rest follows the code.
    const { policy: _policy, ...rest } = options;
    await this.boss!.updateQueue(name, rest);
  }

  async enqueueTitles(provider: string, externalIds: string[]) {
    for (const externalId of externalIds) {
      await this.boss!.send(QUEUES.syncTitle, { provider, externalId } satisfies SyncTitleJob, { singletonKey: `${provider}:${externalId}` });
    }
  }

  private async onDiscover(job: Job<DiscoverJob>) {
    const { provider, mode } = job.data;
    // Switched off: this pass is skipped (the next scheduled one runs as usual).
    if (this.switches.isStopped(provider)) return this.logger.warn(`${provider} ${mode} skipped: service switched off`);
    let ids: string[];
    try {
      ids = await this.catalog.discover(provider, mode);
    } catch (err) {
      if (err instanceof ServiceStoppedError) return this.logger.warn(`${provider} ${mode} stopped: service switched off`);
      throw err;
    }
    await this.enqueueTitles(provider, ids);
    this.catalogChanged(); // titles no longer listed lose their sources
    this.logger.log(`${provider} ${mode}: ${ids.length} titles queued`);
    // A full pass also does what a check does: front lists and titles whose turn has come.
    if (mode === 'refresh') await this.check(provider);
  }

  private async onSyncTitle(job: Job<SyncTitleJob>) {
    const { provider, externalId } = job.data;
    if (this.stopped(provider)) return this.deferTitle(job.data);
    try {
      const outcome = await this.catalog.syncTitle(provider, externalId);
      // An unchanged title leaves the catalog as it was: the cache stays.
      if (outcome !== 'unchanged') {
        this.catalogChanged();
        this.logger.debug(`${provider}/${externalId}: ${outcome}`);
      }
    } catch (err) {
      // Switched off halfway: the title waits, it is not a failure (no retry used up).
      if (err instanceof ServiceStoppedError) return this.deferTitle(job.data);
      if (!(err instanceof ProviderPausedError)) this.logger.warn(`${provider}/${externalId}: ${String(err)}`);
      throw err; // pg-boss retries with backoff
    }
  }

  // Back in the queue for later; the current job ends without an error.
  private async deferTitle(data: SyncTitleJob) {
    await this.boss!.send(QUEUES.syncTitle, data, { singletonKey: `${data.provider}:${data.externalId}`, startAfter: STOPPED_RETRY_SEC });
  }

  // Hourly, database only.
  private async onDue() {
    if (await this.catalog.expireVideos()) this.catalogChanged();
  }

  private async onCheck(job: Job<CheckJob>) {
    await this.check(job.data.provider);
  }

  // A source's front lists (new films and episodes appear there first) and its
  // titles whose next check has come (adaptive rhythm).
  private async check(provider: string) {
    if (this.switches.isStopped(provider)) return;
    const ids = new Set<string>();
    const adapter = this.catalog.adapters[provider];
    for (const section of adapter?.listSection ? (adapter.frontSections ?? []) : []) {
      try {
        for (const id of await adapter.listSection!(section)) ids.add(id);
      } catch (err) {
        if (err instanceof HttpError && err.slowDown) throw err;
        if (err instanceof ServiceStoppedError) return; // switched off while listing
        this.logger.warn(`${provider} section ${section} skipped: ${String(err)}`); // e.g. a section the service removed
      }
    }
    for (const t of await this.catalog.dueTitles(provider)) ids.add(t.externalId);
    await this.enqueueTitles(provider, [...ids]);
    await this.catalog.checked(provider);
    this.logger.log(`${provider} check: ${ids.size} titles queued`);
  }
}
