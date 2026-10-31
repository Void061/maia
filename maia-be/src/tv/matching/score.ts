// Decides whether a provider title and a TMDB candidate are the same content.
// Pure functions: the thresholds are the thing the RaiPlay prototype measures.

export type Verdict = 'auto' | 'review' | 'new';

export type Candidate = {
  tmdbId: number;
  title: string;
  originalTitle: string;
  year: number | null;
  // Movies: runtime in minutes. Series: episodes per season number.
  runtimeMin?: number | null;
  seasonEpisodeCounts?: Record<number, number>;
};

export type Subject = {
  title: string;
  year: number | null;
  runtimeMin?: number | null;
  // Series: season number -> episodes listed by the service.
  seasonEpisodeCounts?: Record<number, number>;
};

export type Scored = { candidate: Candidate; score: number };

export const AUTO_THRESHOLD = 0.85;
export const REVIEW_THRESHOLD = 0.6;
// The best candidate must beat the runner-up by this much to be merged alone.
export const AUTO_MARGIN = 0.1;

// Lowercase, no accents or punctuation, "&" as "e".
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// Similarity 0..1 from the Levenshtein distance of the normalized titles.
export function titleSimilarity(a: string, b: string): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (x[i - 1] === y[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length);
}

function yearScore(a: number | null, b: number | null): number {
  if (a === null || b === null) return 0.5;
  const diff = Math.abs(a - b);
  return diff === 0 ? 1 : diff === 1 ? 0.7 : diff === 2 ? 0.3 : 0;
}

function runtimeScore(a: number | null | undefined, b: number | null | undefined): number {
  if (!a || !b) return 0.5;
  const diff = Math.abs(a - b);
  return diff <= 5 ? 1 : diff <= 15 ? 0.5 : 0;
}

// Share of the service's seasons that fit in TMDB's (season exists, not more episodes).
function seasonFit(subject?: Record<number, number>, candidate?: Record<number, number>): number {
  const seasons = Object.entries(subject ?? {});
  if (!seasons.length || !candidate) return 0.5;
  const fitting = seasons.filter(([n, count]) => candidate[Number(n)] !== undefined && count <= candidate[Number(n)]);
  return fitting.length / seasons.length;
}

export function scoreCandidate(subject: Subject, candidate: Candidate): number {
  const title = Math.max(
    titleSimilarity(subject.title, candidate.title),
    titleSimilarity(subject.title, candidate.originalTitle),
  );
  const year = yearScore(subject.year, candidate.year);
  if (subject.seasonEpisodeCounts) {
    return 0.6 * title + 0.2 * year + 0.2 * seasonFit(subject.seasonEpisodeCounts, candidate.seasonEpisodeCounts);
  }
  return 0.6 * title + 0.25 * year + 0.15 * runtimeScore(subject.runtimeMin, candidate.runtimeMin);
}

export function decide(subject: Subject, candidates: Candidate[]): { verdict: Verdict; ranked: Scored[] } {
  const ranked = candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(subject, candidate) }))
    .sort((a, b) => b.score - a.score);
  const [best, second] = ranked;
  if (!best || best.score < REVIEW_THRESHOLD) return { verdict: 'new', ranked };
  const margin = best.score - (second?.score ?? 0);
  return { verdict: best.score >= AUTO_THRESHOLD && margin >= AUTO_MARGIN ? 'auto' : 'review', ranked };
}
