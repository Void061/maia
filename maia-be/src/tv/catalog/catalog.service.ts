import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { placeEpisode, type TmdbSeasonEpisodes } from '../matching/episodes.js';
import { decide, searchTitle } from '../matching/score.js';
import { subjectOf } from '../matching/subject.js';
import { TmdbClient, type TmdbMeta } from '../matching/tmdb.client.js';
import { HttpError, ServiceStoppedError } from '../providers/polite-fetch.js';
import type { ProviderAdapter, ProviderEpisode, ProviderTitle } from '../providers/provider.types.js';
import { RaiPlayAdapter } from '../providers/raiplay/raiplay.adapter.js';

const TMDB_IMAGES = 'https://image.tmdb.org/t/p';
const DAY = 86_400_000;
// After this many consecutive errors a service pauses (circuit breaker).
const MAX_FAIL_STREAK = 5;
const PAUSE_MS = 30 * 60_000;
// The service asked us to slow down (429) or blocked us (403): pause at once, longer.
const SLOW_DOWN_PAUSE_MS = 6 * 3600_000;
// A discovery finding fewer titles than this share of the previous one is
// treated as a broken listing: nothing is hidden.
const MIN_DISCOVERY_RATIO = 0.7;

export class ProviderPausedError extends Error {}

export type SyncOutcome = 'created' | 'updated' | 'unchanged' | 'missing';

