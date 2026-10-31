import type { ProviderTitle } from '../providers/provider.types.js';
import type { Subject } from './score.js';

// What the scorer compares with the TMDB candidates.
export function subjectOf(title: ProviderTitle): Subject {
  if (title.kind === 'MOVIE') {
    const sec = title.video?.durationSec;
    return { title: title.name, year: title.year, runtimeMin: sec ? Math.round(sec / 60) : null };
  }
  const counts: Record<number, number> = {};
  for (const season of title.seasons)
    for (const ep of season.episodes) {
      const n = ep.season ?? season.number;
      if (n !== null) counts[n] = (counts[n] ?? 0) + 1;
    }
  return { title: title.name, year: title.year, seasonEpisodeCounts: counts };
}
