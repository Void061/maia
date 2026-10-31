import { placeEpisode, type TmdbSeasonEpisodes } from './episodes.js';

const ballando: TmdbSeasonEpisodes[] = [
  { number: 0, year: 2010, episodes: [{ number: 1, airDate: '2026-10-24', name: 'Speciale' }] },
  {
    number: 21,
    year: 2026,
    episodes: [
      { number: 1, airDate: '2026-10-03', name: 'Prima puntata' },
      { number: 2, airDate: '2026-10-10', name: 'Seconda puntata' },
      { number: 3, airDate: '2026-10-17', name: 'Terza puntata' },
      { number: 4, airDate: '2026-10-24', name: 'Quarta puntata' },
    ],
  },
];

describe('placeEpisode', () => {
  it('matches by air date, ignoring the specials season', () => {
    expect(placeEpisode({ season: 2026, episode: null, airDate: '2026-10-24' }, ballando)).toMatchObject({
      how: 'date',
      season: 21,
      episode: 4,
    });
  });

  it('tolerates one day (shows ending after midnight)', () => {
    expect(placeEpisode({ season: null, episode: null, airDate: '2026-10-18' }, ballando)).toMatchObject({ season: 21, episode: 3 });
  });

  it('falls back to the edition year and number', () => {
    expect(placeEpisode({ season: 2026, episode: 2, airDate: null }, ballando)).toMatchObject({ how: 'number', season: 21, episode: 2 });
  });

  it('uses plain season and number for series', () => {
    const series: TmdbSeasonEpisodes[] = [{ number: 1, year: 2020, episodes: [{ number: 1, airDate: null, name: 'Vite spezzate' }] }];
    expect(placeEpisode({ season: 1, episode: 1, airDate: null }, series)).toMatchObject({ how: 'number', name: 'Vite spezzate' });
  });

  it('gives up when nothing fits (provisional episode)', () => {
    expect(placeEpisode({ season: 2026, episode: 9, airDate: '2026-12-31' }, ballando)).toEqual({ how: 'none' });
    expect(placeEpisode({ season: null, episode: null, airDate: null }, ballando)).toEqual({ how: 'none' });
  });
});
