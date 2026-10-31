// Places a service's episode in TMDB's season/episode structure.
// Pure function: the catalog ingest and the probe both use it.

export type TmdbSeasonEpisodes = {
  number: number;
  // Year the season (edition) aired, to resolve "Stagione 2026".
  year: number | null;
  episodes: { number: number; airDate: string | null; name: string }[];
};

export type EpisodePlacement =
  | { how: 'date' | 'number'; season: number; episode: number; name: string; airDate: string | null }
  | { how: 'none' };

const DAY = 86_400_000;

// Daily and weekly shows are matched by air date first: their numbering often
// differs between services (puntate numbered per edition, or not at all).
// Otherwise season + number, with "Stagione 2026" meaning the edition aired in 2026.
export function placeEpisode(
  ep: { season: number | null; episode: number | null; airDate: string | null },
  seasons: TmdbSeasonEpisodes[],
): EpisodePlacement {
  if (ep.airDate) {
    const target = Date.parse(ep.airDate);
    let best: { season: number; episode: TmdbSeasonEpisodes['episodes'][number]; diff: number } | null = null;
    for (const season of seasons) {
      if (season.number === 0) continue; // specials
      for (const episode of season.episodes) {
        if (!episode.airDate) continue;
        const diff = Math.abs(Date.parse(episode.airDate) - target);
        // One day of tolerance: late-night shows air past midnight.
        if (diff <= DAY && (!best || diff < best.diff)) best = { season: season.number, episode, diff };
      }
    }
    if (best) return { how: 'date', season: best.season, episode: best.episode.number, name: best.episode.name, airDate: best.episode.airDate };
  }

  if (ep.season !== null && ep.episode !== null) {
    const season =
      ep.season >= 1900 ? seasons.find((s) => s.number > 0 && s.year === ep.season) : seasons.find((s) => s.number === ep.season);
    const episode = season?.episodes.find((e) => e.number === ep.episode);
    if (season && episode) return { how: 'number', season: season.number, episode: episode.number, name: episode.name, airDate: episode.airDate };
  }
  return { how: 'none' };
}
