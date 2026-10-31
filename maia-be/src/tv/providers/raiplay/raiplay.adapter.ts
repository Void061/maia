import { HttpError, politeJson } from '../polite-fetch.js';
import type {
  ExtraKind,
  ProviderAdapter,
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
  rights_management?: RaiRights;
  availabilities?: RaiAvailabilities;
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
    const slugs = new Set<string>();
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const path = (node as { path_id?: unknown }).path_id;
      const match = typeof path === 'string' ? path.match(/^\/programmi\/([^/]+)\.json$/) : null;
      if (match) slugs.add(match[1]);
      for (const value of Object.values(node)) walk(value);
    };
    walk(index);
    return [...slugs];
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
        const { externalId, title, durationSec, drm, geoBlocked, expiresAt, playback } = toEpisode(item);
        return { externalId, title: item.name || title, durationSec, drm, geoBlocked, expiresAt, playback };
      });
      if (!videos.length) continue;
      const label = block === set.name || EPISODE_BLOCK.test(block) ? set.name : `${block} · ${set.name}`;
      groups.push({ kind: extraKind(`${block} ${set.name}`), label, season: seasonNumber(set.name), videos });
    }
    return groups;
  }
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
    airDate: parseItalianDate(item.name),
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

function toJsonPath(path: string): string {
  return path.replace(/\.html$/, '.json');
}

function toInt(value: string | undefined): number | null {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : null;
}

// "01:45:02" -> 6302
export function parseDuration(value: string | undefined): number | null {
  const parts = value?.split(':').map(Number);
  if (!parts || parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

// Daily shows name episodes by date: "Puntata del 12/03/2026" -> "2026-03-12".
export function parseItalianDate(text: string): string | null {
  const m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
