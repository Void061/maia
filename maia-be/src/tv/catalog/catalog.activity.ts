import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { SyncOutcome } from './catalog.service.js';
import { QUEUES } from './queues.js';

// Events older than this are deleted (hourly, with the expired videos).
const KEEP_DAYS = 7;
// The worker writes its heartbeat this often; missing three in a row = off.
export const BEAT_MS = 30_000;
const BEAT_TIMEOUT_MS = 3 * BEAT_MS;

export type ActivityFilter = 'changes' | 'all' | 'errors';

// Title outcomes that are not a change: hidden unless the panel asks for everything.
const QUIET_KINDS = ['unchanged'];
const ERROR_KINDS = ['failed', 'pass-failed', 'pass-aborted'];

// What the catalog worker is doing and did, for the admin panel ("Attività").
// Written by the worker, read by the admin API. Database only: recording never
// makes a request to a service, and a failed write never stops a job.
@Injectable()
export class CatalogActivity {
  private readonly logger = new Logger(CatalogActivity.name);

  constructor(private readonly prisma: PrismaService) {}

  async titleDone(provider: string, externalId: string, outcome: SyncOutcome) {
    const pt = await this.prisma.providerTitle
      .findUnique({ where: { provider_externalId: { provider, externalId } }, select: { name: true } })
      .catch(() => null);
    await this.record({ provider, kind: outcome, externalId, name: pt?.name ?? null });
  }

  async titleFailed(provider: string, externalId: string, err: unknown) {
    const pt = await this.prisma.providerTitle
      .findUnique({ where: { provider_externalId: { provider, externalId } }, select: { name: true } })
      .catch(() => null);
    await this.record({ provider, kind: 'failed', externalId, name: pt?.name ?? null, message: errorText(err) });
  }

  // "Aggiorna ora" from the panel: the pass waits in the queue until a worker takes it.
  async passQueued(provider: string, by: string) {
    await this.record({ provider, kind: 'pass-queued', message: by });
  }

  async passCancelled(provider: string, by: string) {
    await this.record({ provider, kind: 'pass-cancelled', message: by });
  }

  async workerOnline(): Promise<boolean> {
    const beat = await this.prisma.catalogWorkerBeat.findUnique({ where: { id: 1 } }).catch(() => null);
    return !!beat && beat.seenAt.getTime() > Date.now() - BEAT_TIMEOUT_MS;
  }

  async beat(startedAt: Date) {
    const seenAt = new Date();
    await this.prisma.catalogWorkerBeat
      .upsert({ where: { id: 1 }, create: { id: 1, startedAt, seenAt }, update: { startedAt, seenAt } })
      .catch((err) => this.logger.warn(`Could not write the worker heartbeat: ${String(err)}`));
  }

  // A worker that stops cleanly says so at once (otherwise the beat just runs out).
  async workerStopped() {
    await this.prisma.catalogWorkerBeat.deleteMany().catch(() => undefined);
  }

  async passStarted(provider: string, mode: string) {
    await this.record({ provider, kind: 'pass-start', message: mode });
  }

  // The outcome comes from the pass's SyncRun (done, or aborted when the listing looked broken).
  async passEnded(provider: string, mode: string, queued: number) {
    const run = await this.prisma.syncRun.findFirst({ where: { provider }, orderBy: { startedAt: 'desc' } }).catch(() => null);
    const aborted = run?.status === 'aborted';
    await this.record({
      provider,
      kind: aborted ? 'pass-aborted' : 'pass-done',
      found: run?.found ?? null,
      queued,
      message: aborted ? run?.note ?? mode : mode,
    });
  }

  async passFailed(provider: string, mode: string, err: unknown) {
    await this.record({ provider, kind: 'pass-failed', message: `${mode}: ${errorText(err)}` });
  }

  async checked(provider: string, queued: number) {
    await this.record({ provider, kind: 'check', queued });
  }

  async prune(): Promise<number> {
    const { count } = await this.prisma.catalogEvent.deleteMany({ where: { at: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } } });
    return count;
  }

  // Newest first; `before` is the last id of the previous page.
  async events(provider: string, filter: ActivityFilter, before: number | undefined, limit: number) {
    const rows = await this.prisma.catalogEvent.findMany({
      where: {
        provider,
        ...(before ? { id: { lt: before } } : {}),
        ...(filter === 'changes' ? { kind: { notIn: QUIET_KINDS } } : filter === 'errors' ? { kind: { in: ERROR_KINDS } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    return { events: rows.slice(0, limit), more: rows.length > limit };
  }

  // The worker's queue for a source, read from pg-boss: titles waiting, retrying
  // after an error, and the ones being read right now.
  async live(provider: string) {
    const [counts, active, passes, beat] = await Promise.all([
      this.prisma.$queryRaw<{ state: string; n: number }[]>`
        SELECT state::text AS state, count(*)::int AS n
          FROM pgboss.job
         WHERE name = ${QUEUES.syncTitle} AND state IN ('created', 'retry') AND data->>'provider' = ${provider}
         GROUP BY 1`.catch(() => []),
      this.prisma.$queryRaw<{ externalId: string; name: string | null; startedOn: Date | null; stale: boolean }[]>`
        SELECT j.data->>'externalId' AS "externalId", p.name, j.started_on AS "startedOn",
               j.started_on < now() - make_interval(secs => j.expire_seconds) AS stale
          FROM pgboss.job j
          LEFT JOIN provider_titles p ON p.provider = j.data->>'provider' AND p.external_id = j.data->>'externalId'
         WHERE j.name = ${QUEUES.syncTitle} AND j.state = 'active' AND j.data->>'provider' = ${provider}
         ORDER BY j.started_on`.catch(() => []),
      // The full pass of the source, if one is waiting or running (one at a time: singleton queue).
      this.prisma.$queryRaw<{ state: string; createdOn: Date; startedOn: Date | null }[]>`
        SELECT state::text AS state, created_on AS "createdOn", started_on AS "startedOn"
          FROM pgboss.job
         WHERE name = ${QUEUES.discover} AND state IN ('created', 'active', 'retry') AND data->>'provider' = ${provider}
         ORDER BY created_on DESC LIMIT 1`.catch(() => []),
      this.prisma.catalogWorkerBeat.findUnique({ where: { id: 1 } }).catch(() => null),
    ]);
    const pass = passes[0];
    return {
      worker: {
        online: !!beat && beat.seenAt.getTime() > Date.now() - BEAT_TIMEOUT_MS,
        startedAt: beat?.startedAt ?? null,
        seenAt: beat?.seenAt ?? null,
      },
      pass: pass
        ? {
            state: pass.state === 'active' ? 'running' : pass.state === 'retry' ? 'retry' : 'waiting',
            since: pass.state === 'active' && pass.startedOn ? pass.startedOn : pass.createdOn,
          }
        : null,
      queued: counts.find((c) => c.state === 'created')?.n ?? 0,
      retrying: counts.find((c) => c.state === 'retry')?.n ?? 0,
      // Past their time limit: left halfway by a worker that stopped. pg-boss
      // only expires them (and retries) once a worker runs again.
      stalled: active.filter((a) => a.stale).length,
      active: active.filter((a) => !a.stale),
    };
  }

  private async record(data: {
    provider: string;
    kind: string;
    externalId?: string;
    name?: string | null;
    found?: number | null;
    queued?: number;
    message?: string;
  }) {
    try {
      await this.prisma.catalogEvent.create({ data });
    } catch (err) {
      this.logger.warn(`Could not record ${data.provider} ${data.kind}: ${String(err)}`);
    }
  }
}

function errorText(err: unknown) {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}
