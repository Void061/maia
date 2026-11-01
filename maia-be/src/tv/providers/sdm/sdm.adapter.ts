import { baseUrl } from '../base-urls.js';
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

// SDM: the user's own media server at home (default http://192.168.1.9,
// changeable from the admin panel). Not reachable yet: the API below is the
// contract MAIA expects, still provisional (docs/tv/catalog.md, "SDM").
//
//   GET <address>/api/titles        { items: [{ id }] }       the whole catalog
//   GET <address>/api/titles/<id>   SdmTitle                   one title, 404 if gone
//
// Links (videos, pictures) may be absolute or relative to the address.
const host = () => baseUrl('sdm');

type SdmVideo = { url?: string | null; durationSec?: number | null; expiresAt?: string | null };

type SdmEpisode = SdmVideo & {
  id: string;
  number?: number | null;
  name?: string | null;
  airDate?: string | null;
  image?: string | null;
};

type SdmSeason = { number?: number | null; name?: string | null; episodes?: SdmEpisode[] };

type SdmExtraGroup = {
  id: string;
  name: string;
  kind?: string | null;
  season?: number | null;
  videos?: (SdmVideo & { id: string; name?: string | null; image?: string | null })[];
};

export type SdmTitle = {
  id: string;
  kind: 'movie' | 'series';
  name: string;
  year?: number | null;
  genres?: string[];
  description?: string | null;
  poster?: string | null;
  backdrop?: string | null;
  // Movies only.
  video?: SdmVideo | null;
  // Series only.
  seasons?: SdmSeason[];
  extras?: SdmExtraGroup[];
};

const EXTRA_KINDS: Record<string, ExtraKind> = {
  highlights: 'HIGHLIGHTS',
  clips: 'CLIPS',
  previews: 'PREVIEWS',
  extras: 'EXTRAS',
};

export class SdmAdapter implements ProviderAdapter {
  readonly id = 'sdm' as const;

  async discover(): Promise<string[]> {
    const res = await politeJson<{ items?: { id?: unknown }[] }>(`${host()}/api/titles`);
    return (res.items ?? []).map((t) => t.id).filter((id): id is string => typeof id === 'string' && id !== '');
  }

  async getTitle(externalId: string): Promise<ProviderTitle | null> {
    let t: SdmTitle;
    try {
      t = await politeJson<SdmTitle>(`${host()}/api/titles/${encodeURIComponent(externalId)}`);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return null;
      throw err;
    }
    return toProviderTitle(externalId, t);
  }
}

export function toProviderTitle(externalId: string, t: SdmTitle): ProviderTitle {
  const base = {
    provider: 'sdm' as const,
    externalId,
    name: t.name,
    year: t.year ?? null,
    genres: t.genres ?? [],
    description: t.description ?? '',
    posterUrl: absolute(t.poster),
    backdropUrl: absolute(t.backdrop),
    extras: (t.extras ?? []).map(toExtraGroup).filter((g) => g.videos.length > 0),
  };
  if (t.kind === 'movie') return { ...base, kind: 'MOVIE', video: t.video ? toVideo(t.video) : null, seasons: [] };
  const seasons: ProviderSeason[] = (t.seasons ?? []).map((s) => {
    const number = s.number ?? null;
    return {
      number,
      label: s.name || (number !== null ? `Stagione ${number}` : ''),
      declaredCount: null,
      episodes: (s.episodes ?? []).map((e) => toEpisode(e, number)),
    };
  });
  return { ...base, kind: 'SERIES', video: null, seasons };
}

function toEpisode(e: SdmEpisode, season: number | null): ProviderEpisode {
  return {
    externalId: e.id,
    season,
    episode: e.number ?? null,
    title: e.name ?? '',
    airDate: e.airDate ?? null,
    imageUrl: absolute(e.image),
    ...toVideo(e),
  };
}

function toExtraGroup(g: SdmExtraGroup): ProviderExtraGroup {
  return {
    externalId: g.id,
    kind: EXTRA_KINDS[g.kind ?? ''] ?? 'EXTRAS',
    label: g.name,
    season: g.season ?? null,
    videos: (g.videos ?? []).map((v) => ({ externalId: v.id, title: v.name ?? '', imageUrl: absolute(v.image), ...toVideo(v) })),
  };
}

// A file on the home server: no DRM, no geographic block. <video src> plays
// both HLS and plain files (mp4), hence the native recipe.
function toVideo(v: SdmVideo): ProviderVideo {
  const url = absolute(v.url);
  return {
    durationSec: v.durationSec ?? null,
    drm: false,
    geoBlocked: false,
    expiresAt: v.expiresAt ?? null,
    playback: url ? { type: 'native-hls', url } : null,
  };
}

// Links are saved absolute, with the address in use: if the address changes,
// ServiceSwitches.setBaseUrl moves the saved ones.
function absolute(link: string | null | undefined): string | null {
  if (!link) return null;
  if (/^https?:\/\//i.test(link)) return link;
  return `${host()}${link.startsWith('/') ? '' : '/'}${link}`;
}
