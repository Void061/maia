import { HttpError, politeExists, politeJson, ServiceStoppedError } from '../polite-fetch.js';
import type {
  ExtraKind,
  ProviderAdapter,
  ProviderChannel,
  ProviderProgram,
  ProviderEpisode,
  ProviderExtraGroup,
  ProviderSeason,
  ProviderTitle,
  ProviderVideo,
} from '../provider.types.js';

// RaiPlay publishes plain JSON next to every page (/programmi/<slug>.json, ...).
// The catalog is readable from abroad; only the relinker (the video link) is
// geo-checked, so playback is resolved by the viewer's device, never here.
const HOST = 'https://www.raiplay.it';
const RELINKER_HOST = 'mediapolisvod.rai.it';

type RaiRights = { rights?: { drm?: Record<string, boolean>; geoprotection?: Record<string, boolean> } };
type RaiAvailabilities = { expiration_date_iso?: string } | null;

type RaiProgram = {
  name: string;
  first_item_path?: string;
  program_info?: {
    name?: string;
    year?: string;
    layout?: string;
    typology?: string;
    description?: string;
    genres?: { name: string }[];
    images?: { portrait?: string; portrait_logo?: string; portrait43?: string; landscape?: string };
  };
  blocks?: RaiBlock[];
};

type RaiSet = { name: string; path_id: string; episode_size?: { number?: number } };
type RaiBlock = { name: string; sets?: RaiSet[] };

type RaiSetItem = {
  path_id: string;
  name: string;
  season?: string;
  episode?: string;
  episode_title?: string;
  toptitle?: string;
  duration?: string;
  video_url?: string;
  forma?: string;
  images?: { landscape?: string };
  rights_management?: RaiRights;
  availabilities?: RaiAvailabilities;
};

type RaiGuideChannel = { label: string; absolute_path: string; uhd?: boolean; logo?: string };
type RaiEvent = {
  id: string;
  name: string;
  episode_title?: string;
  description?: string;
  date: string; // dd/mm/yyyy, Rome
  hour: string; // HH:MM, Rome
  duration?: string; // HH:MM:SS
  has_video?: boolean;
  path_id?: string;
  image?: string;
};

type RaiItem = {
  path_id: string;
  video?: { content_url?: string; duration?: string };
  rights_management?: RaiRights;
  availabilities?: RaiAvailabilities;
};

// Blocks that hold the full episodes; the others are clips, extras, previews.
const EPISODE_BLOCK = /^(episodi|puntate)$/i;
// Names of short-video groups, in blocks or as sets next to the episodes.
const CLIP_SET = /highlight|clip|extra|anticipazion|promo|backstage|trailer|speciale/i;

function extraKind(name: string): ExtraKind {
  if (/highlight/i.test(name)) return 'HIGHLIGHTS';
  if (/clip/i.test(name)) return 'CLIPS';
  if (/anticipazion|promo|trailer/i.test(name)) return 'PREVIEWS';
  return 'EXTRAS';
}

export class RaiPlayAdapter implements ProviderAdapter {
  readonly id = 'raiplay' as const;

  // Slugs of the programs linked from a section index (film, serieitaliane, ...).
  async listSection(section: string): Promise<string[]> {
    const index = await politeJson<unknown>(`${HOST}/tipologia/${section}/index.json`);
    return [...collectLinks(index).programs];
  }

  // The whole catalog: a section index only shows a selection, but links to
  // genre, collection and lazily loaded block pages that list the rest.
  async discover(sections = SECTIONS, onPage?: (pages: number, programs: number) => void): Promise<string[]> {
    const programs = new Set<string>();
    const seen = new Set<string>();
    const queue = sections.map((s) => `/tipologia/${s}/index.json`);
    while (queue.length) {
      const page = queue.shift()!;
      if (seen.has(page)) continue;
      seen.add(page);
      let data: unknown;
      try {
        data = await politeJson<unknown>(HOST + page);
      } catch (err) {
        if (err instanceof HttpError && err.slowDown) throw err; // RaiPlay says stop: stop the whole pass
        if (err instanceof ServiceStoppedError) throw err; // switched off in the admin panel
        continue; // a broken listing page must not stop the discovery
      }
      const links = collectLinks(data);
      for (const slug of links.programs) programs.add(slug);
      for (const next of links.listings) if (!seen.has(next)) queue.push(next);
      onPage?.(seen.size, programs.size);
    }
    return [...programs];
  }

  // The relinker as JSON (output=62) instead of a redirect. Some playlists
  // (one muxed rendition, no CODECS) are rejected by Chrome's native HLS but
  // play with hls.js, which needs the final URL: the relinker has no CORS, so
  // the browser cannot read it. Videos without geoprotection resolve from
  // anywhere; geo-blocked ones get Rai's "not available" clip from abroad.
  async resolveStream(relinkerUrl: string): Promise<string | null> {
    const url = new URL(relinkerUrl);
    if (url.hostname !== RELINKER_HOST) return null;
    url.searchParams.set('output', '62');
    const res = await politeJson<{ video?: string[] }>(url.toString(), { serial: false, retries: 1, timeoutMs: 8000 });
    const stream = res.video?.[0];
    return stream && !stream.includes('video_no_available') ? stream : null;
  }

