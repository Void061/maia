import { SERVICES } from './services.js';

// The address each catalog source is read from (docs/tv/catalog.md, "Indirizzo
// delle fonti"). The default is in services.ts; an admin can change it from the
// panel (provider_health.base_url), and ServiceSwitches keeps this in sync in
// every process. Adapters read it at request time, never at start.
let overrides = new Map<string, string>(); // service id -> base URL
let assetOverrides = new Map<string, string>(); // service id -> assets URL

export function setBaseUrlOverrides(next: Map<string, string>, assets = new Map<string, string>()) {
  overrides = next;
  assetOverrides = assets;
}

export function defaultBaseUrl(service: string): string | null {
  return SERVICES.find((s) => s.id === service)?.baseUrl ?? null;
}

// The address in use: the admin's one, or the default. No trailing slash.
export function baseUrl(service: string): string {
  const url = overrides.get(service) ?? defaultBaseUrl(service);
  if (!url) throw new Error(`${service} has no configurable address`);
  return url;
}

export function defaultAssetsUrl(service: string): string | null {
  const s = SERVICES.find((x) => x.id === service);
  return s?.assetsUrl ?? null;
}

// Whether the service's pictures have an address of their own to set.
export function hasAssets(service: string): boolean {
  const s = SERVICES.find((x) => x.id === service);
  return !!(s?.assetsUrl || s?.baseUrl);
}

// Where the service's pictures are read from: the admin's address, the
// default one, or the service's address in use. No trailing slash.
export function assetsUrl(service: string): string {
  const url = assetOverrides.get(service) ?? defaultAssetsUrl(service);
  return url ?? baseUrl(service);
}

// Hosts the service's requests go to: the fixed ones plus the current address's.
export function serviceHosts(service: string): string[] {
  const s = SERVICES.find((x) => x.id === service);
  if (!s) return [];
  return s.baseUrl ? [...new Set([...s.hosts, new URL(baseUrl(service)).host])] : s.hosts;
}

// An address typed in the panel, cleaned: http(s) only, no credentials, query
// or fragment; trailing slashes dropped. Null if not acceptable.
export function normalizeBaseUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}
