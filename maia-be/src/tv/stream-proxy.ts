import { createHmac, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { BadGatewayException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { TvService } from './tv.service.js';

// The whole video through maia-be instead of the device reading the service
// directly: the only way the player plays the catalog. Playlists are rewritten
// so that every link (variants, segments, keys, subtitles) comes back here,
// signed, so the endpoint only fetches what a playlist it served pointed to:
// not an open proxy.
// No polite-fetch: these are the requests the device would make while watching.
// Every service with resolveStream.
// The relinker checks the server's country, so from the VPS (France) films and
// series are refused: this only works with maia-be running in Italy.

const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];

export function signUrl(secret: string, url: string): string {
  return createHmac('sha256', secret).update(url).digest('base64url').slice(0, 22);
}

export function validSignature(secret: string, url: string, sig: string): boolean {
  const expected = Buffer.from(signUrl(secret, url));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function isPlaylist(url: string, contentType: string | null): boolean {
  return /mpegurl/i.test(contentType ?? '') || new URL(url).pathname.endsWith('.m3u8');
}

// Every URI of an HLS playlist, made absolute against `baseUrl` and passed to `link`:
// the lines that are not tags and the URI="…" attributes (keys, media, maps).
export function rewritePlaylist(body: string, baseUrl: string, link: (absolute: string) => string): string {
  const abs = (uri: string) => link(new URL(uri, baseUrl).toString());
  return body
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${abs(uri)}"`);
      return abs(t);
    })
    .join('\n');
}

@Injectable()
export class StreamProxyService {
  private readonly log = new Logger('StreamProxy');
  private readonly secret: string;

  constructor(
    config: ConfigService,
    private readonly tv: TvService,
  ) {
    this.secret = `${config.getOrThrow<string>('JWT_SECRET')}:stream-proxy`;
  }

  // Without `u`: the item's playlist. With `u` + `s`: a link from a playlist served here.
  async serve(itemId: string, u: string | undefined, s: string | undefined, req: Request, res: Response) {
    let url: string;
    if (u) {
      if (!s || !validSignature(this.secret, u, s)) throw new ForbiddenException();
      url = u;
    } else {
      const { provider } = await this.tv.playback(itemId);
      url = (await this.tv.stream(itemId, provider)).url;
      this.log.log(`${itemId}: ${new URL(url).host}`);
    }

    const abort = new AbortController();
    res.on('close', () => !res.writableFinished && abort.abort());
    const range = req.headers.range;
    let upstream: globalThis.Response;
    try {
      upstream = await fetch(url, { headers: range ? { range } : {}, signal: abort.signal });
    } catch {
      throw new BadGatewayException();
    }

    if (upstream.ok && isPlaylist(upstream.url, upstream.headers.get('content-type'))) {
      // Relative to /tv/proxy/<itemId>: the same path, another query.
      const link = (absolute: string) =>
        `${encodeURIComponent(itemId)}?u=${encodeURIComponent(absolute)}&s=${signUrl(this.secret, absolute)}`;
      const body = rewritePlaylist(await upstream.text(), upstream.url, link);
      res.status(200).set({ 'content-type': 'application/vnd.apple.mpegurl', 'cache-control': 'no-store' }).send(body);
      return;
    }

    res.status(upstream.status);
    for (const name of PASS_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    if (!upstream.body) {
      res.end();
      return;
    }
    Readable.fromWeb(upstream.body as WebReadableStream<Uint8Array>)
      .on('error', () => res.destroy())
      .pipe(res);
  }
}
