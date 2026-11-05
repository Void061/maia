import { baseUrl } from '../base-urls.js';
import { HttpError, politeText } from '../polite-fetch.js';
import type {
  SdmEpisode,
  SdmKind,
  SdmMovie,
  SdmSearchFilters,
  SdmSearchPage,
  SdmSearchResult,
  SdmSeason,
  SdmSeries,
} from './sdm.types.js';

interface VideoCheckResult {
  serverUrl: string;
  masterPlaylistParams: Record<string, string | number | boolean | null>;
  playlistUrl: string;
  canPlayFHD: boolean;
  urlParams: URLSearchParams;
}

// SDM: the user's own media server at home (default http://192.168.1.9,
// changeable from the admin panel). Its pages carry their data as JSON in an
// HTML attribute (Inertia.js style, `data-page="{...}"`): every list, title and
// season is read from there. Nothing about the server is fixed in the code
// below the CONFIG block.
const host = () => baseUrl('sdm');

const CONFIG = {
  archive: {
    params: {
      search: 'search',
      page: 'page',
      type: 'type',
      year: 'year',
    },
  },
  // Replaces the {lang} placeholder in the paths.
  lang: 'it',

  // HTML attribute holding the page's JSON.
  dataAttr: 'data-page',

  // Paths after the address. Placeholders: {lang} {id} {slug} {number} {title_id} {episode_id}.
  paths: {
    title: '/{lang}/titles/{id}-{slug}',
    archive: '/{lang}/archive',
    movie: '/{lang}/watch/{id}',
    season: '/season-{number}',
    episode: '/{lang}/iframe/{title_id}?episode_id={episode_id}',
  },

  // Turns a title's or episode's URL into the player's: [search, replace]. null = as it is.
  playerReplace: ['/watch/', '/iframe/'] as [string, string] | null,

  // Keys of the page's JSON.
  keys: {
    props: 'props',
    titles: 'titles',
    title: 'title',
    seasons: 'seasons',
    loadedSeason: 'loadedSeason',
    episodes: 'episodes',
  },

  // Fields of every title / episode in the JSON.
  fields: {
    name: 'name',
    type: 'type',
    id: 'id',
    slug: 'slug',
    plot: 'plot',
    genres: 'genres',
    genreName: 'name',
    releaseDate: 'release_date',
    translations: 'translations',
    epNumber: 'number',
    epName: 'name',
    epId: 'id',
    seNumber: 'number',
    seTitleId: 'title_id',
  },

  // The JSON's "type" field mapped on MAIA's kinds.
  typeMap: { movie: 'MOVIE', tv: 'SERIES' } as Record<string, SdmKind>,
};

type Json = Record<string, unknown>;
type PathKey = keyof typeof CONFIG.paths;

const K = CONFIG.keys;
const F = CONFIG.fields;

export function buildUrl(
  key: PathKey,
  values: Record<string, string | number> = {},
): string {
  const all: Record<string, string | number> = { lang: CONFIG.lang, ...values };
  return (
    host() +
    CONFIG.paths[key].replace(/\{(\w+)\}/g, (_, name: string) =>
      encodeURIComponent(String(all[name] ?? '')),
    )
  );
}

const playerUrl = (url: string) =>
  CONFIG.playerReplace
    ? url.replace(CONFIG.playerReplace[0], CONFIG.playerReplace[1])
    : url;

// The JSON in the page's data attribute, entities decoded.
export function pageData(html: string): Json {
  const attr = CONFIG.dataAttr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const raw = new RegExp(`${attr}="([^"]+)`).exec(html)?.[1];
  if (!raw) throw new Error(`SDM page without ${CONFIG.dataAttr}`);
  return JSON.parse(decodeEntities(raw)) as Json;
}

async function props(url: string): Promise<Json> {
  return (pageData(await politeText(url))[K.props] ?? {}) as Json;
}

// A page the server no longer has is an unavailable title, not a failure: null.
// Every other error (5xx, 403/429, service switched off) reaches the caller.
async function unlessGone<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    if (err instanceof HttpError && (err.status === 404 || err.status === 410))
      return null;
    throw err;
  }
}

// Lists may come grouped (an array of arrays): flattened.
function flatten(records: unknown): Json[] {
  if (!Array.isArray(records)) return [];
  return (
    Array.isArray(records[0]) ? (records as unknown[][]).flat() : records
  ) as Json[];
}

