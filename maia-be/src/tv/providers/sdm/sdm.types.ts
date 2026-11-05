export type SdmKind = 'MOVIE' | 'SERIES';

// What the archive says about a title.
export type SdmSearchResult = {
  externalId: string;
  kind: SdmKind;
  name: string;
  year: number | null;
};

export type SdmSearchFilters = {
  type?: 'movie' | 'tv';
  year?: number;
  page?: number;
};

export type SdmSearchPage = { total: number; titles: SdmSearchResult[] };

type SdmDetails = SdmSearchResult & {
  genres: string[];
  description: string;
};

export type SdmMovie = SdmDetails & {
  kind: 'MOVIE';
  // The player's page: resolveStream turns it into the HLS URL.
  relinkerUrl: string;
};

export type SdmEpisode = {
  externalId: string;
  // The title the server files the episode under, for its player's page.
  titleId: string;
  season: number;
  episode: number | null;
  title: string;
  relinkerUrl: string;
};

export type SdmSeason = {
  number: number;
  label: string;
  episodes: SdmEpisode[];
};

export type SdmSeries = SdmDetails & {
  kind: 'SERIES';
  seasons: SdmSeason[];
};

export type SdmTitle = SdmMovie | SdmSeries;

// A TMDB title found on SDM. Only ids: they hold for as long as the server keeps
// the title, while addresses change from the admin panel and HLS URLs expire.
export type SdmTitleMapping = {
  tmdbId: number;
  kind: SdmKind;
  externalId: string;
};

export type SdmEpisodeMapping = SdmTitleMapping & {
  kind: 'SERIES';
  season: number;
  episode: number;
  titleId: string;
  episodeId: string;
};

export type SdmMapping = SdmTitleMapping | SdmEpisodeMapping;

// What to play right now: `hlsUrl` is read at every playback, never stored.
export type PlaybackResolution = {
  itemId: string;
  externalId: string;
  season: number | null;
  episode: number | null;
  hlsUrl: string;
};
