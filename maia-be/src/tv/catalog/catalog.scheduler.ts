import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SERVICES } from '../providers/services.js';
import { DEFAULT_SYNC, QUEUES, syncCrons, TZ, type CheckJob, type DiscoverJob, type SyncSettings } from './queues.js';

// Turns each catalog source's update settings (admin panel) into pg-boss
// schedules, and starts an update on request. Used by the backend (panel) and
// by the worker (at start). It only writes schedules and jobs: the worker's
// pg-boss runs them.
export type PassState = 'waiting' | 'running' | 'retry';

@Injectable()
export class CatalogScheduler implements OnModuleDestroy {
  private readonly logger = new Logger(CatalogScheduler.name);
  private boss: Promise<PgBoss> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleDestroy() {
    if (this.boss) await (await this.boss).stop({ graceful: false });
  }

  // A pg-boss client that only reads and writes: no maintenance, no cron.
  private client(): Promise<PgBoss> {
    this.boss ??= (async () => {
      const boss = new PgBoss({
        connectionString: this.config.getOrThrow<string>('DATABASE_URL'),
        schema: 'pgboss',
        supervise: false,
        schedule: false,
      });
      boss.on('error', (err) => this.logger.error(`pg-boss: ${String(err)}`));
      await boss.start();
      return boss;
    })();
    return this.boss;
  }

  async settings(provider: string): Promise<SyncSettings> {
    const h = await this.prisma.providerHealth.findUnique({ where: { provider } });
    return h ? { mode: h.syncMode, at: h.syncAt, everyHours: h.syncEveryHours } : DEFAULT_SYNC;
  }

  async save(provider: string, settings: SyncSettings, by: string) {
    const data = { syncMode: settings.mode, syncAt: settings.at, syncEveryHours: settings.everyHours };
    await this.prisma.providerHealth.upsert({ where: { provider }, create: { provider, ...data }, update: data });
    this.logger.warn(`${provider} updates set to ${JSON.stringify(settings)} by ${by}`);
    await this.apply(provider);
  }

  // Schedules of one source, from its settings (manual = none).
  async apply(provider: string) {
    const boss = await this.client();
    const { full, check } = syncCrons(await this.settings(provider));
    if (full) await boss.schedule(QUEUES.discover, full, { provider, mode: 'refresh' } satisfies DiscoverJob, { tz: TZ, key: provider });
    else await boss.unschedule(QUEUES.discover, provider);
    if (check) await boss.schedule(QUEUES.check, check, { provider } satisfies CheckJob, { tz: TZ, key: provider });
    else await boss.unschedule(QUEUES.check, provider);
  }

  async applyAll() {
    for (const s of SERVICES.filter((x) => x.catalog)) await this.apply(s.id);
  }

  // "Aggiorna ora": a full pass now. False if one is already queued or running.
  async runNow(provider: string): Promise<boolean> {
    const boss = await this.client();
    return (await boss.send(QUEUES.discover, { provider, mode: 'refresh' } satisfies DiscoverJob)) !== null;
  }

  // The full pass of the source, if one is queued (waiting for a worker),
  // running, or waiting to try again after an error. One at a time (singleton queue).
  async pass(provider: string): Promise<{ state: PassState; since: Date } | null> {
    const rows = await this.prisma.$queryRaw<{ state: string; createdOn: Date; startedOn: Date | null }[]>`
      SELECT state::text AS state, created_on AS "createdOn", started_on AS "startedOn"
        FROM pgboss.job
       WHERE name = ${QUEUES.discover} AND state IN ('created', 'active', 'retry') AND data->>'provider' = ${provider}
       ORDER BY created_on DESC LIMIT 1`.catch(() => []);
    const job = rows[0];
    if (!job) return null;
    if (job.state === 'active') return { state: 'running', since: job.startedOn ?? job.createdOn };
    return { state: job.state === 'retry' ? 'retry' : 'waiting', since: job.createdOn };
  }

  // Takes a full pass that has not started yet out of the queue (a running one
  // is stopped with the service switch). Returns whether there was one.
  async cancelQueued(provider: string): Promise<boolean> {
    const n = await this.prisma.$executeRaw`
      UPDATE pgboss.job SET state = 'cancelled', completed_on = now()
       WHERE name = ${QUEUES.discover} AND state IN ('created', 'retry') AND data->>'provider' = ${provider}`;
    return n > 0;
  }
}