// External ids: "movie/<id>/<slug>" or "tv/<id>/<slug>", everything needed to rebuild the title's URL.
function externalId(rec: Json): string | null {
  const id = rec[F.id];
  if (id === undefined || id === null || id === '') return null;
  const kind = CONFIG.typeMap[String(rec[F.type])];
  const slug = String(rec[F.slug] ?? '');
  if (kind === 'MOVIE') return `movie/${id}/${slug}`;
  if (kind === 'SERIES') return `tv/${id}/${slug}`;
  return null;
}

function parseExternalId(value: string) {
  const [type, id, ...rest] = value.split('/');
  const kind = CONFIG.typeMap[type];
  return kind && id ? { kind, id, slug: rest.join('/') } : null;
}

function summary(rec: Json): SdmSearchResult | null {
  const id = externalId(rec);
  if (!id) return null;
  return {
    externalId: id,
    kind: CONFIG.typeMap[String(rec[F.type])],
    name: String(rec[F.name] ?? ''),
    year: extractYear(rec),
  };
}

export class SdmAdapter {
  // One page of the archive: what the server finds for `query`, narrowed by
  // the filters.
  async search(
    query: string,
    filters: SdmSearchFilters = {},
  ): Promise<SdmSearchPage> {
    const { params } = CONFIG.archive;
    const url = new URL(buildUrl('archive'));
    url.searchParams.set(params.search, query);
    if (filters.type) url.searchParams.set(params.type, filters.type);
    if (filters.year) url.searchParams.set(params.year, String(filters.year));
    if (filters.page) url.searchParams.set(params.page, String(filters.page));

    const p = await props(url.toString());
    return {
      total: Number(p.totalCount ?? 0),
      titles: flatten(p[K.titles])
        .map(summary)
        .filter((title) => title !== null),
    };
  }

  // A film, or a series with the episodes of every season: one request per
  // season. Null when the server does not have the title.
  async getTitle(id: string): Promise<SdmMovie | SdmSeries | null> {
    const parsed = parseExternalId(id);
    if (!parsed) return null;
    const url = titleUrl(parsed);
    const p = await unlessGone(() => props(url));
    const rec = p?.[K.title] as Json | undefined;
    if (!rec) return null;

    const base = {
      externalId: id,
      name: String(rec[F.name] ?? ''),
      year: extractYear(rec),
      genres: ((rec[F.genres] ?? []) as Json[])
        .map((g) => String(g[F.genreName] ?? ''))
        .filter(Boolean),
      description: String(rec[F.plot] ?? ''),
    };
    if (parsed.kind === 'MOVIE')
      return {
        ...base,
        kind: 'MOVIE',
        relinkerUrl: movieRelinker(parsed.id),
      };

    const seasons: SdmSeason[] = [];
    for (const se of (rec[K.seasons] ?? []) as Json[]) {
      const number = toNumber(se[F.seNumber]);
      if (number === null) continue;
      seasons.push(
        (await this.getSeason(id, number)) ?? {
          number,
          label: seasonLabel(number),
          episodes: [],
        },
      );
    }
    return { ...base, kind: 'SERIES', seasons };
  }

  // One season of a series. Null when the server does not have it.
  async getSeason(id: string, number: number): Promise<SdmSeason | null> {
    const parsed = parseExternalId(id);
    if (parsed?.kind !== 'SERIES') return null;
    const url =
      titleUrl(parsed) +
      CONFIG.paths.season.replace('{number}', String(number));
    const p = await unlessGone(() => props(url));
    const loaded = p?.[K.loadedSeason] as Json | undefined;
    if (!loaded) return null;
    const titleId = String(loaded[F.seTitleId] ?? parsed.id);
    return {
      number,
      label: seasonLabel(number),
      episodes: ((loaded[K.episodes] ?? []) as Json[]).map((ep) =>
        episode(ep, number, titleId),
      ),
    };
  }

