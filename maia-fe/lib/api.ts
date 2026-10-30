import type { components } from "./api-schema";

export type { components };

// Types generated from maia-be's OpenAPI (npm run gen:api, with maia-be running).
export type Account = components["schemas"]["AccountDto"];
export type Profile = components["schemas"]["ProfileDto"];

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Options = { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown };

async function raw(path: string, { method = "GET", body }: Options = {}) {
  return fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
}

// One refresh at a time, shared by every request that hit a 401 meanwhile.
let refreshing: Promise<boolean> | null = null;
const refresh = () =>
  (refreshing ??= raw("/auth/refresh", { method: "POST" })
    .then((r) => r.ok)
    .finally(() => setTimeout(() => (refreshing = null), 0)));

// Calls maia-be through the same-origin /api gateway. An expired access token
// (401) is refreshed once and the call retried; if that fails too the session
// is over and the caller gets UNAUTHENTICATED.
export async function api<T = void>(path: string, options: Options = {}): Promise<T> {
  let res = await raw(path, options);
  if (res.status === 401 && !path.startsWith("/auth/")) {
    if (await refresh()) res = await raw(path, options);
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { code?: string; message?: string | string[] };
    const message = Array.isArray(data.message) ? data.message.join(" ") : data.message;
    throw new ApiError(res.status, data.code ?? `HTTP_${res.status}`, message ?? "Qualcosa è andato storto. Riprova.");
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
