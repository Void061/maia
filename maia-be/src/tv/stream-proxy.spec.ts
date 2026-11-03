import { describe, expect, it } from 'vitest';
import { isPlaylist, rewritePlaylist, signUrl, validSignature } from './stream-proxy.js';

describe('rewritePlaylist', () => {
  const link = (u: string) => `P(${u})`;

  it('sends every URI back through the proxy, made absolute', () => {
    const master = [
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="s",NAME="it",URI="subs/it.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=800000',
      'v1/index.m3u8?t=1',
      '',
      '#EXT-X-KEY:METHOD=AES-128,URI="https://k.example/key"',
      'https://cdn.example/seg0.ts',
    ].join('\r\n');
    expect(rewritePlaylist(master, 'https://cdn.example/a/master.m3u8', link).split('\n')).toEqual([
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="s",NAME="it",URI="P(https://cdn.example/a/subs/it.m3u8)"',
      '#EXT-X-STREAM-INF:BANDWIDTH=800000',
      'P(https://cdn.example/a/v1/index.m3u8?t=1)',
      '',
      '#EXT-X-KEY:METHOD=AES-128,URI="P(https://k.example/key)"',
      'P(https://cdn.example/seg0.ts)',
    ]);
  });
});

describe('signatures', () => {
  it('accepts only the link it signed', () => {
    const sig = signUrl('k', 'https://a/x.ts');
    expect(validSignature('k', 'https://a/x.ts', sig)).toBe(true);
    expect(validSignature('k', 'https://a/y.ts', sig)).toBe(false);
    expect(validSignature('other', 'https://a/x.ts', sig)).toBe(false);
    expect(validSignature('k', 'https://a/x.ts', 'short')).toBe(false);
  });
});

describe('isPlaylist', () => {
  it('by content type or extension', () => {
    expect(isPlaylist('https://a/x', 'application/vnd.apple.mpegurl')).toBe(true);
    expect(isPlaylist('https://a/x.m3u8?t=1', 'text/plain')).toBe(true);
    expect(isPlaylist('https://a/x.ts', 'video/mp2t')).toBe(false);
  });
});
