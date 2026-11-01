import { baseUrl } from '../base-urls.js';
import { HttpError, politeText } from '../polite-fetch.js';
import type {
  ProviderAdapter,
  ProviderEpisode,
  ProviderSeason,
  ProviderTitle,
  ProviderVideo,
} from '../provider.types.js';

// SDM: the user's own media server at home (default http://192.168.1.9,
// changeable from the admin panel). Its pages carry their data as JSON in an
// HTML attribute (Inertia.js style, `data-page="{...}"`): every list, title and
// season is read from there (docs/tv/catalog.md, "SDM"). Nothing about the
// server is fixed in the code below the CONFIG block.
const host = () => baseUrl('sdm');

const CONFIG = {
  // Replaces the {lang} placeholder in the paths.
  lang: 'it',

  // HTML attribute holding the page's JSON.
  dataAttr: 'data-page',

  // Paths after the address. Placeholders: {lang} {id} {slug} {number} {title_id} {episode_id}.
  paths: {
    movies: '{lang}/movies',
    tvshows: '{lang}/tv-shows',
    archive: '{lang}/archive',
    movie: '{lang}/watch/{id}',
    tvshow: '{lang}/titles/{id}-{slug}',
    season: '/season-{number}',
    episode: '{lang}/iframe/{title_id}?episode_id={episode_id}',
  },

  // Turns a title's or episode's URL into the player's: [search, replace]. null = as it is.
  playerReplace: ['/watch/', '/iframe/'] as [string, string] | null,

  // Front lists the checks read: index of the slider in the movies / tvshows page's JSON.
  sliders: {
    movie: [1, 2] as number[], // e.g. [1, 2]
    tvshow: [1, 2] as number[],
  },

  // Keys of the page's JSON.
  keys: {
    props: 'props',
    titles: 'titles',
    sliders: 'sliders',
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
    epImages: 'images',
    epImageUrl: 'original_url',
    epId: 'id',
    seNumber: 'number',
    seTitleId: 'title_id',
  },

  // The JSON's "type" field mapped on MAIA's kinds.
  typeMap: { movie: 'MOVIE', tv: 'SERIES' } as Record<
    string,
    'MOVIE' | 'SERIES'
  >,
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

// Lists may come grouped (an array of arrays): flattened.
function flatten(records: unknown): Json[] {
  if (!Array.isArray(records)) return [];
  return (
    Array.isArray(records[0]) ? (records as unknown[][]).flat() : records
  ) as Json[];
}

// External ids: "movie/<id>" or "tv/<id>/<slug>", everything needed to rebuild the title's URL.
function externalId(rec: Json): string | null {
  const id = rec[F.id];
  if (id === undefined || id === null || id === '') return null;
  const kind = CONFIG.typeMap[String(rec[F.type])];
  if (kind === 'MOVIE') return `movie/${id}`;
  if (kind === 'SERIES') return `tv/${id}/${String(rec[F.slug] ?? '')}`;
  return null;
}

const ids = (records: Json[]) => [
  ...new Set(records.map(externalId).filter((id): id is string => id !== null)),
];

export class SdmAdapter implements ProviderAdapter {
  readonly id = 'sdm' as const;
  readonly frontSections = [
    ...CONFIG.sliders.movie.map((i) => `movie:${i}`),
    ...CONFIG.sliders.tvshow.map((i) => `tvshow:${i}`),
  ];

  // The whole catalog: the archive page's titles.
  async discover(): Promise<string[]> {
    return ids(flatten((await props(buildUrl('archive')))[K.titles]));
  }

  async listSection(section: string): Promise<string[]> {
    const [kind, index] = section.split(':');
    const p = await props(buildUrl(kind === 'movie' ? 'movies' : 'tvshows'));
    const slider = ((p[K.sliders] ?? []) as Json[])[Number(index)];
    return ids(flatten(slider?.[K.titles]));
  }

  async getTitle(externalId: string): Promise<ProviderTitle | null> {
    const [kind, id, ...slug] = externalId.split('/');
    const url =
      kind === 'movie'
        ? buildUrl('movie', { id })
        : buildUrl('tvshow', { id, slug: slug.join('/') });
    let p: Json;
    try {
      p = await props(url);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return null;
      throw err;
    }
    const rec = p[K.title] as Json | undefined;
    if (!rec) return null;
    const base = {
      provider: 'sdm' as const,
      externalId,
      name: String(rec[F.name] ?? ''),
      year: extractYear(rec),
      genres: ((rec[F.genres] ?? []) as Json[])
        .map((g) => String(g[F.genreName] ?? ''))
        .filter(Boolean),
      description: String(rec[F.plot] ?? ''),
      posterUrl: null,
      backdropUrl: null,
      extras: [],
    };
    if (kind === 'movie')
      return { ...base, kind: 'MOVIE', video: video(url), seasons: [] };

    const seasons: ProviderSeason[] = [];
    for (const se of (rec[K.seasons] ?? []) as Json[]) {
      const number = toNumber(se[F.seNumber]);
      const loaded = (
        await props(
          url + CONFIG.paths.season.replace('{number}', String(se[F.seNumber])),
        )
      )[K.loadedSeason] as Json | undefined;
      const titleId = se[F.seTitleId] ?? id;
      seasons.push({
        number,
        label: number !== null ? `Stagione ${number}` : '',
        declaredCount: null,
        episodes: ((loaded?.[K.episodes] ?? []) as Json[]).map((ep) =>
          episode(ep, number, String(titleId)),
        ),
      });
    }
    return { ...base, kind: 'SERIES', video: null, seasons };
  }
}

function episode(
  ep: Json,
  season: number | null,
  titleId: string,
): ProviderEpisode {
  const images = ep[F.epImages] as Json[] | undefined;
  const image = images?.[0]?.[F.epImageUrl];
  return {
    externalId: String(ep[F.epId]),
    season,
    episode: toNumber(ep[F.epNumber]),
    title: String(ep[F.epName] ?? '').trim(),
    airDate: null,
    imageUrl: typeof image === 'string' && image ? absolute(image) : null,
    ...video(
      buildUrl('episode', {
        title_id: titleId,
        episode_id: String(ep[F.epId]),
      }),
    ),
  };
}

// A file on the home server: no DRM, no geographic block. <video src> plays
// both HLS and plain files (mp4), hence the native recipe.
function video(url: string): ProviderVideo {
  return {
    durationSec: null,
    drm: false,
    geoBlocked: false,
    expiresAt: null,
    playback: { type: 'native-hls', url: playerUrl(url) },
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

function absolute(link: string): string {
  if (/^https?:\/\//i.test(link)) return link;
  return `${host()}${link.startsWith('/') ? '' : '/'}${link}`;
}

const NAMED: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
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