// Builds the MAIA catalog from what the services list (docs/tv/catalog.md):
// matches titles to TMDB, places episodes in TMDB's structure, links sources,
// switches off what disappeared and plans the next check of each title.
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);
  private readonly tmdb: TmdbClient | null;
  readonly adapters: Record<string, ProviderAdapter & { discover?: () => Promise<string[]> }>;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const key = config.get<string>('TMDB_API_KEY');
    this.tmdb = key ? new TmdbClient(key) : null;
    if (!key) this.logger.warn('TMDB_API_KEY missing: titles are not matched to TMDB');
    this.adapters = { raiplay: new RaiPlayAdapter() };
  }

  private adapter(provider: string) {
    const adapter = this.adapters[provider];
    if (!adapter) throw new Error(`Unknown provider ${provider}`);
    return adapter;
  }

  // ─── one title ────────────────────────────────────────────────────────────

  async syncTitle(provider: string, externalId: string): Promise<SyncOutcome> {
    await this.assertNotPaused(provider);
    let data: ProviderTitle | null;
    try {
      data = await this.adapter(provider).getTitle(externalId);
    } catch (err) {
      if (err instanceof ServiceStoppedError) throw err; // switched off by an admin: not the service's fault
      // A single broken title (4xx) says nothing about the service's health,
      // except "slow down" / "blocked", which pauses the service right away.
      if (err instanceof HttpError && err.slowDown) await this.recordFailure(provider, err, SLOW_DOWN_PAUSE_MS);
      else if (!(err instanceof HttpError && err.status < 500)) await this.recordFailure(provider, err);
      throw err;
    }
    await this.recordSuccess(provider);
    if (!data) {
      await this.markMissing(provider, [externalId]);
      return 'missing';
    }
    return this.ingest(data);
  }

  async ingest(data: ProviderTitle): Promise<SyncOutcome> {
    const now = new Date();
    const hash = createHash('sha1').update(JSON.stringify(data)).digest('hex');
    const existing = await this.prisma.providerTitle.findUnique({
      where: { provider_externalId: { provider: data.provider, externalId: data.externalId } },
    });

    if (existing?.titleId && existing.contentHash === hash) {
      await this.prisma.providerTitle.update({
        where: { id: existing.id },
        data: { lastSeenAt: now, missCount: 0, ...this.nextCheck(existing.kind, existing.lastChangeAt, false, null, now) },
      });
      return 'unchanged';
    }

    const pt = await this.prisma.providerTitle.upsert({
      where: { provider_externalId: { provider: data.provider, externalId: data.externalId } },
      create: { provider: data.provider, externalId: data.externalId, kind: data.kind, name: data.name, year: data.year },
      update: { kind: data.kind, name: data.name, year: data.year, lastSeenAt: now, missCount: 0 },
    });

    const titleId = pt.titleId ?? (await this.matchAndLink(pt.id, data));
    let title = await this.prisma.title.findUniqueOrThrow({ where: { id: titleId } });
    // Titles built from the service's data follow it (TMDB ones keep TMDB's).
    if (!title.tmdbId) {
      title = await this.prisma.title.update({
        where: { id: titleId },
        data: {
          posterUrl: title.posterUrl ?? data.posterUrl,
          backdropUrl: title.backdropUrl ?? data.backdropUrl,
          overview: data.description || title.overview,
        },
      });
    }
    const meta = title.tmdbId && this.tmdb ? await this.tmdb.meta(title.kind, title.tmdbId) : null;

    const added =
      data.kind === 'MOVIE'
        ? await this.linkMovie(pt.id, titleId, data, now)
        : await this.linkEpisodes(pt.id, title.id, title.tmdbId, data, now);
    await this.linkExtras(title.id, data, now);

    // Whatever this service no longer lists for the title goes off.
    await this.prisma.source.updateMany({
      where: { providerTitleId: pt.id, lastSeenAt: { lt: now }, available: true },
      data: { available: false },
    });

    const changed = !existing || added > 0;
    const lastChangeAt = changed ? now : existing.lastChangeAt;
    await this.prisma.providerTitle.update({
      where: { id: pt.id },
      data: { contentHash: hash, lastChangeAt, ...this.nextCheck(data.kind, lastChangeAt, changed, meta, now) },
    });
    return existing ? 'updated' : 'created';
  }

  // Adaptive rhythm: daily while things change, weekly after 7 quiet days,
  // monthly after 14; never later than the day after TMDB's next episode.
  // Movies only need the nightly discovery (removal) and the expiry check.
  private nextCheck(kind: string, lastChangeAt: Date, changed: boolean, meta: TmdbMeta | null, now: Date) {
    let days = 30;
    if (kind === 'SERIES') {
      const quiet = (now.getTime() - lastChangeAt.getTime()) / DAY;
      days = changed || quiet < 7 ? 1 : quiet < 14 ? 7 : 30;
    }
    let next = new Date(now.getTime() + days * DAY);
    if (meta?.nextEpisodeAt) {
      // The morning after the broadcast, when the services have published it.
      const afterAiring = new Date(`${meta.nextEpisodeAt}T06:00:00Z`).getTime() + DAY;
      if (afterAiring > now.getTime() && afterAiring < next.getTime()) next = new Date(afterAiring);
    }
    return { checkIntervalDays: days, nextCheckAt: next };
  }

  // ─── matching ─────────────────────────────────────────────────────────────

  private async matchAndLink(providerTitleId: string, data: ProviderTitle): Promise<string> {
    const fromProvider = {
      kind: data.kind,
      name: data.name,
      year: data.year,
      overview: data.description,
      genres: data.genres,
      posterUrl: data.posterUrl,
      backdropUrl: data.backdropUrl,
    };
    if (!this.tmdb) {
      const title = await this.prisma.title.create({ data: fromProvider });
      await this.prisma.providerTitle.update({ where: { id: providerTitleId }, data: { titleId: title.id, verdict: 'NEW' } });
      return title.id;
    }

    const query = searchTitle(data.name);
    const subject = subjectOf(data);
    const candidates =
      data.kind === 'MOVIE' ? await this.tmdb.movieCandidates(query, data.year) : await this.tmdb.tvCandidates(query, data.year);
    const { verdict, ranked } = decide(subject, candidates);
    const best = ranked[0];

    let titleId: string;
    if (verdict === 'auto') {
      titleId = await this.tmdbTitle(data.kind, best.candidate.tmdbId, fromProvider);
    } else {
      titleId = (await this.prisma.title.create({ data: fromProvider })).id;
      if (verdict === 'review') {
        const top = ranked.slice(0, 3).map((r) => ({
          tmdbId: r.candidate.tmdbId,
          title: r.candidate.title,
          year: r.candidate.year,
          score: Math.round(r.score * 100) / 100,
        }));
        await this.prisma.matchReview.upsert({
          where: { providerTitleId },
          create: { providerTitleId, candidates: top },
          update: { candidates: top, status: 'PENDING', resolvedAt: null },
        });
      }
    }
    await this.prisma.providerTitle.update({
      where: { id: providerTitleId },
      data: { titleId, verdict: verdict === 'auto' ? 'AUTO' : verdict === 'review' ? 'REVIEW' : 'NEW', matchScore: best?.score ?? null },
    });
    return titleId;
  }

  // The title for a TMDB id, created from TMDB's Italian metadata the first time.
  private async tmdbTitle(kind: 'MOVIE' | 'SERIES', tmdbId: number, fallback: { posterUrl: string | null; backdropUrl: string | null; genres: string[] }) {
    const found = await this.prisma.title.findUnique({ where: { kind_tmdbId: { kind, tmdbId } } });
    if (found) return found.id;
    const meta = await this.tmdb!.meta(kind, tmdbId);
    try {
      const created = await this.prisma.title.create({
        data: {
          kind,
          tmdbId,
          name: meta.name,
          originalName: meta.originalName || null,
          year: meta.year,
          overview: meta.overview,
          posterUrl: meta.posterPath ? `${TMDB_IMAGES}/w500${meta.posterPath}` : fallback.posterUrl,
          backdropUrl: meta.backdropPath ? `${TMDB_IMAGES}/w1280${meta.backdropPath}` : fallback.backdropUrl,
          genres: meta.genres.length ? meta.genres : fallback.genres,
        },
      });
      return created.id;
    } catch (err) {
      // Another worker created it in the meantime.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        return (await this.prisma.title.findUniqueOrThrow({ where: { kind_tmdbId: { kind, tmdbId } } })).id;
      throw err;
    }
  }

  // ─── sources ──────────────────────────────────────────────────────────────

  private async linkMovie(providerTitleId: string, titleId: string, data: ProviderTitle, now: Date): Promise<number> {
    const video = data.video;
    if (!video?.playback) return 0;
    const before = await this.prisma.source.findUnique({ where: { provider_externalId: { provider: data.provider, externalId: data.externalId } } });
    await this.prisma.source.upsert({
      where: { provider_externalId: { provider: data.provider, externalId: data.externalId } },
      create: { provider: data.provider, externalId: data.externalId, providerTitleId, titleId, ...videoFields(video, now) },
      update: { providerTitleId, titleId, episodeId: null, ...videoFields(video, now) },
    });
    return before ? 0 : 1;
  }

  // Places every episode in the title's seasons: in TMDB's structure when the
  // title has a TMDB id (by date, then by number), otherwise as the service
  // numbers it. Episodes TMDB does not have yet become provisional and are
  // placed again at every sync until TMDB catches up.
  private async linkEpisodes(providerTitleId: string, titleId: string, tmdbId: number | null, data: ProviderTitle, now: Date): Promise<number> {
    const known = new Map(
      (
        await this.prisma.source.findMany({
          where: { providerTitleId },
          select: { externalId: true, episodeId: true, episode: { select: { provisional: true } } },
        })
      ).map((s) => [s.externalId, s]),
    );
    let tmdbSeasons: TmdbSeasonEpisodes[] | null = null;
    const loadTmdbSeasons = async () => {
      if (tmdbSeasons) return tmdbSeasons;
      tmdbSeasons = [];
      if (tmdbId && this.tmdb) {
        const numbers = await this.tmdb.seasonNumbers(tmdbId);
        tmdbSeasons.push(...(await Promise.all(numbers.map((n) => this.tmdb!.season(tmdbId, n)))));
      }
      return tmdbSeasons;
    };

    let added = 0;
    for (const season of data.seasons) {
      for (const ep of season.episodes) {
        if (!ep.playback) continue;
        const prev = known.get(ep.externalId);
        let episodeId = prev?.episodeId ?? null;
        if (!episodeId || prev?.episode?.provisional) {
          episodeId = await this.placeAndUpsertEpisode(titleId, season.number, ep, tmdbId ? await loadTmdbSeasons() : []);
        }
        // The service's picture of this episode (kept when the service has none).
        if (ep.imageUrl) await this.prisma.episode.update({ where: { id: episodeId }, data: { imageUrl: ep.imageUrl } });
        await this.prisma.source.upsert({
          where: { provider_externalId: { provider: data.provider, externalId: ep.externalId } },
          create: { provider: data.provider, externalId: ep.externalId, providerTitleId, episodeId, ...videoFields(ep, now) },
          update: { providerTitleId, episodeId, titleId: null, ...videoFields(ep, now) },
        });
        if (!prev) added++;
      }
    }
    // Provisional episodes left without sources after being placed properly.
    await this.prisma.episode.deleteMany({ where: { provisional: true, season: { titleId }, sources: { none: {} } } });
    return added;
  }

  private async placeAndUpsertEpisode(titleId: string, seasonLabelNumber: number | null, ep: ProviderEpisode, tmdbSeasons: TmdbSeasonEpisodes[]) {
    const placed = tmdbSeasons.length ? placeEpisode(ep, tmdbSeasons) : ({ how: 'none' } as const);
    const seasonNumber = placed.how === 'none' ? (ep.season ?? seasonLabelNumber ?? 1) : placed.season;
    const season = await this.prisma.season.upsert({
      where: { titleId_number: { titleId, number: seasonNumber } },
      create: { titleId, number: seasonNumber },
      update: {},
    });
    const fields =
      placed.how === 'none'
        ? { name: ep.title, airDate: ep.airDate ? new Date(ep.airDate) : null, provisional: tmdbSeasons.length > 0 }
        : { name: placed.name || ep.title, airDate: placed.airDate ? new Date(placed.airDate) : null, provisional: false };
    const number = placed.how === 'none' ? ep.episode : placed.episode;

    if (number !== null) {
      const episode = await this.prisma.episode.upsert({
        where: { seasonId_number: { seasonId: season.id, number } },
        create: { seasonId: season.id, number, ...fields },
        // A real TMDB placement wins over a provisional one, never the opposite.
        update: fields.provisional ? {} : fields,
      });
      return episode.id;
    }
    // Puntate known only by date.
    const byDate = fields.airDate
      ? await this.prisma.episode.findFirst({ where: { seasonId: season.id, airDate: fields.airDate } })
      : null;
    if (byDate) return byDate.id;
    return (await this.prisma.episode.create({ data: { seasonId: season.id, number: null, ...fields } })).id;
  }

  private async linkExtras(titleId: string, data: ProviderTitle, now: Date) {
    const seenGroups: string[] = [];
    for (const [position, group] of data.extras.entries()) {
      seenGroups.push(group.externalId);
      const g = await this.prisma.extraGroup.upsert({
        where: { provider_externalId: { provider: data.provider, externalId: group.externalId } },
        create: { titleId, provider: data.provider, externalId: group.externalId, kind: group.kind, label: group.label, seasonNumber: group.season, position },
        update: { titleId, kind: group.kind, label: group.label, seasonNumber: group.season, position },
      });
      for (const [i, v] of group.videos.entries()) {
        if (!v.playback) continue;
        const fields = {
          name: v.title,
          position: i,
          playbackUrl: v.playback.url,
          drm: v.drm,
          durationSec: v.durationSec,
          expiresAt: v.expiresAt ? new Date(v.expiresAt) : null,
          available: !v.drm,
          lastSeenAt: now,
          imageUrl: v.imageUrl,
        };
        await this.prisma.extra.upsert({
          where: { groupId_externalId: { groupId: g.id, externalId: v.externalId } },
          create: { groupId: g.id, externalId: v.externalId, ...fields },
          update: fields,
        });
      }
      await this.prisma.extra.updateMany({ where: { groupId: g.id, lastSeenAt: { lt: now } }, data: { available: false } });
    }
    await this.prisma.extra.updateMany({
      where: { group: { titleId, provider: data.provider, externalId: { notIn: seenGroups } }, available: true },
      data: { available: false },
    });
  }

  // ─── whole service ────────────────────────────────────────────────────────

  // Lists the whole service and compares with what we have. Returns the ids
  // to sync: all of them for the first fill, only the new ones afterwards.
  async discover(provider: string, mode: 'fill' | 'refresh'): Promise<string[]> {
    const adapter = this.adapter(provider);
    if (!adapter.discover) throw new Error(`${provider} cannot list its whole catalog`);
    await this.assertNotPaused(provider);
    const run = await this.prisma.syncRun.create({ data: { provider } });
    try {
      const found = await adapter.discover();
      const previous = await this.prisma.syncRun.findFirst({
        where: { provider, status: 'done', id: { not: run.id } },
        orderBy: { startedAt: 'desc' },
      });
      if (previous?.found && found.length < previous.found * MIN_DISCOVERY_RATIO) {
        await this.prisma.syncRun.update({
          where: { id: run.id },
          data: { status: 'aborted', finishedAt: new Date(), found: found.length, note: `previous pass found ${previous.found}` },
        });
        this.logger.warn(`${provider}: discovery found ${found.length} titles (was ${previous.found}), ignored`);
        return [];
      }

      const known = new Set(
        (await this.prisma.providerTitle.findMany({ where: { provider }, select: { externalId: true } })).map((p) => p.externalId),
      );
      const foundSet = new Set(found);
      await this.markMissing(provider, [...known].filter((id) => !foundSet.has(id)));
      await this.prisma.providerTitle.updateMany({ where: { provider, externalId: { in: found } }, data: { missCount: 0, lastSeenAt: new Date() } });

      const toSync = mode === 'fill' ? found : found.filter((id) => !known.has(id));
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { status: 'done', finishedAt: new Date(), found: found.length, enqueued: toSync.length },
      });
      return toSync;
    } catch (err) {
      await this.prisma.syncRun.update({ where: { id: run.id }, data: { status: 'failed', finishedAt: new Date(), note: String(err) } });
      if (err instanceof HttpError && err.slowDown) await this.recordFailure(provider, err, SLOW_DOWN_PAUSE_MS);
      throw err;
    }
  }

  // Titles whose turn has come (adaptive rhythm), and expired videos off.
  // A full pass cut short by a restart (deploy, dev reload) stays "active" in
  // pg-boss for hours and then runs again on its own, even in manual mode.
  // There is one worker at a time: at its start, anything still running is an
  // orphan of the previous process.
  async closeInterruptedRuns(): Promise<number> {
    const jobs = await this.prisma.$executeRaw`
      UPDATE pgboss.job SET state = 'cancelled', completed_on = now()
       WHERE name = 'catalog-discover' AND state IN ('active', 'retry')`.catch(() => 0);
    await this.prisma.syncRun.updateMany({
      where: { status: 'running' },
      data: { status: 'failed', finishedAt: new Date(), note: 'interrotta: worker riavviato durante la passata' },
    });
    return jobs;
  }

  async checked(provider: string) {
    const now = new Date();
    await this.prisma.providerHealth.upsert({ where: { provider }, create: { provider, lastCheckAt: now }, update: { lastCheckAt: now } });
  }

  // Videos past their expiry date go off. Database only. Returns how many.
  async expireVideos(): Promise<number> {
    const now = new Date();
    const sources = await this.prisma.source.updateMany({ where: { available: true, expiresAt: { lt: now } }, data: { available: false } });
    const extras = await this.prisma.extra.updateMany({ where: { available: true, expiresAt: { lt: now } }, data: { available: false } });
    return sources.count + extras.count;
  }

  // A source's titles whose next check (adaptive rhythm) has come.
  async dueTitles(provider: string, limit = 1000) {
    return this.prisma.providerTitle.findMany({
      where: { provider, nextCheckAt: { lte: new Date() } },
      select: { provider: true, externalId: true },
      orderBy: { nextCheckAt: 'asc' },
      take: limit,
    });
  }

  // Titles that disappeared: one miss is tolerated, at the second their
  // videos go off. Nothing is deleted (progress and favourites stay).
  private async markMissing(provider: string, externalIds: string[]) {
    if (!externalIds.length) return;
    await this.prisma.providerTitle.updateMany({ where: { provider, externalId: { in: externalIds } }, data: { missCount: { increment: 1 } } });
    const gone = await this.prisma.providerTitle.findMany({
      where: { provider, externalId: { in: externalIds }, missCount: { gte: 2 } },
      select: { id: true, titleId: true },
    });
    if (!gone.length) return;
    await this.prisma.source.updateMany({ where: { providerTitleId: { in: gone.map((g) => g.id) } }, data: { available: false } });
    const titleIds = gone.map((g) => g.titleId).filter((id): id is string => !!id);
    await this.prisma.extra.updateMany({ where: { group: { provider, titleId: { in: titleIds } } }, data: { available: false } });
  }

  // ─── service health (circuit breaker) ─────────────────────────────────────

  private async assertNotPaused(provider: string) {
    const health = await this.prisma.providerHealth.findUnique({ where: { provider } });
    if (health?.status === 'DOWN' && health.retryAfter && health.retryAfter > new Date())
      throw new ProviderPausedError(`${provider} paused until ${health.retryAfter.toISOString()}`);
  }

  // `pauseNowMs`: pause at once for that long instead of after MAX_FAIL_STREAK errors.
  private async recordFailure(provider: string, err: unknown, pauseNowMs?: number) {
    const health = await this.prisma.providerHealth.upsert({
      where: { provider },
      create: { provider, failStreak: 1, lastError: String(err) },
      update: { failStreak: { increment: 1 }, lastError: String(err) },
    });
    if (pauseNowMs || health.failStreak >= MAX_FAIL_STREAK) {
      await this.prisma.providerHealth.update({
        where: { provider },
        data: { status: 'DOWN', retryAfter: new Date(Date.now() + (pauseNowMs ?? PAUSE_MS)) },
      });
      this.logger.error(`${provider} paused after ${health.failStreak} errors: ${String(err)}`);
    }
  }

  private async recordSuccess(provider: string) {
    await this.prisma.providerHealth.upsert({
      where: { provider },
      create: { provider, lastSuccessAt: new Date() },
      update: { status: 'OK', failStreak: 0, retryAfter: null, lastSuccessAt: new Date() },
    });
  }
}

function videoFields(v: { playback: { url: string } | null; drm: boolean; geoBlocked: boolean; durationSec: number | null; expiresAt: string | null }, now: Date) {
  return {
    playbackUrl: v.playback!.url,
    drm: v.drm,
    geoBlocked: v.geoBlocked,
    durationSec: v.durationSec,
    expiresAt: v.expiresAt ? new Date(v.expiresAt) : null,
    available: !v.drm,
    lastSeenAt: now,
  };
}
