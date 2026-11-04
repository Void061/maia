import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service.js';
import type { TitleKind } from '../generated/prisma/client.js';
import { genreSlug } from './genre-slug.js';
import { TmdbClient, toYear } from './matching/tmdb.client.js';
import { assetUrl } from './providers/assets.js';
import { HttpError } from './providers/polite-fetch.js';
import type { GenreDto, HomeDto, SeasonDto, TitleCardDto, TitleDetailDto, TitlePageDto } from './tv.dto.js';

// The catalog read live from TMDB, with nothing saved in the database
// (TV_CATALOG=tmdb, docs/decisions.md): same answers as TvService, so the
// screens do not change. Every TMDB answer goes through the cache, shared by
// all users: a screen seen before costs TMDB nothing.

const PAGE_SIZE = 20;
// TMDB serves at most 500 pages of any list.
const MAX_PAGE = 500;
// Titles per request, however many a screen asks for: three TMDB pages.
const MAX_TAKE = 60;
const ROW_SIZE = 20;
const HOME_GENRES = 8;
const FEATURED = 6;
const SIMILAR = 18;
// TMDB appends at most 20 sub-requests to one call.
const SEASONS_PER_CALL = 20;
// Keeps the titles nobody voted on (often duplicates or junk) out of the genres.
const MIN_VOTES = 50;

const PATH: Record<TitleKind, 'movie' | 'tv'> = { MOVIE: 'movie', SERIES: 'tv' };
const ID_PREFIX: Record<TitleKind, string> = { MOVIE: 'movie', SERIES: 'series' };

type Params = Record<string, string | number>;

type Item = {
  id: number;
  media_type?: string;
  adult?: boolean;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genre_ids?: number[];
};
type List = { results: Item[]; total_results?: number };
type GenreList = { genres: { id: number; name: string }[] };
type Video = { key: string; site: string; type: string; iso_639_1: string };
type Details = Omit<Item, 'genre_ids'> & {
  original_title?: string;
  original_name?: string;
  genres?: { id: number; name: string }[];
  runtime?: number | null;
  seasons?: { season_number: number; episode_count: number }[];
  videos?: { results: Video[] };
  recommendations?: List;
};
type Season = {
  season_number: number;
  episodes?: { episode_number: number; name?: string; air_date?: string | null; runtime?: number | null; still_path?: string | null }[];
};

// A list to read: `kind` null when TMDB tells it title by title (multi search).
type Feed = { kind: TitleKind | null; path: string; params: Params };

type Genres = {
  all: (GenreDto & { ids: Partial<Record<TitleKind, number>> })[];
  names: Record<TitleKind, Map<number, string>>;
};

export const titleId = (kind: TitleKind, tmdbId: number) => `${ID_PREFIX[kind]}-${tmdbId}`;

export function parseId(id: string): { kind: TitleKind; tmdbId: number } | null {
  const m = /^(movie|series)-(\d+)$/.exec(id);
  return m ? { kind: m[1] === 'movie' ? 'MOVIE' : 'SERIES', tmdbId: Number(m[2]) } : null;
}

// Which TMDB pages hold `take` titles after `skip`, and where they start in the first one.
export function pagesFor(skip: number, take: number) {
  const first = Math.floor(skip / PAGE_SIZE) + 1;
  const last = Math.min(Math.ceil((skip + take) / PAGE_SIZE), MAX_PAGE);
  const pages = Array.from({ length: Math.max(last - first + 1, 0) }, (_, i) => first + i);
  return { pages, offset: skip % PAGE_SIZE };
}

// One from each list in turn: film and series side by side in a genre.
export function interleave<T>(lists: T[][]): T[] {
  const longest = Math.max(0, ...lists.map((l) => l.length));
  return Array.from({ length: longest }, (_, i) => lists.flatMap((l) => (i < l.length ? [l[i]] : []))).flat();
}