  // The TV guide's channels that air every day: RaiPlay 2/3 and Sport 1-3
  // only exist during events (they have no page in dirette.json); Rai 4K
  // repeats Rai 1 in UHD.
  async listChannels(): Promise<ProviderChannel[]> {
    const guide = await politeJson<{ channels?: RaiGuideChannel[] }>(`${HOST}/guidatv.json`);
    const index = await politeJson<unknown>(`${HOST}/dirette.json`);
    const regular = new Set([...JSON.stringify(index).matchAll(/\/dirette\/([a-z0-9]+)\.json/g)].map((m) => m[1]));
    const out: ProviderChannel[] = [];
    for (const [position, ch] of (guide.channels ?? []).entries()) {
      if (!regular.has(ch.absolute_path.replace(/-/g, '')) || ch.uhd) continue;
      // Some listed logos do not exist (Italiana): check once a day, show the name instead.
      const logo = logoUrl(ch.logo);
      out.push({ externalId: ch.absolute_path, name: ch.label, position, logoUrl: logo && (await politeExists(logo)) ? logo : null });
    }
    return out;
  }

  async channelGuide(channel: string, day: string): Promise<ProviderProgram[]> {
    const [y, m, d] = day.split('-');
    let data: { events?: RaiEvent[] };
    try {
      data = await politeJson(`${HOST}/palinsesto/app/${channel}/${d}-${m}-${y}.json`);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return [];
      throw err;
    }
    return (data.events ?? []).map((e) => {
      const startsAt = romeTime(e.date, e.hour);
      return {
        externalId: e.id,
        title: e.name,
        episodeTitle: e.episode_title || null,
        description: e.description ?? '',
        startsAt,
        endsAt: new Date(startsAt.getTime() + (parseDuration(e.duration) ?? 0) * 1000),
        imageUrl: imageUrl(e.image),
        replayPath: e.has_video && e.path_id ? e.path_id : null,
      };
    });
  }

  async resolveReplay(replayPath: string): Promise<{ playbackUrl: string; durationSec: number | null } | null> {
    let item: RaiItem;
    try {
      item = await politeJson<RaiItem>(HOST + toJsonPath(replayPath));
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return null;
      throw err;
    }
    // RaiPlay's apps ask to sign in for most videos, but the stream itself is
    // served without it: like the catalog, MAIA does not check that flag.
    const video = movieVideo(item);
    if (!video.playback || video.drm) return null;
    return { playbackUrl: video.playback.url, durationSec: video.durationSec };
  }

  async getTitle(slug: string): Promise<ProviderTitle | null> {
    let program: RaiProgram;
    try {
      program = await politeJson<RaiProgram>(`${HOST}/programmi/${slug}.json`);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return null;
      throw err;
    }
    const info = program.program_info ?? {};
    const isMovie = info.layout === 'single' || info.typology === 'Film';
    const base = {
      provider: this.id,
      externalId: slug,
      name: info.name ?? program.name,
      year: toInt(info.year),
      genres: (info.genres ?? []).map((g) => g.name),
      description: info.description ?? '',
      // "portrait" is often empty; the versions with the title logo are the posters.
      posterUrl: imageUrl(info.images?.portrait_logo || info.images?.portrait || info.images?.portrait43),
      backdropUrl: imageUrl(info.images?.landscape),
    };

    const blocks = program.blocks ?? [];

    if (isMovie) {
      const item = program.first_item_path
        ? await politeJson<RaiItem>(HOST + toJsonPath(program.first_item_path))
        : null;
      // A film's own block holds the film itself; only clearly named ones are extras.
      const extraSets = blocks
        .filter((b) => CLIP_SET.test(b.name))
        .flatMap((b) => (b.sets ?? []).map((set) => ({ block: b.name, set })));
      return {
        ...base,
        kind: 'MOVIE',
        video: item ? movieVideo(item) : null,
        seasons: [],
        extras: await this.extras(extraSets),
      };
    }

    const episodeBlock = blocks.find((b) => EPISODE_BLOCK.test(b.name)) ?? blocks[0];
    const seasons: ProviderSeason[] = [];
    const extraSets: { block: string; set: RaiSet }[] = [];
    for (const block of blocks) {
      for (const set of block.sets ?? []) {
        if (block !== episodeBlock || CLIP_SET.test(set.name)) extraSets.push({ block: block.name, set });
      }
    }
    for (const set of (episodeBlock?.sets ?? []).filter((s) => !CLIP_SET.test(s.name))) {
      const data = await politeJson<{ items?: RaiSetItem[] }>(HOST + set.path_id);
      seasons.push({
        number: seasonNumber(set.name),
        label: set.name,
        declaredCount: set.episode_size?.number ?? null,
        episodes: (data.items ?? []).filter((it) => !it.forma || it.forma === 'Integrale').map(toEpisode),
      });
    }
    return { ...base, kind: 'SERIES', video: null, seasons, extras: await this.extras(extraSets) };
  }

