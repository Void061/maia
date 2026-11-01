// JSON fetching that is gentle with the services: one request at a time per
// host with a minimum gap, a timeout, and a couple of retries on network or
// 5xx errors. Catalog syncs make thousands of requests; this keeps us unbanned.
//
// Rule for every provider (docs/tv/catalog.md, "Rispetto dei servizi"): all
// requests to an outside service go through here, one at a time, at most one
// per second unless the service publishes a higher limit for its API.

// Default gap between two requests to the same host.
const DEFAULT_GAP_MS = 1000;

// Hosts of the services an admin has switched off (ServiceSwitches keeps this
// in sync with the database). Checked right before every request, also the
// ones already queued or retrying: switching a service off stops it at once.
let stoppedHosts = new Map<string, string>(); // host -> service id

export function setStoppedHosts(hosts: Map<string, string>) {
  stoppedHosts = hosts;
}

// The service was switched off in the admin panel: not an error of the service.
export class ServiceStoppedError extends Error {
  constructor(readonly service: string) {
    super(`${service} switched off by an admin`);
  }
}

const assertRunning = (host: string) => {
  const service = stoppedHosts.get(host);
  if (service) throw new ServiceStoppedError(service);
};

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

type Options = {
  minGapMs?: number;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  // false only for a one-off request made for a viewer (not catalog work):
  // it does not wait behind a long catalog sync on the same host.
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

  // The service is telling us to slow down or has blocked us: stop, do not retry.
  get slowDown() {
    return this.status === 429 || this.status === 403;
  }
}

export function politeJson<T>(url: string, options: Options = {}): Promise<T> {
  const host = new URL(url).host;
  if (stoppedHosts.has(host)) return Promise.reject(new ServiceStoppedError(stoppedHosts.get(host)!));
  if (options.serial === false) return request<T>(url, host, options);
  // Chain on the host's queue so requests to the same host never overlap.
  const run = (queues.get(host) ?? Promise.resolve()).catch(() => undefined).then(() => request<T>(url, host, options));
  queues.set(host, run);
  return run;
}

// Whether a file exists: a HEAD request without following redirects (RaiPlay
// answers a missing file with a redirect to its 404 page). Same queue, pace
// and switches as politeJson. Network errors count as "exists": better a
// broken picture than dropping a good one for a hiccup.
export function politeExists(url: string): Promise<boolean> {
  const host = new URL(url).host;
  if (stoppedHosts.has(host)) return Promise.reject(new ServiceStoppedError(stoppedHosts.get(host)!));
  const check = async () => {
    await waitTurn(host, DEFAULT_GAP_MS);
    assertRunning(host);
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        redirect: 'manual',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 429 || res.status === 403) throw new HttpError(res.status, url);
      return res.status >= 200 && res.status < 300;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      return true;
    }
  };
  const run = (queues.get(host) ?? Promise.resolve()).catch(() => undefined).then(check);
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
  const { minGapMs = DEFAULT_GAP_MS, timeoutMs = 15_000, retries = 2, headers = {} } = options;
  for (let attempt = 0; ; attempt++) {
    await waitTurn(host, minGapMs);
    assertRunning(host); // switched off while this request was waiting its turn
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return (await res.json()) as T;
      if (res.status < 500 || attempt >= retries) throw new HttpError(res.status, url);
    } catch (err) {
      if (err instanceof HttpError || err instanceof ServiceStoppedError || attempt >= retries) throw err;
    }
    await sleep(5000 * (attempt + 1)); // a struggling service gets time to recover
  }
}
