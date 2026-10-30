import type { CookieOptions, Response } from 'express';

// Both tokens travel in httpOnly cookies. maia-fe proxies /api/* to maia-be,
// so for the browser they are first-party cookies of the app's own origin.
export const ACCESS_COOKIE = 'maia_at';
export const REFRESH_COOKIE = 'maia_rt';

export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_SEC = 60 * 60 * 24 * 30;

// Secure (HTTPS-only) cookies whenever the app itself is served over HTTPS.
const base = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: (process.env.APP_URL ?? '').startsWith('https://'),
  path: '/',
});

export function setAuthCookies(res: Response, access: string, refresh: string) {
  res.cookie(ACCESS_COOKIE, access, { ...base(), maxAge: ACCESS_TTL_SEC * 1000 });
  res.cookie(REFRESH_COOKIE, refresh, { ...base(), maxAge: REFRESH_TTL_SEC * 1000 });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, base());
  res.clearCookie(REFRESH_COOKIE, base());
}
