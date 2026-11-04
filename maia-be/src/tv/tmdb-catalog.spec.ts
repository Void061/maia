import { HttpError } from './providers/polite-fetch.js';
import { TmdbCatalogService, interleave, pagesFor, parseId, pickTrailer, titleId } from './tmdb-catalog.service.js';

const GENRES: Record<string, unknown> = {
  '/genre/movie/list': { genres: [{ id: 35, name: 'Commedia' }, { id: 27, name: 'Horror' }] },
  '/genre/tv/list': { genres: [{ id: 35, name: 'Commedia' }, { id: 10765, name: 'Sci-Fi & Fantasy' }] },
};

const page = (results: object[], total = results.length) => ({ results, total_results: total });

type Read = (path: string, params: Record<string, string | number>) => Promise<unknown>;

// A service reading canned TMDB answers; `calls` records what was asked.
function service(answers: Record<string, unknown>) {
  const calls: { path: string; params: Record<string, string | number> }[] = [];
  const config = { getOrThrow: () => 'key' };
  const cache = { wrap: <T>(_: string, compute: () => Promise<T>) => compute() };
  const s = new TmdbCatalogService(config as never, cache as never);
  const tmdb: { read: Read } = {
    read: (path, params) => {
      calls.push({ path, params });
      const answer = { ...GENRES, ...answers }[path];
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve(answer ?? page([]));
    },
  };
  (s as unknown as { tmdb: unknown }).tmdb = tmdb;
  return { s, calls, tmdb };
}

describe('title ids', () => {
  it('goes there and back', () => {
    expect(parseId(titleId('MOVIE', 603))).toEqual({ kind: 'MOVIE', tmdbId: 603 });
    expect(parseId(titleId('SERIES', 1396))).toEqual({ kind: 'SERIES', tmdbId: 1396 });
  });

  it('refuses the ids of the database catalog', () => {
    expect(parseId('cmh1x2y3z0000abcd')).toBeNull();
    expect(parseId('movie-12abc')).toBeNull();
  });
});

describe('pagesFor', () => {
  it('maps skip and take on pages of 20', () => {
    expect(pagesFor(0, 20)).toEqual({ pages: [1], offset: 0 });
    expect(pagesFor(0, 60)).toEqual({ pages: [1, 2, 3], offset: 0 });
    expect(pagesFor(30, 20)).toEqual({ pages: [2, 3], offset: 10 });
  });

  it('stops at the last page TMDB serves', () => {
    expect(pagesFor(9990, 40).pages).toEqual([500]);
    expect(pagesFor(20000, 20).pages).toEqual([]);
  });
});

describe('interleave', () => {
  it('alternates lists of different lengths', () => {
    expect(interleave([[1, 3, 5], [2]])).toEqual([1, 2, 3, 5]);
  });
});

describe('pickTrailer', () => {
  const video = (key: string, type: string, iso_639_1: string, site = 'YouTube') => ({ key, type, iso_639_1, site });

  it('prefers the Italian trailer', () => {
    const url = pickTrailer([video('en', 'Trailer', 'en'), video('it', 'Trailer', 'it')]);
    expect(url).toBe('https://www.youtube-nocookie.com/embed/it');
  });

  it('falls back on a teaser, never on other sites or kinds', () => {
    expect(pickTrailer([video('t', 'Teaser', 'en')])).toBe('https://www.youtube-nocookie.com/embed/t');
    expect(pickTrailer([video('v', 'Trailer', 'it', 'Vimeo'), video('c', 'Clip', 'it')])).toBeNull();
  });
});

