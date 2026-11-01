// Job queues of the catalog sync, stored in Postgres (schema "pgboss").
export const QUEUES = {
  discover: 'catalog-discover', // list a whole service (fill, or the scheduled full pass) + a check
  syncTitle: 'catalog-sync-title', // read one title and merge it
  check: 'catalog-check', // a service's front lists + its titles whose turn has come
  due: 'catalog-due', // hourly, database only: expired videos off
} as const;

export type DiscoverJob = { provider: string; mode: 'fill' | 'refresh' };
export type SyncTitleJob = { provider: string; externalId: string };
export type CheckJob = { provider: string };

export const TZ = 'Europe/Rome';

// How often a catalog source updates, set per source in the admin panel.
export type SyncMode = 'AUTO' | 'MANUAL';
export type SyncSettings = { mode: SyncMode; at: string; everyHours: number | null };
// Manual by default: a source updates only from the admin panel until someone
// sets a schedule there.
export const DEFAULT_SYNC: SyncSettings = { mode: 'MANUAL', at: '03:00', everyHours: 3 };
// Divisors of 24, so the checks fall at the same hours every day.
export const CHECK_HOURS = [1, 2, 3, 4, 6, 8, 12] as const;

// The cron expressions (Europe/Rome) of a source's settings: the daily full
// pass at `at`, and the checks every `everyHours` hours in between. null =
// not scheduled (manual mode, or no checks besides the full pass).
export function syncCrons(s: SyncSettings): { full: string | null; check: string | null } {
  if (s.mode === 'MANUAL') return { full: null, check: null };
  const [h, m] = s.at.split(':').map(Number);
  const full = `${m} ${h} * * *`;
  if (!s.everyHours) return { full, check: null };
  const hours: number[] = [];
  for (let x = (h + s.everyHours) % 24; x !== h; x = (x + s.everyHours) % 24) hours.push(x);
  return { full, check: hours.length ? `${m} ${hours.sort((a, b) => a - b).join(',')} * * *` : null };
}
