import { politeJson } from './providers/polite-fetch.js';

// Minimal TMDB v3 client. Accepts either the v3 API key or the v4 read access
// token (the long "eyJ..." one) as TMDB_API_KEY.
const API = 'https://api.themoviedb.org/3';

export class TmdbClient {
  constructor(private readonly key: string) {}

  // A read for a screen someone is waiting on: not queued, still far below
  // TMDB's limit (~50 requests/s) at 20 per second.
  read<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(API + path);
    url.searchParams.set('language', 'it-IT');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const isToken = this.key.startsWith('eyJ');
    if (!isToken) url.searchParams.set('api_key', this.key);
    return politeJson<T>(url.toString(), {
      minGapMs: 50,
      serial: false,
      headers: isToken ? { Authorization: `Bearer ${this.key}` } : {},
    });
  }
}

export function toYear(date: string | undefined): number | null {
  const y = Number.parseInt(date?.slice(0, 4) ?? '', 10);
  return Number.isFinite(y) ? y : null;
}
