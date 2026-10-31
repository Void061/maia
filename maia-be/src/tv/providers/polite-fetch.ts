// JSON fetching that is gentle with the services: one request at a time per
// host with a minimum gap, a timeout, and a couple of retries on network or
// 5xx errors. Catalog syncs make thousands of requests; this keeps us unbanned.

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

type Options = {
  minGapMs?: number;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  // false for APIs built for volume (TMDB allows ~50 requests/s): requests
  // overlap, only their start times are spaced by minGapMs.
  serial?: boolean;
};

const lastRequestAt = new Map<string, number>();
const queues = new Map<string, Promise<unknown>>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

export function politeJson<T>(url: string, options: Options = {}): Promise<T> {
  const host = new URL(url).host;
  if (options.serial === false) return request<T>(url, host, options);
  // Chain on the host's queue so requests to the same host never overlap.
  const run = (queues.get(host) ?? Promise.resolve()).catch(() => undefined).then(() => request<T>(url, host, options));
  queues.set(host, run);
  return run;
}

// Reserves the next start slot for the host, so even overlapping requests start minGapMs apart.
async function waitTurn(host: string, minGapMs: number) {
  const at = Math.max(Date.now(), (lastRequestAt.get(host) ?? 0) + minGapMs);
  lastRequestAt.set(host, at);
  if (at > Date.now()) await sleep(at - Date.now());
}

async function request<T>(url: string, host: string, options: Options): Promise<T> {
  const { minGapMs = 250, timeoutMs = 15_000, retries = 2, headers = {} } = options;
  for (let attempt = 0; ; attempt++) {
    await waitTurn(host, minGapMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return (await res.json()) as T;
      if (res.status < 500 || attempt >= retries) throw new HttpError(res.status, url);
    } catch (err) {
      if (err instanceof HttpError || attempt >= retries) throw err;
    }
    await sleep(1000 * (attempt + 1));
  }
}
