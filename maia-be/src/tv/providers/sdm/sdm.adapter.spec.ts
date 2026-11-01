import { afterEach, vi } from 'vitest';
import { setBaseUrlOverrides } from '../base-urls.js';
import { extractYear, pageData, SdmAdapter } from './sdm.adapter.js';

// A page as the server sends it: the JSON escaped in the data-page attribute.
const page = (props: unknown, status = 200) => {
  const json = JSON.stringify({ component: 'X', props }).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return new Response(`<html><body><div id="app" data-page="${json}"></div></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html' },
  });
};

describe('SdmAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setBaseUrlOverrides(new Map());
  });

  it('decodes the JSON in the data attribute', () => {
    expect(pageData('<div data-page="{&quot;a&quot;:&quot;l&#39;uomo &amp; c&quot;}">')).toEqual({ a: "l'uomo & c" });
  });

  it('lists the archive from the address in use, grouped or not', async () => {
    setBaseUrlOverrides(new Map([['sdm', 'http://10.0.0.5:8080']]));
    const fetch = vi.fn().mockResolvedValue(
      page({
        titles: [
          [
            { id: 1, type: 'movie', name: 'Film' },
            { id: 2, type: 'tv', slug: 'serie', name: 'Serie' },
          ],
          [{ id: 3, type: 'other' }, { type: 'movie' }],
        ],
      }),
    );
    vi.stubGlobal('fetch', fetch);
    expect(await new SdmAdapter().discover()).toEqual(['movie/1', 'tv/2/serie']);
    expect(fetch.mock.calls[0][0]).toBe('http://10.0.0.5:8080');
  });

  it('reads a movie', async () => {
    const fetch = vi.fn().mockResolvedValue(
      page({ title: { id: 7, type: 'movie', name: 'Amleto', plot: 'Trama', genres: [{ name: 'Dramma' }], release_date: '2019-05-01' } }),
    );
    vi.stubGlobal('fetch', fetch);
    const t = await new SdmAdapter().getTitle('movie/7');
    expect(fetch.mock.calls[0][0]).toBe('http://192.168.1.9/7');
    expect(t).toMatchObject({
      provider: 'sdm',
      kind: 'MOVIE',
      name: 'Amleto',
      year: 2019,
      genres: ['Dramma'],
      description: 'Trama',
      video: { drm: false, playback: { type: 'native-hls', url: 'http://192.168.1.9/7' } },
    });
  });

  it('reads a series season by season', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page({ title: { id: 4, type: 'tv', name: 'Serie', seasons: [{ number: 1, title_id: 4 }] } }))
      .mockResolvedValueOnce(
        page({ loadedSeason: { episodes: [{ id: 99, number: 2, name: ' Due ', images: [{ original_url: '/img/99.jpg' }] }] } }),
      );
    vi.stubGlobal('fetch', fetch);
    const t = await new SdmAdapter().getTitle('tv/4/serie');
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(['http://192.168.1.9/4-serie', 'http://192.168.1.9/4-serie/season-1']);
    expect(t?.kind).toBe('SERIES');
    expect(t?.seasons).toEqual([
      expect.objectContaining({
        number: 1,
        label: 'Stagione 1',
        episodes: [
          expect.objectContaining({
            externalId: '99',
            season: 1,
            episode: 2,
            title: 'Due',
            imageUrl: 'http://192.168.1.9/img/99.jpg',
            playback: { type: 'native-hls', url: 'http://192.168.1.9/4?episode_id=99' },
          }),
        ],
      }),
    ]);
  });

  it('treats a missing title as gone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(page({}, 404)));
    expect(await new SdmAdapter().getTitle('movie/0')).toBeNull();
  });

  it('takes the year from the translations when the date is missing', () => {
    expect(extractYear({ translations: [{ key: 'release_date', value: '2001-01-01' }] })).toBe(2001);
    expect(extractYear({ release_date: 'n/a' })).toBeNull();
  });
});
