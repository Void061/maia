// Provider layer: what a service says about a title, normalized but not yet
// matched to the MAIA catalog (see docs/tv/catalog.md, "Due livelli").

export type ProviderId = 'raiplay' | 'sdm';

export type TitleKind = 'MOVIE' | 'SERIES';

// What the player needs to start a source. The real stream URL is never
// stored: the device resolves it at play time (geo-check happens there).
export type PlaybackRecipe = { type: 'native-hls'; url: string };

export type ProviderVideo = {
  durationSec: number | null;
  drm: boolean;
  // Blocked outside Italy (only matters for viewers abroad: playback runs on the device).
  geoBlocked: boolean;
  expiresAt: string | null;
  playback: PlaybackRecipe | null;
};

export type ProviderEpisode = ProviderVideo & {
  externalId: string;
  season: number | null;
  episode: number | null;
  title: string;
  airDate: string | null;
  // The episode's own picture (a frame of it), not the show's artwork. Like
  // every picture here: a path on the service's asset address, or a full URL.
  imagePath: string | null;
};

export type ProviderSeason = {
  // Number parsed from the service's label ("Stagione 3", "Daily - Stagione 11"); null if none.
  number: number | null;
  label: string;
  // How many episodes the service says the season has, to spot partial listings.
  declaredCount: number | null;
  episodes: ProviderEpisode[];
};

// Short videos around a title (highlights, clips, previews, backstage). Shown in
// the title's "Extra" section, never mixed with the episodes, and not matched to
// TMDB: they belong to the title they were found on.
export type ExtraKind = 'HIGHLIGHTS' | 'CLIPS' | 'PREVIEWS' | 'EXTRAS';

export type ProviderExtra = ProviderVideo & { externalId: string; title: string; imagePath: string | null };

export type ProviderExtraGroup = {
  externalId: string;
  kind: ExtraKind;
  // As the service names it: "Highlights · Stagione 6", "Ciro per sempre".
  label: string;
  season: number | null;
  videos: ProviderExtra[];
};

export type ProviderTitle = {
  provider: ProviderId;
  externalId: string;
  kind: TitleKind;
  name: string;
  year: number | null;
  genres: string[];
  description: string;
  // The service's artwork, used when TMDB has none for the title.
  posterPath: string | null;
  backdropPath: string | null;
  // Movies only.
  video: ProviderVideo | null;
  // Series only.
  seasons: ProviderSeason[];
  extras: ProviderExtraGroup[];
};

export interface ProviderAdapter {
  readonly id: ProviderId;
  // Every request goes to the source's address in use (base-urls.ts), read at
  // request time: an admin can change it from the panel.
  // The whole catalog: external ids of every title.
  discover?(): Promise<string[]>;
  // Front lists the checks read (new titles appear there first), and the
  // external ids listed in one of them. Sources without them are checked
  // only through the titles whose turn has come.
  readonly frontSections?: readonly string[];
  listSection?(section: string): Promise<string[]>;
  getTitle(externalId: string): Promise<ProviderTitle | null>;
  // Fallback when the device cannot play the recipe as it is: the direct
  // stream URL, resolved from the server (short-lived, never stored). Null if
  // the service refuses it from here (geo-blocked).
  resolveStream?(recipeUrl: string): Promise<string | null>;
}