// The best video to show as trailer: Italian first, a real trailer before a teaser.
export function pickTrailer(videos: Video[]): string | null {
  const score = (v: Video) => (v.type === 'Trailer' ? 2 : 0) + (v.iso_639_1 === 'it' ? 1 : 0);
  const best = videos
    .filter((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
    .sort((a, b) => score(b) - score(a))[0];
  return best ? `https://www.youtube-nocookie.com/embed/${best.key}` : null;
}

const notFound = () => new NotFoundException({ code: 'TITLE_NOT_FOUND', message: 'Titolo non trovato.' });

const kindOf = (item: Item, fallback: TitleKind | null): TitleKind | null =>
  item.media_type === 'movie' ? 'MOVIE' : item.media_type === 'tv' ? 'SERIES' : item.media_type ? null : fallback;

function toCard(item: Item, kind: TitleKind, names: Map<number, string>): TitleCardDto {
  return {
    id: titleId(kind, item.id),
    kind,
    name: item.title ?? item.name ?? '',
    year: toYear(item.release_date ?? item.first_air_date),
    genres: (item.genre_ids ?? []).flatMap((id) => names.get(id) ?? []),
    overview: item.overview ?? '',
    posterUrl: assetUrl(item.poster_path ?? null, 'tmdb', 'poster'),
    backdropUrl: assetUrl(item.backdrop_path ?? null, 'tmdb', 'backdrop'),
    thumbUrl: assetUrl(item.backdrop_path ?? null, 'tmdb', 'thumb'),
    minutes: null,
    seasons: null,
  };
}

@Injectable()
export class TmdbCatalogService {
  private readonly tmdb: TmdbClient | null;
  readonly enabled: boolean;

  constructor(
    config: ConfigService,
    private readonly cache: CacheService,
  ) {
    const key = config.get<string>('TMDB_API_KEY');
    this.tmdb = key ? new TmdbClient(key) : null;
    this.enabled = !!key && config.get<string>('TV_CATALOG') === 'tmdb';
  }

  private read<T>(path: string, params: Params = {}): Promise<T> {
    return this.cache.wrap(`tmdb:${path}:${JSON.stringify(params)}`, () => this.tmdb!.read<T>(path, params));
  }

  private async genreTable(): Promise<Genres> {
    const [movie, tv] = await Promise.all([this.read<GenreList>('/genre/movie/list'), this.read<GenreList>('/genre/tv/list')]);
    const bySlug = new Map<string, Genres['all'][number]>();
    const add = (kind: TitleKind, list: GenreList) => {
      for (const g of list.genres) {
        const slug = genreSlug(g.name);
        const genre = bySlug.get(slug) ?? { slug, name: g.name, count: 0, ids: {} };
        genre.ids[kind] = g.id;
        bySlug.set(slug, genre);
      }
    };
    add('MOVIE', movie);
    add('SERIES', tv);
    return {
      all: [...bySlug.values()],
      names: {
        MOVIE: new Map(movie.genres.map((g) => [g.id, g.name])),
        SERIES: new Map(tv.genres.map((g) => [g.id, g.name])),
      },
    };
  }

  // Every genre with a picture: the first page of its list, the same request
  // its row makes, so the cache serves both.
  async genres(kind?: TitleKind): Promise<GenreDto[]> {
    const table = await this.genreTable();
    const shown = table.all.filter((g) => !kind || g.ids[kind] !== undefined);
    const lists = await Promise.all(
      shown.map((g) => {
        const k = kind ?? (g.ids.MOVIE !== undefined ? 'MOVIE' : 'SERIES');
        return this.row(this.discover(k, g.ids[k]!), table);
      }),
    );
    // The same hit tops many genres: each card takes the first picture still free.
    const used = new Set<string>();
    return shown.map(({ slug, name, count }, i) => {
      const pictures = lists[i].flatMap((t) => t.backdropUrl ?? []);
      const imageUrl = pictures.find((url) => !used.has(url)) ?? pictures[0] ?? null;
      if (imageUrl) used.add(imageUrl);
      return { slug, name, count, imageUrl };
    });
  }

  private cards(list: List, fallback: TitleKind | null, genres: Genres): TitleCardDto[] {
    return list.results.flatMap((item) => {
      const kind = kindOf(item, fallback);
      return kind && !item.adult ? [toCard(item, kind, genres.names[kind])] : [];
    });
  }

  private async feed(feed: Feed, skip: number, take: number, genres: Genres) {
    const { pages, offset } = pagesFor(skip, take);
    const lists = await Promise.all(pages.map((page) => this.read<List>(feed.path, { ...feed.params, page })));
    // A title that moves up while TMDB's list changes shows up on two pages.
    const seen = new Set<string>();
    const items = lists.flatMap((l) => this.cards(l, feed.kind, genres)).filter((t) => !seen.has(t.id) && seen.add(t.id));
    const total = Math.min(lists[0]?.total_results ?? 0, MAX_PAGE * PAGE_SIZE);
    return { items: items.slice(offset, offset + take), total };
  }

  private row(feed: Feed, genres: Genres) {
    return this.feed(feed, 0, ROW_SIZE, genres).then((r) => r.items);
  }

  private discover(kind: TitleKind, genreId: number): Feed {
    return {
      kind,
      path: `/discover/${PATH[kind]}`,
      params: { with_genres: genreId, sort_by: 'popularity.desc', 'vote_count.gte': MIN_VOTES, include_adult: 'false' },
    };
  }

  async home(): Promise<HomeDto> {
    const genres = await this.genreTable();
    const region = { region: 'IT' };
    const homeGenres = genres.all.filter((g) => g.ids.MOVIE !== undefined).slice(0, HOME_GENRES);
    const [trending, news, movies, series, topMovies, topSeries, ...genreRows] = await Promise.all([
      this.row({ kind: null, path: '/trending/all/week', params: {} }, genres),
      this.row({ kind: 'MOVIE', path: '/movie/now_playing', params: region }, genres),
      this.row({ kind: 'MOVIE', path: '/movie/popular', params: region }, genres),
      this.row({ kind: 'SERIES', path: '/tv/popular', params: {} }, genres),
      this.row({ kind: 'MOVIE', path: '/movie/top_rated', params: region }, genres),
      this.row({ kind: 'SERIES', path: '/tv/top_rated', params: {} }, genres),
      ...homeGenres.map((g) => this.row(this.discover('MOVIE', g.ids.MOVIE!), genres)),
    ]);
    const rows: HomeDto['rows'] = [
      { key: 'new', name: 'Novità', genre: null, items: news },
      { key: 'movies', name: 'Film popolari', genre: null, items: movies },
      { key: 'series', name: 'Serie popolari', genre: null, items: series },
      { key: 'movies-top', name: 'Film più votati', genre: null, items: topMovies },
      { key: 'series-top', name: 'Serie più votate', genre: null, items: topSeries },
      ...homeGenres.map((g, i) => ({ key: `genre-${g.slug}`, name: g.name, genre: g.slug, items: genreRows[i] })),
    ];
    return {
      featured: trending.filter((t) => t.backdropUrl && t.overview).slice(0, FEATURED),
      rows: rows.filter((r) => r.items.length > 0),
    };
  }

  async titles(q: { kind?: TitleKind; genre?: string; q?: string; skip?: number; take?: number }): Promise<TitlePageDto> {
    const genres = await this.genreTable();
    const feeds = this.feedsFor(q, genres);
    if (!feeds.length) return { items: [], total: 0 };
    const take = Math.min(q.take ?? MAX_TAKE, MAX_TAKE);
    const share = Math.ceil(take / feeds.length);
    const skip = Math.floor((q.skip ?? 0) / feeds.length);
    const parts = await Promise.all(feeds.map((f) => this.feed(f, skip, share, genres)));
    return {
      items: interleave(parts.map((p) => p.items)).slice(0, take),
      total: parts.reduce((sum, p) => sum + p.total, 0),
    };
  }

  private feedsFor(q: { kind?: TitleKind; genre?: string; q?: string }, genres: Genres): Feed[] {
    const kinds: TitleKind[] = q.kind ? [q.kind] : ['MOVIE', 'SERIES'];
    const text = q.q?.trim();
    if (text) {
      const params = { query: text, include_adult: 'false' };
      return q.kind ? [{ kind: q.kind, path: `/search/${PATH[q.kind]}`, params }] : [{ kind: null, path: '/search/multi', params }];
    }
    if (q.genre) {
      const genre = genres.all.find((g) => g.slug === q.genre);
      return kinds.flatMap((k) => {
        const id = genre?.ids[k];
        return id === undefined ? [] : [this.discover(k, id)];
      });
    }
    return kinds.map((kind) => ({ kind, path: `/${PATH[kind]}/popular`, params: {} }));
  }

  async title(id: string): Promise<TitleDetailDto> {
    const parsed = parseId(id);
    if (!parsed) throw notFound();
    const { kind, tmdbId } = parsed;
    const path = `/${PATH[kind]}/${tmdbId}`;
    const [d, genres] = await Promise.all([
      this.read<Details>(path, { append_to_response: 'videos,recommendations', include_video_language: 'it,en' }).catch((err: unknown) => {
        throw err instanceof HttpError && err.status === 404 ? notFound() : err;
      }),
      this.genreTable(),
    ]);
    const seasonList = kind === 'SERIES' ? await this.seasons(d, path, id) : [];
    return {
      ...toCard(d, kind, genres.names[kind]),
      genres: (d.genres ?? []).map((g) => g.name),
      minutes: kind === 'MOVIE' ? (d.runtime ?? null) : null,
      seasons: kind === 'SERIES' ? seasonList.length : null,
      originalName: d.original_title ?? d.original_name ?? null,
      trailerUrl: pickTrailer(d.videos?.results ?? []),
      seasonList,
      extras: [],
      similar: this.cards(d.recommendations ?? { results: [] }, kind, genres).slice(0, SIMILAR),
    };
  }

  // Episodes of every season, 20 seasons per request. Specials (season 0) only
  // when a series has nothing else.
  private async seasons(d: Details, path: string, id: string): Promise<SeasonDto[]> {
    const filled = (d.seasons ?? []).filter((s) => s.episode_count > 0);
    const regular = filled.filter((s) => s.season_number > 0);
    const numbers = (regular.length ? regular : filled).map((s) => s.season_number);
    const batches = Array.from({ length: Math.ceil(numbers.length / SEASONS_PER_CALL) }, (_, i) =>
      numbers.slice(i * SEASONS_PER_CALL, (i + 1) * SEASONS_PER_CALL),
    );
    const answers = await Promise.all(
      batches.map((batch) =>
        this.read<Record<string, Season>>(path, { append_to_response: batch.map((n) => `season/${n}`).join(',') }).then((r) =>
          batch.flatMap((n) => r[`season/${n}`] ?? []),
        ),
      ),
    );
    return answers.flat().map((s) => ({
      number: s.season_number,
      episodes: (s.episodes ?? []).map((e) => ({
        id: `${id}-s${s.season_number}e${e.episode_number}`,
        season: s.season_number,
        number: e.episode_number,
        name: e.name ?? '',
        airDate: e.air_date ?? null,
        minutes: e.runtime ?? null,
        imageUrl: assetUrl(e.still_path ?? null, 'tmdb', 'thumb'),
      })),
    }));
  }
}
