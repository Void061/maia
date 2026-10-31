import { decide, normalizeTitle, titleSimilarity, type Candidate } from './score.js';

const movie = (over: Partial<Candidate>): Candidate => ({
  tmdbId: 1,
  title: 'Civil War',
  originalTitle: 'Civil War',
  year: 2024,
  runtimeMin: 109,
  ...over,
});

describe('normalizeTitle', () => {
  it('drops accents, case and punctuation', () => {
    expect(normalizeTitle("L'Amica Geniale: Storia del nuovo cognome")).toBe('l amica geniale storia del nuovo cognome');
    expect(normalizeTitle('Perché sì & no')).toBe('perche si e no');
  });
});

describe('titleSimilarity', () => {
  it('is 1 for the same title written differently', () => {
    expect(titleSimilarity('DOC - Nelle tue mani', 'Doc: nelle tue mani')).toBe(1);
  });
  it('is low for different titles', () => {
    expect(titleSimilarity('Mare fuori', 'Un posto al sole')).toBeLessThan(0.4);
  });
});

describe('decide', () => {
  it('merges alone when title, year and runtime agree and there is no close rival', () => {
    const { verdict } = decide({ title: 'Civil War', year: 2024, runtimeMin: 105 }, [
      movie({}),
      movie({ tmdbId: 2, title: 'Captain America: Civil War', originalTitle: 'Captain America: Civil War', year: 2016, runtimeMin: 147 }),
    ]);
    expect(verdict).toBe('auto');
  });

  it('asks for review when two candidates are equally good (remakes)', () => {
    const { verdict } = decide({ title: 'Il padre', year: null, runtimeMin: null }, [
      movie({ tmdbId: 1, title: 'Il padre', originalTitle: 'Il padre', year: 2020 }),
      movie({ tmdbId: 2, title: 'Il padre', originalTitle: 'Il padre', year: 1990 }),
    ]);
    expect(verdict).toBe('review');
  });

  it('creates a new title when nothing is close', () => {
    expect(decide({ title: 'Domenica In', year: 2025 }, [movie({ title: 'Sunday', originalTitle: 'Sunday' })]).verdict).toBe('new');
    expect(decide({ title: 'Domenica In', year: 2025 }, []).verdict).toBe('new');
  });

  it('uses the season structure for series', () => {
    const subject = { title: 'Mare fuori', year: 2020, seasonEpisodeCounts: { 1: 12, 2: 12 } };
    const right: Candidate = { tmdbId: 1, title: 'Mare fuori', originalTitle: 'Mare fuori', year: 2020, seasonEpisodeCounts: { 1: 12, 2: 12, 3: 12 } };
    const wrong: Candidate = { tmdbId: 2, title: 'Mare fuori', originalTitle: 'Mare fuori', year: 2020, seasonEpisodeCounts: { 1: 6 } };
    const { verdict, ranked } = decide(subject, [wrong, right]);
    expect(ranked[0].candidate.tmdbId).toBe(1);
    expect(verdict).toBe('auto');
  });
});
