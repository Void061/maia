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

  // Whether a full pass of the source is queued or running.
  async running(provider: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pgboss.job
       WHERE name = ${QUEUES.discover} AND state IN ('created', 'active', 'retry') AND data->>'provider' = ${provider}`.catch(() => [{ n: 0 }]);
    return rows[0].n > 0;
  }
}
