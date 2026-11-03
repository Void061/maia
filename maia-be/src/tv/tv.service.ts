import { Injectable, NotFoundException } from '@nestjs/common';
import { CacheService } from '../cache/cache.service.js';
import { Prisma, type TitleKind } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogService } from './catalog/catalog.service.js';
import { presentExtras } from './extras.js';
import { assetUrl } from './providers/assets.js';
import type {
  GenreDto,
  HomeDto,
  PlaybackDto,
  TitleCardDto,
  TitleDetailDto,
  TitlePageDto,
} from './tv.dto.js';

// A video users can watch: listed by the service right now and not DRM-protected.
const PLAYABLE = { available: true, drm: false } as const;

// Titles with at least one playable video (the tree a user sees is the union
// of the available sources: docs/tv/catalog.md).
export const VISIBLE: Prisma.TitleWhereInput = {
  OR: [
    { kind: 'MOVIE', sources: { some: PLAYABLE } },
    {
      kind: 'SERIES',
      seasons: {
        some: { episodes: { some: { sources: { some: PLAYABLE } } } },
      },
    },
  ],
};

const CARD = {
  id: true,
  kind: true,
  name: true,
  year: true,
  genres: true,
  overview: true,
  posterPath: true,
  posterSource: true,
  backdropPath: true,
  backdropSource: true,
  sources: { where: PLAYABLE, select: { durationSec: true }, take: 1 },
  _count: { select: { seasons: true } },
} satisfies Prisma.TitleSelect;

type CardRow = Prisma.TitleGetPayload<{ select: typeof CARD }>;

const toCard = (t: CardRow): TitleCardDto => ({
  id: t.id,
  kind: t.kind,
  name: t.name,
  year: t.year,
  genres: t.genres,
  overview: t.overview,
  posterUrl: assetUrl(t.posterPath, t.posterSource, 'poster'),
  backdropUrl: assetUrl(t.backdropPath, t.backdropSource, 'backdrop'),
  thumbUrl: assetUrl(t.backdropPath, t.backdropSource, 'thumb'),
  minutes:
    t.kind === 'MOVIE' && t.sources[0]?.durationSec
      ? Math.round(t.sources[0].durationSec / 60)
      : null,
  seasons: t.kind === 'SERIES' ? t._count.seasons : null,
});

const minutes = (sec: number | null | undefined) =>
  sec ? Math.round(sec / 60) : null;

// "Giallo and Crime" -> "giallo-and-crime": stable ids for genre pages.
export const genreSlug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const ROW_SIZE = 20;
const HOME_GENRES = 8;

// Cache keys (Redis, under the MAIA_APP_ prefix). Every catalog job drops them all.
const KEY = {
  home: 'tv:home',
  genres: (kind?: TitleKind) => `tv:genres:${kind ?? 'ALL'}`,
  titles: (q: object) => `tv:titles:${JSON.stringify(q)}`,
  title: (id: string) => `tv:title:${id}`,
  playback: (itemId: string) => `tv:playback:${itemId}`,
};

// A genre as shown, plus every spelling the services use for it: RaiPlay
// writes the same genre as "Musica" and "musica", "Storia & arte" and
// "storia & arte". They share the slug and count as one.
type GenreGroup = GenreDto & { names: string[] };

const capitalize = (s: string) =>
  s.charAt(0).toLocaleUpperCase('it-IT') + s.slice(1);

type TitlesQuery = {
  kind?: TitleKind;
  genre?: string;
  q?: string;
  skip: number;
  take: number;
};