  // Reads the player's page and the embed it points to. Null when the video is
  // not there; the embed's page is what says whether it is.
  async testVideoExists(pageUrl: string): Promise<VideoCheckResult | null> {
    const page = await unlessGone(() => viewerPage(pageUrl));
    if (!page) return null;

    const iframeMatch = page.match(
      /<iframe\b[^>]*\bsrc=["']([^"']+)|\bembed_url=["']([^"']+)/,
    );
    const serverUrl = iframeMatch?.[1] ?? iframeMatch?.[2];
    if (!serverUrl) return null;

    const decodedUrl = decodeEntities(serverUrl);
    const embed = await unlessGone(() => viewerPage(decodedUrl));
    if (!embed) return null;

    // The masterPlaylist's params and URL, and whether FullHD is available.
    const playlistMatch = embed.match(
      /window\s*\.\s*masterPlaylist\s*=\s*\{[\s\S]*?(\{[^{}]*\})\s*,\s*url\s*:\s*(['"])(.*?)\2[\s\S]*?canPlayFHD\s*=\s*(true|false)/,
    );
    if (!playlistMatch) return null;

    const [, rawParams, , rawPlaylistUrl, rawCanPlayFHD] = playlistMatch;
    return {
      serverUrl: decodedUrl,
      masterPlaylistParams: parseMasterPlaylistParams(rawParams),
      playlistUrl: new URL(rawPlaylistUrl, decodedUrl).toString(),
      canPlayFHD: rawCanPlayFHD === 'true',
      urlParams: new URL(decodedUrl).searchParams,
    };
  }

  // The HLS URL of right now: it expires, so it is read at play time and never
  // stored. Null when the video is not available.
  async resolveStream(relinkerUrl: string): Promise<string | null> {
    const result = await this.testVideoExists(relinkerUrl);
    return result && hlsUrl(result);
  }
}

// A viewer is waiting: no queue behind other requests, and a short wait.
const viewerPage = (url: string) =>
  politeText(url, { serial: false, retries: 1, timeoutMs: 8000 });

const titleUrl = ({ id, slug }: { id: string; slug: string }) =>
  buildUrl('title', { id, slug });

const seasonLabel = (number: number) => `Stagione ${number}`;

const movieRelinker = (id: string) => playerUrl(buildUrl('movie', { id }));

// The player's page of a film or an episode, on the address in use: mappings
// keep the ids, not this.
export function movieRelinkerUrl(externalId: string): string | null {
  const parsed = parseExternalId(externalId);
  return parsed?.kind === 'MOVIE' ? movieRelinker(parsed.id) : null;
}

export const episodeRelinker = (titleId: string, episodeId: string) =>
  playerUrl(buildUrl('episode', { title_id: titleId, episode_id: episodeId }));

function episode(ep: Json, season: number, titleId: string): SdmEpisode {
  return {
    externalId: String(ep[F.epId]),
    season,
    episode: toNumber(ep[F.epNumber]),
    titleId,
    title: String(ep[F.epName] ?? '').trim(),
    relinkerUrl: episodeRelinker(titleId, String(ep[F.epId])),
  };
}

// The release date, or the one among the translations; only the year is kept.
export function extractYear(rec: Json): number | null {
  const translated = ((rec[F.translations] ?? []) as Json[]).find(
    (t) => t.key === F.releaseDate && t.value,
  )?.value;
  const value = rec[F.releaseDate] || translated;
  const year = value ? Number.parseInt(String(value).slice(0, 4), 10) : NaN;
  return Number.isFinite(year) ? year : null;
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return value === null ||
    value === undefined ||
    value === '' ||
    !Number.isFinite(n)
    ? null
    : n;
}

const NAMED: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#')
      return String.fromCodePoint(
        e[1] === 'x' || e[1] === 'X'
          ? parseInt(e.slice(2), 16)
          : parseInt(e.slice(1), 10),
      );
    return NAMED[e.toLowerCase()] ?? m;
  });
}

function hlsUrl(result: VideoCheckResult): string {
  const { masterPlaylistParams, playlistUrl, canPlayFHD, urlParams } = result;
  const playlist = new URL(playlistUrl);
  const params = { ...masterPlaylistParams };

  if (canPlayFHD) params.h = 1;
  if (urlParams.has('b')) params.b = 1;

  // The playlist URL's own params win.
  playlist.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) query.set(key, String(value));
  }
  playlist.search = query.toString();
  return playlist.toString();
}

function parseMasterPlaylistParams(rawParams: string): Record<string, string> {
  const params: Record<string, string> = {};
  const regex = /'([^']+)'\s*:\s*'([^']*)'/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawParams)) !== null) {
    params[match[1]] = match[2];
  }
  return params;
}
