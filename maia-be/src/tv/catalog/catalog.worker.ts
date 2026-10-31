import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss, type Job } from 'pg-boss';
import { CacheService } from '../../cache/cache.service.js';
import { HttpError, ServiceStoppedError } from '../providers/polite-fetch.js';
import { ServiceSwitches } from '../providers/service-switches.js';
import { SECTIONS } from '../providers/raiplay/raiplay.adapter.js';
import { CatalogService, ProviderPausedError } from './catalog.service.js';

// Job queues of the catalog sync, stored in Postgres (schema "pgboss").
export const QUEUES = {
  discover: 'catalog-discover', // list a whole service; fill or nightly refresh
  syncTitle: 'catalog-sync-title', // read one title and merge it
  due: 'catalog-due', // hourly: titles whose turn has come, expired videos off
  news: 'catalog-news', // every 3 hours: the services' front lists
} as const;

export type DiscoverJob = { provider: string; mode: 'fill' | 'refresh' };
export type SyncTitleJob = { provider: string; externalId: string };

const TZ = 'Europe/Rome';
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
    await this.queue(QUEUES.news, { policy: 'singleton', expireInSeconds: 1800 });

    for (const provider of Object.keys(this.catalog.adapters)) {
      await boss.schedule(QUEUES.discover, '0 3 * * *', { provider, mode: 'refresh' } satisfies DiscoverJob, { tz: TZ, key: provider });
    }
    await boss.schedule(QUEUES.due, '15 * * * *', {}, { tz: TZ });
    await boss.schedule(QUEUES.news, '0 */3 * * *', {}, { tz: TZ });

    await boss.work<DiscoverJob>(QUEUES.discover, { batchSize: 1 }, ([job]) => this.onDiscover(job));
    // Several in parallel: titles wait on TMDB and the database while the service's
    // requests stay one at a time (polite-fetch), so this does not load the service more.
    await boss.work<SyncTitleJob>(QUEUES.syncTitle, { batchSize: 1, localConcurrency: 8 }, ([job]) => this.onSyncTitle(job));
    await boss.work(QUEUES.due, { batchSize: 1 }, () => this.onDue());
    await boss.work(QUEUES.news, { batchSize: 1 }, () => this.onNews());
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

  private async onDue() {
    const due = await this.catalog.dueTitles();
    for (const t of due) await this.enqueueTitles(t.provider, [t.externalId]);
    this.catalogChanged(); // expired videos were switched off
    if (due.length) this.logger.log(`${due.length} titles due for a check`);
  }

  // Front lists change first: new films and episodes appear there.
  private async onNews() {
    if (this.switches.isStopped('raiplay')) return;
    const adapter = this.catalog.adapters.raiplay;
    const ids = new Set<string>();
    for (const section of SECTIONS) {
      try {
        for (const id of await adapter.listSection(section)) ids.add(id);
      } catch (err) {
        if (err instanceof HttpError && err.slowDown) throw err;
        if (err instanceof ServiceStoppedError) return; // switched off while listing
        this.logger.warn(`raiplay section ${section} skipped: ${String(err)}`); // e.g. a section RaiPlay removed
      }
    }
    await this.enqueueTitles('raiplay', [...ids]);
  }
}
