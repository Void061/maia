import { baseUrl } from '../base-urls.js';
import { HttpError, politeText } from '../polite-fetch.js';
import type {
  ProviderAdapter,
  ProviderEpisode,
  ProviderSeason,
  ProviderTitle,
  ProviderVideo,
} from '../provider.types.js';

interface VideoCheckResult {
  serverUrl: string;
  masterPlaylistParams: Record<string, string | number | boolean | null>;
  playlistUrl: string;
  canPlayFHD: boolean;
  urlParams: URLSearchParams;
}

type VideoUrl = [label: string, url: string];

// SDM: the user's own media server at home (default http://192.168.1.9,
// changeable from the admin panel). Its pages carry their data as JSON in an
// HTML attribute (Inertia.js style, `data-page="{...}"`): every list, title and
// season is read from there (docs/tv/catalog.md, "SDM"). Nothing about the
// server is fixed in the code below the CONFIG block.
const host = () => baseUrl('sdm');

const CONFIG = {
  archive: {
    types: ['movie', 'tv'] as string[],
    firstYear: 2000,
    pageSize: 60,
    maxPages: 20,
    params: {
      page: 'page',
      type: 'type',
      genre: 'genre[]',
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
    movies: '/{lang}/movies',
    tvshows: '/{lang}/tv-shows',
    archive: '/{lang}/archive',
    movie: '/{lang}/watch/{id}',
    season: '/season-{number}',
    episode: '/{lang}/iframe/{title_id}?episode_id={episode_id}',
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
    epImageUrl: 'filename',
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

const ids = (records: Json[]) => [
  ...new Set(records.map(externalId).filter((id): id is string => id !== null)),
];

export class SdmAdapter implements ProviderAdapter {
  readonly id = 'sdm' as const;
  readonly frontSections = [
    ...CONFIG.sliders.movie.map((i) => `movie:${i}`),
    ...CONFIG.sliders.tvshow.map((i) => `tvshow:${i}`),
  ];

  async testVideoExists(pageUrl: string): Promise<VideoCheckResult | null> {
    // Recupera la pagina principale
    let htmlPage = await politeText(pageUrl, {
      serial: false,
      retries: 1,
      timeoutMs: 8000,
    });

    // Estrae l'iframe
    const iframeMatch = htmlPage.match(
      /<iframe\b[^>]*\bsrc=["']([^"']+)|\bembed_url=["']([^"']+)/,
    );

    const serverUrl = iframeMatch?.[1] ?? iframeMatch?.[2];

    if (!serverUrl) return null;

    const decodedUrl = decodeHtmlEntities(serverUrl);

    // Recupera l'HTML dell'embed
    htmlPage = await politeText(decodedUrl, {
      serial: false,
      retries: 1,
      timeoutMs: 8000,
    });

    // Estrae masterPlaylist, URL e disponibilità FullHD
    const playlistMatch = htmlPage.match(
      /window\s*\.\s*masterPlaylist\s*=\s*\{[\s\S]*?(\{[^{}]*\})\s*,\s*url\s*:\s*(['"])(.*?)\2[\s\S]*?canPlayFHD\s*=\s*(true|false)/,
    );

    if (!playlistMatch) return null;

    const [, rawParams, , rawPlaylistUrl, rawCanPlayFHD] = playlistMatch;

    // Converte i parametri della masterPlaylist
    const masterPlaylistParams = parseMasterPlaylistParams(rawParams);

    // Risolve anche eventuali URL relativi
    const playlistUrl = new URL(rawPlaylistUrl, decodedUrl).toString();

    // Parametri dell'embed
    const embedUrl = new URL(decodedUrl);

    return {
      serverUrl: decodedUrl,
      masterPlaylistParams,
      playlistUrl,
      canPlayFHD: rawCanPlayFHD === 'true',
      urlParams: embedUrl.searchParams,
    };
  }

  async resolveStream(relinkerUrl: string): Promise<string | null> {
    const result = await this.testVideoExists(relinkerUrl);

    if (!result) return null;

    const videoUrls = getVideoUrl(result);

    return videoUrls[0]?.[1] ?? null;
  }

  async getArchiveFilters(): Promise<Json> {
    const p = await props(buildUrl('archive'));

    return {
      genres: p.genres,
      countries: p.countries,
      sortBy: p.sortBy,
      totalCount: p.totalCount,
      browseMoreApiRoute: p.browseMoreApiRoute,
    };
  }

  async discover(): Promise<string[]> {
    const { archive } = CONFIG;
    const discovered = new Set<string>();
    const currentYear = new Date().getFullYear();

    // Recupera i generi disponibili nell'archivio.
    const archiveProps = await props(buildUrl('archive'));

    const genres = (archiveProps.genres ?? []) as {
      id: number;
      name: string;
      type: string;
      hidden: number;
    }[];

    /**
     * Recupera una partizione completa.
     *
     * Se supera il limite massimo di pagine, restituisce null.
     * In caso di dati incompleti o pagine ripetute, genera un errore.
     */
    const scanPartition = async (
      filters: Record<string, string>,
      label: string,
    ): Promise<Set<string> | null> => {
      const url = new URL(buildUrl('archive'));

      for (const [key, value] of Object.entries(filters)) {
        url.searchParams.set(key, value);
      }

      const firstPage = await props(url.toString());
      const totalCount = Number(firstPage.totalCount ?? 0);

      if (totalCount === 0) {
        return new Set<string>();
      }

      const totalPages = Math.ceil(totalCount / archive.pageSize);

      if (totalPages > archive.maxPages) {
        console.log(
          `[SDM] Partition too large: ${label} (${totalCount} titles)`,
        );

        return null;
      }

      const result = new Set<string>();
      let received = 0;
      let previousPageSignature = '';

      for (let page = 1; page <= totalPages; page++) {
        const pageProps =
          page === 1
            ? firstPage
            : await (async () => {
                url.searchParams.set(archive.params.page, String(page));

                return props(url.toString());
              })();

        const records = flatten(pageProps[K.titles]);

        if (records.length === 0) {
          throw new Error(`[SDM] Empty page ${page}/${totalPages}: ${label}`);
        }

        const pageSignature = records
          .map((record) => String(record[F.id] ?? ''))
          .join(',');

        if (pageSignature === previousPageSignature) {
          throw new Error(`[SDM] Repeated page ${page}: ${label}`);
        }

        previousPageSignature = pageSignature;
        received += records.length;

        ids(records).forEach((id) => result.add(id));
      }

      // Verifica che il numero di record scaricati corrisponda
      // al totale dichiarato dal server.
      if (received !== totalCount) {
        throw new Error(
          `[SDM] Incomplete partition: ${label}. ` +
            `Expected ${totalCount}, received ${received}`,
        );
      }

      console.log(`[SDM] ${label}: ${result.size}/${totalCount} titles`);

      return result;
    };

    // Scansione principale: tipo + anno.
    for (const type of archive.types) {
      for (let year = archive.firstYear; year <= currentYear; year++) {
        const filters = {
          [archive.params.type]: type,
          [archive.params.year]: String(year),
        };

        const label = `${type} ${year}`;

        let partition = await scanPartition(filters, label);

        // Se la partizione è troppo grande, la dividiamo per genere.
        if (partition === null) {
          const applicableGenres = genres.filter(
            (genre) =>
              genre.hidden === 0 &&
              (genre.type === type || genre.type === 'all'),
          );

          partition = new Set<string>();

          for (const genre of applicableGenres) {
            const genreFilters = {
              ...filters,
              [archive.params.genre]: String(genre.id),
            };

            const genreLabel = `${type} ${year} / ${genre.name}`;

            const genrePartition = await scanPartition(
              genreFilters,
              genreLabel,
            );

            if (genrePartition === null) {
              throw new Error(
                `[SDM] Genre partition still exceeds page limit: ` +
                  `${genreLabel}`,
              );
            }

            genrePartition.forEach((id) => partition!.add(id));
          }

          // Controllo di completezza:
          // se i generi non coprono tutti i titoli dell'anno,
          // non restituiamo un catalogo incompleto.
          const yearCheck = await props(
            (() => {
              const checkUrl = new URL(buildUrl('archive'));

              for (const [key, value] of Object.entries(filters)) {
                checkUrl.searchParams.set(key, value);
              }

              return checkUrl.toString();
            })(),
          );

          const expectedCount = Number(yearCheck.totalCount ?? 0);

          if (partition.size !== expectedCount) {
            throw new Error(
              `[SDM] Genre coverage incomplete for ${label}. ` +
                `Expected ${expectedCount}, found ${partition.size}`,
            );
          }
        }

        partition.forEach((id) => discovered.add(id));
      }
    }

    console.log(`[SDM] Discovery completed: ${discovered.size} unique titles`);

    return [...discovered];
  }

  async listSection(section: string): Promise<string[]> {
    const [kind, index] = section.split(':');
    const p = await props(buildUrl(kind === 'movie' ? 'movies' : 'tvshows'));
    const slider = ((p[K.sliders] ?? []) as Json[])[Number(index)];
    return ids(flatten(slider?.[K.titles]));
  }

  async getTitle(externalId: string): Promise<ProviderTitle | null> {
    const [kind, id, ...rest] = externalId.split('/');
    const url = buildUrl('title', { id, slug: rest.join('/') });
    let p: Json;
    try {
      p = await props(url);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return null;
      throw err;
    }
    const rec = p[K.title] as Json | undefined;
    if (!rec) return null;

    const titleImages = Array.isArray(rec.images) ? (rec.images as Json[]) : [];

    const posterUrl = sdmImage(
      titleImages.find((img) => img.type === 'poster')?.filename,
    );
    const base = {
      provider: 'sdm' as const,
      externalId,
      name: String(rec[F.name] ?? ''),
      year: extractYear(rec),
      genres: ((rec[F.genres] ?? []) as Json[])
        .map((g) => String(g[F.genreName] ?? ''))
        .filter(Boolean),
      description: String(rec[F.plot] ?? ''),
      posterUrl,
      backdropUrl: null,
      extras: [],
    };
    if (kind === 'movie')
      return {
        ...base,
        kind: 'MOVIE',
        video: video(buildUrl('movie', { id })),
        seasons: [],
      };

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

function absolute(link: string): string {
  if (/^https?:\/\//i.test(link)) return link;
  return `${host()}${link.startsWith('/') ? '' : '/'}${link}`;
}

function sdmImage(filename: unknown): string | null {
  if (typeof filename !== 'string' || !filename) return null;
  return `https://cdn.streamingcommunityz.day/images/${filename}`;
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
    imageUrl: sdmImage(image),
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

const NAMED: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

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

function getVideoUrl(result: VideoCheckResult): VideoUrl[] {
  const { masterPlaylistParams, playlistUrl, canPlayFHD, urlParams } = result;

  const playlist = new URL(playlistUrl);

  // Copia i parametri originali della configurazione
  const params = { ...masterPlaylistParams };

  // FullHD
  if (canPlayFHD) {
    params.h = 1;
  }

  // Parametro b presente nell'URL embed
  if (urlParams.has('b')) {
    params.b = 1;
  }

  // I parametri dell'URL playlist hanno precedenza
  playlist.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  // Ricostruisce la query string
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      query.set(key, String(value));
    }
  }

  playlist.search = query.toString();

  return [[`hls [${canPlayFHD ? 'FullHD' : 'HD'}]`, playlist.toString()]];
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