describe('TmdbCatalogService', () => {
  it('builds cards with genre names and picture links', async () => {
    const { s } = service({
      '/movie/popular': page(
        [{ id: 1, title: 'Film', release_date: '1999-03-31', overview: 'Trama', poster_path: '/p.jpg', backdrop_path: '/b.jpg', genre_ids: [35] }],
        1,
      ),
    });
    const { items, total } = await s.titles({ kind: 'MOVIE', take: 20 });
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({
      id: 'movie-1',
      kind: 'MOVIE',
      name: 'Film',
      year: 1999,
      genres: ['Commedia'],
      posterUrl: 'https://image.tmdb.org/t/p/w500/p.jpg',
      thumbUrl: 'https://image.tmdb.org/t/p/w780/b.jpg',
    });
  });

  it('lists a genre only where it exists, with its id for that kind', async () => {
    const { s, calls } = service({});
    await s.titles({ genre: 'sci-fi-fantasy', take: 20 });
    const discover = calls.filter((c) => c.path.startsWith('/discover'));
    expect(discover.map((c) => c.path)).toEqual(['/discover/tv']);
    expect(discover[0].params.with_genres).toBe(10765);
  });

  it('answers an unknown genre without asking for titles', async () => {
    const { s, calls } = service({});
    expect(await s.titles({ genre: 'nope' })).toEqual({ items: [], total: 0 });
    expect(calls.some((c) => c.path.startsWith('/discover'))).toBe(false);
  });

  it('never asks for more than the cap of titles, however many the page wants', async () => {
    const { s, calls } = service({});
    await s.titles({ kind: 'MOVIE', genre: 'commedia', take: 200 });
    expect(calls.filter((c) => c.path === '/discover/movie')).toHaveLength(3);
  });

  it('searches both kinds and leaves people and adult titles out', async () => {
    const { s } = service({
      '/search/multi': page([
        { id: 1, media_type: 'person', name: 'Attore' },
        { id: 2, media_type: 'tv', name: 'Serie' },
        { id: 3, media_type: 'movie', title: 'Vietato', adult: true },
      ]),
    });
    const { items } = await s.titles({ q: 'x' });
    expect(items.map((t) => t.id)).toEqual(['series-2']);
  });

  it('reads a series with its seasons, specials and empty seasons left out', async () => {
    const { s, calls, tmdb } = service({
      '/tv/7': {
        id: 7,
        name: 'Serie',
        seasons: [
          { season_number: 0, episode_count: 3 },
          { season_number: 1, episode_count: 1 },
          { season_number: 2, episode_count: 0 },
        ],
        recommendations: page([{ id: 9, name: 'Altra' }]),
        videos: { results: [] },
      },
    });
    const plain = tmdb.read;
    tmdb.read = (path, params) =>
      params.append_to_response === 'season/1'
        ? Promise.resolve({
            'season/1': {
              season_number: 1,
              episodes: [{ episode_number: 2, name: 'Due', air_date: '2020-01-02', runtime: 45, still_path: '/s.jpg' }],
            },
          })
        : plain(path, params);
    const t = await s.title('series-7');
    expect(t.seasons).toBe(1);
    expect(t.seasonList).toEqual([
      {
        number: 1,
        episodes: [
          {
            id: 'series-7-s1e2',
            season: 1,
            number: 2,
            name: 'Due',
            airDate: '2020-01-02',
            minutes: 45,
            imageUrl: 'https://image.tmdb.org/t/p/w780/s.jpg',
          },
        ],
      },
    ]);
    expect(t.similar.map((x) => x.id)).toEqual(['series-9']);
    expect(calls.filter((c) => c.path === '/tv/7')).toHaveLength(1);
  });

  it('gives the usual error for a title TMDB does not have', async () => {
    const { s } = service({ '/movie/5': new HttpError(404, 'x') });
    await expect(s.title('movie-5')).rejects.toMatchObject({ response: { code: 'TITLE_NOT_FOUND' } });
    await expect(s.title('not-an-id')).rejects.toMatchObject({ response: { code: 'TITLE_NOT_FOUND' } });
  });

  it('gives every genre a picture of its own, with a repeat only when there is no other', async () => {
    const hit = { id: 1, title: 'Hit', backdrop_path: '/hit.jpg' };
    const other = { id: 2, title: 'Altro', backdrop_path: '/altro.jpg' };
    const { s, tmdb } = service({});
    const plain = tmdb.read;
    tmdb.read = (path, params) => {
      if (path !== '/discover/movie') return plain(path, params);
      return Promise.resolve(page(params.with_genres === 35 ? [hit] : [hit, other]));
    };
    const genres = await s.genres('MOVIE');
    expect(genres.map((g) => g.imageUrl)).toEqual([
      'https://image.tmdb.org/t/p/w1280/hit.jpg',
      'https://image.tmdb.org/t/p/w1280/altro.jpg',
    ]);
  });
});