@Injectable()
export class TvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly catalog: CatalogService,
  ) {}

  private cards(
    where: Prisma.TitleWhereInput,
    take = ROW_SIZE,
    skip = 0,
    orderBy: Prisma.TitleOrderByWithRelationInput = { createdAt: 'desc' },
  ) {
    return this.prisma.title
      .findMany({
        where: { AND: [VISIBLE, where] },
        select: CARD,
        orderBy: [orderBy, { id: 'asc' }],
        take,
        skip,
      })
      .then((rows) => rows.map(toCard));
  }

  // Genres of the visible titles, most used first.
  async genres(kind?: TitleKind): Promise<GenreDto[]> {
    return (await this.genreGroups(kind)).map(({ slug, name, count }) => ({
      slug,
      name,
      count,
    }));
  }

  private genreGroups(kind?: TitleKind): Promise<GenreGroup[]> {
    return this.cache.wrap(KEY.genres(kind), () => this.loadGenres(kind));
  }

  private async loadGenres(kind?: TitleKind): Promise<GenreGroup[]> {
    const kindFilter = kind
      ? Prisma.sql`AND t.kind = ${kind}::"TitleKind"`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ name: string; count: number }[]>`
      SELECT g AS name, count(*)::int AS count
        FROM titles t CROSS JOIN LATERAL unnest(t.genres) AS g
       WHERE ((t.kind = 'MOVIE' AND EXISTS (
                SELECT 1 FROM sources s WHERE s.title_id = t.id AND s.available AND NOT s.drm))
           OR (t.kind = 'SERIES' AND EXISTS (
                SELECT 1 FROM sources s JOIN episodes e ON e.id = s.episode_id JOIN seasons se ON se.id = e.season_id
                 WHERE se.title_id = t.id AND s.available AND NOT s.drm)))
             ${kindFilter}
       GROUP BY g
       ORDER BY count DESC, g`;
    const bySlug = new Map<string, GenreGroup>();
    for (const r of rows) {
      const slug = genreSlug(r.name);
      const group = bySlug.get(slug);
      // Rows come most used first: the first spelling names the genre.
      if (group) {
        group.count += r.count;
        group.names.push(r.name);
      } else {
        bySlug.set(slug, {
          slug,
          name: capitalize(r.name),
          count: r.count,
          names: [r.name],
        });
      }
    }
    return [...bySlug.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'it'),
    );
  }

  // Every spelling of the genre behind a slug (empty = unknown genre).
  private async genreNames(slug: string): Promise<string[]> {
    return (await this.genreGroups()).find((g) => g.slug === slug)?.names ?? [];
  }

  home(): Promise<HomeDto> {
    return this.cache.wrap(KEY.home, () => this.loadHome());
  }

  private async loadHome(): Promise<HomeDto> {
    const featured = await this.cards(
      {
        backdropPath: { not: null },
        tmdbId: { not: null },
        overview: { not: '' },
      },
      6,
      0,
      { updatedAt: 'desc' },
    );
    const rows: HomeDto['rows'] = [
      { key: 'new', name: 'Novità', genre: null, items: await this.cards({}) },
      {
        key: 'movies',
        name: 'Film',
        genre: null,
        items: await this.cards({ kind: 'MOVIE' }),
      },
      {
        key: 'series',
        name: 'Serie e programmi',
        genre: null,
        items: await this.cards({ kind: 'SERIES' }),
      },
    ];
    for (const g of (await this.genreGroups()).slice(0, HOME_GENRES)) {
      rows.push({
        key: `genre-${g.slug}`,
        name: g.name,
        genre: g.slug,
        items: await this.cards({ genres: { hasSome: g.names } }),
      });
    }
    return { featured, rows: rows.filter((r) => r.items.length > 0) };
  }

  titles(q: {
    kind?: TitleKind;
    genre?: string;
    q?: string;
    skip?: number;
    take?: number;
  }): Promise<TitlePageDto> {
    const query: TitlesQuery = {
      kind: q.kind,
      genre: q.genre,
      q: q.q?.trim().toLowerCase() || undefined,
      skip: q.skip ?? 0,
      take: q.take ?? 60,
    };
    return this.cache.wrap(KEY.titles(query), () => this.loadTitles(query));
  }

  private async loadTitles(q: TitlesQuery): Promise<TitlePageDto> {
    const where: Prisma.TitleWhereInput = {};
    if (q.kind) where.kind = q.kind;
    if (q.genre) {
      const names = await this.genreNames(q.genre);
      if (!names.length) return { items: [], total: 0 };
      where.genres = { hasSome: names };
    }
    if (q.q) where.name = { contains: q.q, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      this.cards(
        where,
        q.take,
        q.skip,
        q.q ? { name: 'asc' } : { createdAt: 'desc' },
      ),
      this.prisma.title.count({ where: { AND: [VISIBLE, where] } }),
    ]);
    return { items, total };
  }

  title(id: string): Promise<TitleDetailDto> {
    return this.cache.wrap(KEY.title(id), () => this.loadTitle(id));
  }

  private async loadTitle(id: string): Promise<TitleDetailDto> {
    const t = await this.prisma.title.findFirst({
      where: { AND: [VISIBLE, { id }] },
      select: {
        ...CARD,
        originalName: true,
        seasons: {
          orderBy: { number: 'asc' },
          select: {
            number: true,
            episodes: {
              where: { sources: { some: PLAYABLE } },
              orderBy: [
                { number: { sort: 'asc', nulls: 'last' } },
                { airDate: 'asc' },
              ],
              select: {
                id: true,
                number: true,
                name: true,
                airDate: true,
                imagePath: true,
                imageSource: true,
                sources: {
                  where: PLAYABLE,
                  select: { durationSec: true },
                  take: 1,
                },
              },
            },
          },
        },
        extraGroups: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            kind: true,
            label: true,
            seasonNumber: true,
            extras: {
              where: { available: true },
              orderBy: { position: 'asc' },
              select: {
                id: true,
                name: true,
                durationSec: true,
                imagePath: true,
                imageSource: true,
              },
            },
          },
        },
      },
    });
    if (!t)
      throw new NotFoundException({
        code: 'TITLE_NOT_FOUND',
        message: 'Titolo non trovato.',
      });

    const seasonList = t.seasons
      .filter((s) => s.episodes.length > 0)
      .map((s) => ({
        number: s.number,
        episodes: s.episodes.map((e) => ({
          id: e.id,
          season: s.number,
          number: e.number,
          name: e.name,
          airDate: e.airDate ? e.airDate.toISOString().slice(0, 10) : null,
          minutes: minutes(e.sources[0]?.durationSec),
          imageUrl: assetUrl(e.imagePath, e.imageSource, 'thumb'),
        })),
      }));
    const similar = t.genres.length
      ? (
          await this.cards(
            {
              kind: t.kind,
              genres: { hasSome: t.genres.slice(0, 2) },
              id: { not: t.id },
            },
            18,
          )
        ).slice(0, 18)
      : [];
    return {
      ...toCard(t),
      seasons: t.kind === 'SERIES' ? seasonList.length : null,
      originalName: t.originalName,
      seasonList,
      extras: presentExtras(
        t.extraGroups
          .filter((g) => g.extras.length > 0)
          .map((g) => ({
            id: g.id,
            kind: g.kind,
            label: g.label,
            season: g.seasonNumber,
            items: g.extras.map((x) => ({
              id: x.id,
              name: x.name,
              minutes: minutes(x.durationSec),
              imageUrl: assetUrl(x.imagePath, x.imageSource, 'thumb'),
            })),
          })),
        t.name,
        new Set(
          seasonList.flatMap((s) =>
            s.episodes.map((e) => e.airDate).filter((d): d is string => !!d),
          ),
        ),
      ),
      similar,
    };
  }

  // The best source for a movie, an episode or an extra: services that work
  // first, then the fewest recent failures. `exclude` skips the providers that
  // just failed on this device (not cached: that depends on the device).
  playback(itemId: string, exclude: string[] = []): Promise<PlaybackDto> {
    if (exclude.length) return this.loadPlayback(itemId, exclude);
    return this.cache.wrap(KEY.playback(itemId), () =>
      this.loadPlayback(itemId, []),
    );
  }

  private async loadPlayback(
    itemId: string,
    exclude: string[],
  ): Promise<PlaybackDto> {
    const extra = await this.prisma.extra.findFirst({
      where: {
        id: itemId,
        available: true,
        group: { provider: { notIn: exclude } },
      },
      select: {
        playbackUrl: true,
        durationSec: true,
        group: { select: { provider: true } },
      },
    });
    if (extra)
      return {
        itemId,
        provider: extra.group.provider,
        type: 'native-hls',
        url: extra.playbackUrl,
        durationSec: extra.durationSec,
      };

    const sources = await this.prisma.source.findMany({
      where: {
        ...PLAYABLE,
        provider: { notIn: exclude },
        OR: [{ titleId: itemId }, { episodeId: itemId }],
      },
      orderBy: [{ failCount: 'asc' }, { lastSeenAt: 'desc' }],
    });
    const down = new Set(
      (
        await this.prisma.providerHealth.findMany({
          where: { status: 'DOWN' },
          select: { provider: true },
        })
      ).map((h) => h.provider),
    );
    const best = sources.find((s) => !down.has(s.provider)) ?? sources[0];
    if (!best)
      throw new NotFoundException({
        code: 'NO_SOURCE',
        message: 'Questo contenuto ora non è disponibile.',
      });
    return {
      itemId,
      provider: best.provider,
      type: 'native-hls',
      url: best.playbackUrl,
      durationSec: best.durationSec,
    };
  }

  // The device could not play it: counted, so the next viewers get another
  // source first. After CACHE_MAX_FAILS reports the cached choice is dropped
  // and computed again with the new counts.
  async playbackFailed(itemId: string, provider: string) {
    await this.prisma.source.updateMany({
      where: { provider, OR: [{ titleId: itemId }, { episodeId: itemId }] },
      data: { failCount: { increment: 1 } },
    });
    if (await this.cache.fail(KEY.playback(itemId)))
      await this.playback(itemId).catch(() => undefined);
  }

  // Fallback for a source the device's native HLS rejected: the direct
  // playlist URL, resolved here, for hls.js. Never cached (it expires in minutes).
  async stream(itemId: string, provider: string): Promise<PlaybackDto> {
    const unavailable = () =>
      new NotFoundException({
        code: 'NO_SOURCE',
        message: 'Questo contenuto ora non è disponibile.',
      });
    const adapter = this.catalog.adapters[provider];
    if (!adapter?.resolveStream) throw unavailable();
    const others = Object.keys(this.catalog.adapters).filter(
      (id) => id !== provider,
    );
    const source = await this.loadPlayback(itemId, others).catch(() => null);
    const url =
      source && (await adapter.resolveStream(source.url).catch(() => null));
    if (!source || !url) throw unavailable();
    return { ...source, type: 'hls', url };
  }
}
