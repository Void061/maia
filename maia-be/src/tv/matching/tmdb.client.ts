import { politeJson } from '../providers/polite-fetch.js';
import type { TmdbSeasonEpisodes } from './episodes.js';
import type { Candidate } from './score.js';

// What the catalog keeps from TMDB for a title page.
export type TmdbMeta = {
  name: string;
  originalName: string;
  year: number | null;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  genres: string[];
  // Series: when the next episode airs (to check the services on that day).
  nextEpisodeAt: string | null;
};

type Details = {
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: { name: string }[];
  next_episode_to_air?: { air_date?: string } | null;
};

// Minimal TMDB v3 client for matching. Accepts either the v3 API key or the
// v4 read access token (the long "eyJ..." one) as TMDB_API_KEY.
const API = 'https://api.themoviedb.org/3';

type SearchMovie = { id: number; title: string; original_title: string; release_date?: string };
type SearchTv = { id: number; name: string; original_name: string; first_air_date?: string };
type MovieDetails = { runtime?: number | null };
type TvDetails = {
  last_air_date?: string | null;
  seasons?: { season_number: number; episode_count: number; air_date?: string | null }[];
};

export class TmdbClient {
  constructor(private readonly key: string) {}

  private get<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(API + path);
    url.searchParams.set('language', 'it-IT');
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    const isToken = this.key.startsWith('eyJ');
    if (!isToken) url.searchParams.set('api_key', this.key);
    return politeJson<T>(url.toString(), {
      minGapMs: 40,
      serial: false,
      headers: isToken ? { Authorization: `Bearer ${this.key}` } : {},
    });
  }

  // Top candidates for a movie, with runtime (needs one details call each).
  async movieCandidates(title: string, year: number | null, limit = 4): Promise<Candidate[]> {
    const found = await this.searchWithFallback<SearchMovie>('/search/movie', title, year, 'year');
    const top = found.slice(0, limit);
    return Promise.all(
      top.map(async (m) => {
        const details = await this.get<MovieDetails>(`/movie/${m.id}`, {});
        return {
          tmdbId: m.id,
          title: m.title,
          originalTitle: m.original_title,
          year: toYear(m.release_date),
          runtimeMin: details.runtime ?? null,
        };
      }),
    );
  }

  // Top candidates for a series, with episodes per season.
  async tvCandidates(title: string, year: number | null, limit = 4): Promise<Candidate[]> {
    const found = await this.searchWithFallback<SearchTv>('/search/tv', title, year, 'first_air_date_year');
    const top = found.slice(0, limit);
    return Promise.all(
      top.map(async (s) => {
        const details = await this.get<TvDetails>(`/tv/${s.id}`, {});
        const seasonEpisodeCounts: Record<number, number> = {};
        const seasonYears: Record<number, number> = {};
        for (const season of details.seasons ?? []) {
          seasonEpisodeCounts[season.season_number] = season.episode_count;
          const year = toYear(season.air_date ?? undefined);
          // Season 0 holds the specials, aired over many years: not an edition.
          if (season.season_number > 0 && year) seasonYears[season.season_number] = year;
        }
        return {
          tmdbId: s.id,
          title: s.name,
          originalTitle: s.original_name,
          year: toYear(s.first_air_date),
          lastYear: toYear(details.last_air_date ?? undefined),
          seasonEpisodeCounts,
          seasonYears,
        };
      }),
    );
  }

  async meta(kind: 'MOVIE' | 'SERIES', id: number): Promise<TmdbMeta> {
    const d = await this.get<Details>(kind === 'MOVIE' ? `/movie/${id}` : `/tv/${id}`, {});
    return {
      name: d.title ?? d.name ?? '',
      originalName: d.original_title ?? d.original_name ?? '',
      year: toYear(d.release_date ?? d.first_air_date),
      overview: d.overview ?? '',
      posterPath: d.poster_path ?? null,
      backdropPath: d.backdrop_path ?? null,
      genres: (d.genres ?? []).map((g) => g.name),
      nextEpisodeAt: d.next_episode_to_air?.air_date ?? null,
    };
  }

  // Season numbers of a series (0 = specials included).
  async seasonNumbers(tvId: number): Promise<number[]> {
    const d = await this.get<TvDetails>(`/tv/${tvId}`, {});
    return (d.seasons ?? []).map((s) => s.season_number);
  }

  // Episodes (number, name, air date) of one season.
  async season(tvId: number, number: number): Promise<TmdbSeasonEpisodes> {
    const s = await this.get<{ air_date?: string; episodes?: { episode_number: number; air_date?: string | null; name?: string }[] }>(
      `/tv/${tvId}/season/${number}`,
      {},
    );
    return {
      number,
      year: toYear(s.air_date),
      episodes: (s.episodes ?? []).map((e) => ({ number: e.episode_number, airDate: e.air_date ?? null, name: e.name ?? '' })),
    };
  }

  // Results with the year first, then without it: the service's year can be the
  // current edition's (RaiPlay: "Ballando con le Stelle" 2026, on TMDB since 2005)
  // or plain wrong. The scorer sorts it out.
  private async searchWithFallback<T extends { id: number }>(
    path: string,
    query: string,
    year: number | null,
    yearParam: string,
  ): Promise<T[]> {
    const withYear = year ? (await this.get<{ results: T[] }>(path, { query, [yearParam]: year })).results : [];
    const any = (await this.get<{ results: T[] }>(path, { query })).results;
    const seen = new Set<number>();
    return [...withYear.slice(0, 2), ...any].filter((r) => !seen.has(r.id) && seen.add(r.id));
  }
}

function toYear(date: string | undefined): number | null {
  const y = Number.parseInt(date?.slice(0, 4) ?? '', 10);
  return Number.isFinite(y) ? y : null;
}
