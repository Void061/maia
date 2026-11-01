import { afterEach, vi } from 'vitest';
import { setBaseUrlOverrides } from '../base-urls.js';
import { SdmAdapter } from './sdm.adapter.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('SdmAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setBaseUrlOverrides(new Map());
  });

  it('lists the catalog from the address in use', async () => {
    setBaseUrlOverrides(new Map([['sdm', 'http://10.0.0.5:8080']]));
    const fetch = vi.fn().mockResolvedValue(json({ items: [{ id: 'a' }, { id: 'b' }, {}] }));
    vi.stubGlobal('fetch', fetch);
    expect(await new SdmAdapter().discover()).toEqual(['a', 'b']);
    expect(fetch.mock.calls[0][0]).toBe('http://10.0.0.5:8080/api/titles');
  });

  it('reads a movie and makes its links absolute', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json({ id: 'm1', kind: 'movie', name: 'Film', year: 2001, poster: '/img/m1.jpg', video: { url: 'media/m1.mp4', durationSec: 5400 } }),
      ),
    );
    const t = await new SdmAdapter().getTitle('m1');
    expect(t).toMatchObject({
      provider: 'sdm',
      kind: 'MOVIE',
      name: 'Film',
      year: 2001,
      posterUrl: 'http://192.168.1.9/img/m1.jpg',
      video: { durationSec: 5400, drm: false, playback: { type: 'native-hls', url: 'http://192.168.1.9/media/m1.mp4' } },
    });
  });

  it('reads a series with its seasons', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json({
          id: 's1',
          kind: 'series',
          name: 'Serie',
          seasons: [{ number: 2, episodes: [{ id: 'e1', number: 3, name: 'Tre', url: 'http://cdn.local/e1.m3u8' }] }],
          extras: [{ id: 'g1', name: 'Trailer', kind: 'previews', videos: [{ id: 'x1', url: '/x1.mp4' }] }, { id: 'g2', name: 'Vuoto' }],
        }),
      ),
    );
    const t = await new SdmAdapter().getTitle('s1');
    expect(t?.seasons).toEqual([
      expect.objectContaining({
        number: 2,
        label: 'Stagione 2',
        episodes: [expect.objectContaining({ externalId: 'e1', season: 2, episode: 3, playback: { type: 'native-hls', url: 'http://cdn.local/e1.m3u8' } })],
      }),
    ]);
    expect(t?.extras).toEqual([expect.objectContaining({ externalId: 'g1', kind: 'PREVIEWS', label: 'Trailer' })]);
  });

  it('treats a missing title as gone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 404)));
    expect(await new SdmAdapter().getTitle('nope')).toBeNull();
  });
});