  // Groups of short videos, labelled "<block> · <set>" when both say something.
  private async extras(sets: { block: string; set: RaiSet }[]): Promise<ProviderExtraGroup[]> {
    const groups: ProviderExtraGroup[] = [];
    for (const { block, set } of sets) {
      const data = await politeJson<{ items?: RaiSetItem[] }>(HOST + set.path_id);
      const videos = (data.items ?? []).map((item) => {
        const { externalId, title, durationSec, drm, geoBlocked, expiresAt, playback, imageUrl } = toEpisode(item);
        return { externalId, title: item.name || title, durationSec, drm, geoBlocked, expiresAt, playback, imageUrl };
      });
      if (!videos.length) continue;
      const label = block === set.name || EPISODE_BLOCK.test(block) ? set.name : `${block} · ${set.name}`;
      groups.push({
        externalId: set.path_id,
        kind: extraKind(`${block} ${set.name}`),
        label,
        season: seasonNumber(set.name),
        videos,
      });
    }
    return groups;
  }
}

// On-demand sections (live channels, radio and news are not catalog content).
export const SECTIONS = [
  'film',
  'serieitaliane',
  'serieinternazionali',
  'programmi',
  'documentari',
  'bambini',
  'teen',
  'musica-e-teatro',
  'techerai',
  'learning',
];

// Listing pages worth following: genres, collections, curated lists, lazy blocks.
const LISTING = /^\/(?:genere|raccolta|collezioni)\/[^?#]+\.json$|^\/tipologia\/[^/]+\/(?:PublishingBlock-[^/]+|[^/]+\/index)\.json$/;

function collectLinks(node: unknown, out = { programs: new Set<string>(), listings: new Set<string>() }) {
  if (!node || typeof node !== 'object') return out;
  const path = (node as { path_id?: unknown }).path_id;
  if (typeof path === 'string') {
    const program = path.match(/^\/programmi\/([^/]+)\.json$/);
    if (program) out.programs.add(program[1]);
    else if (LISTING.test(path)) out.listings.add(path);
  }
  for (const value of Object.values(node)) collectLinks(value, out);
  return out;
}

function seasonNumber(label: string): number | null {
  return toInt(label.match(/stagione\s*(\d+)/i)?.[1]);
}

function movieVideo(item: RaiItem): ProviderVideo {
  return {
    durationSec: parseDuration(item.video?.duration),
    ...rights(item.rights_management),
    expiresAt: item.availabilities?.expiration_date_iso ?? null,
    playback: item.video?.content_url ? { type: 'native-hls', url: item.video.content_url } : null,
  };
}

function toEpisode(item: RaiSetItem): ProviderEpisode {
  return {
    externalId: item.path_id,
    season: toInt(item.season),
    episode: toInt(item.episode),
    title: item.episode_title || item.toptitle || item.name,
    // The date may be only in the episode title ("Da Grande" / "Puntata del 19/09/2021").
    airDate: parseItalianDate(item.name) ?? parseItalianDate(item.episode_title ?? '') ?? parseItalianDate(item.toptitle ?? ''),
    imageUrl: imageUrl(item.images?.landscape),
    durationSec: parseDuration(item.duration),
    ...rights(item.rights_management),
    expiresAt: item.availabilities?.expiration_date_iso ?? null,
    playback: item.video_url ? { type: 'native-hls', url: item.video_url } : null,
  };
}

function rights(rm: RaiRights | undefined): { drm: boolean; geoBlocked: boolean } {
  return {
    drm: rm?.rights?.drm?.VOD === true,
    geoBlocked: rm?.rights?.geoprotection?.["Fuori dall'Italia"] === true,
  };
}

function imageUrl(path: string | undefined): string | null {
  if (!path) return null;
  return path.startsWith('http') ? path : HOST + path;
}

// Channel logos as the guide gives them; some are broken there (Rai Sport:
// " /dl/.../RaiSport-canale-logo", a space and no extension): those are
// dropped and the channel shows its name instead.
function logoUrl(path: string | undefined): string | null {
  const url = imageUrl(path?.trim());
  return url && /\.(svg|png|jpe?g|webp)$/i.test(url) ? url : null;
}

function toJsonPath(path: string): string {
  return path.replace(/\.html$/, '.json');
}

function toInt(value: string | undefined): number | null {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : null;
}

// "01:45:02" -> 6302
// Europe/Rome wall-clock time ("31/10/2026", "20:35") -> the instant, DST included.
export function romeTime(date: string, hour: string): Date {
  const [d, m, y] = date.split(/[/-]/).map(Number);
  const [h, min] = hour.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  const offset = (t: number) => {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Rome',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(t));
    const n = (type: string) => Number(p.find((x) => x.type === type)!.value);
    return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute')) - t;
  };
  return new Date(wall - offset(wall - offset(wall)));
}

export function parseDuration(value: string | undefined): number | null {
  const parts = value?.split(':').map(Number);
  if (!parts || parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

// Daily shows name episodes by date: "Puntata del 12/03/2026" -> "2026-03-12".
export function parseItalianDate(text: string): string | null {
  const m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // RaiPlay sometimes writes placeholders ("Puntata del 00/00/1992"): only real dates count.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}
