import { assetsUrl } from './base-urls.js';

// Pictures are saved as a path plus the service they come from; the full link
// is built here, when the API answers, with the service's asset address (admin
// panel). Changing that address moves every picture at once, with nothing to
// rewrite in the database. A null source means the path is already a full URL.
export type Asset = { path: string | null; source: string | null };

export type AssetSize = 'poster' | 'backdrop' | 'thumb';

// What goes between the address and the path for each size. RaiPlay's
// originals are huge (a 1536x2048 poster is 0.5-1 MB): its cropgd service cuts
// them down (~45 KB). Thumbs: episode and extra cards, up to ~320 px wide, x2
// for sharp screens. TMDB serves fixed widths.
const SIZES: Record<string, Record<AssetSize, string>> = {
  raiplay: { poster: '/cropgd/384x512', backdrop: '/cropgd/1280x720', thumb: '/cropgd/640x360' },
  tmdb: { poster: '/w500', backdrop: '/w1280', thumb: '/w780' },
};

// What an adapter or TMDB gives (a path, or a full URL) as stored.
export function toAsset(service: string, value: string | null): Asset {
  if (!value) return { path: null, source: null };
  return value.startsWith('/') ? { path: value, source: service } : { path: value, source: null };
}

// The link the devices load.
export function assetUrl(path: string | null, source: string | null, size: AssetSize): string | null {
  if (!path) return null;
  if (!source) return path;
  return `${assetsUrl(source)}${SIZES[source]?.[size] ?? ''}${path}`;
}
