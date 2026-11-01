// Provider layer: what a service says about a title, normalized but not yet
// matched to the MAIA catalog (see docs/tv/catalog.md, "Due livelli").

export type ProviderId = 'raiplay';

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
  // The episode's own picture (a frame of it), not the show's artwork.
  imageUrl: string | null;
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

export type ProviderExtra = ProviderVideo & { externalId: string; title: string; imageUrl: string | null };

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
  posterUrl: string | null;
  backdropUrl: string | null;
  // Movies only.
  video: ProviderVideo | null;
  // Series only.
  seasons: ProviderSeason[];
  extras: ProviderExtraGroup[];
};

// A TV channel of the service's guide.
export type ProviderChannel = {
  externalId: string;
  name: string;
  position: number;
  logoUrl: string | null;
};

// One slot of a channel's schedule. `replayPath`: page of the recording, if it
// can be watched again.
export type ProviderProgram = {
  externalId: string;
  title: string;
  episodeTitle: string | null;
  description: string;
  startsAt: Date;
  endsAt: Date;
  imageUrl: string | null;
  replayPath: string | null;
};

export interface ProviderAdapter {
  readonly id: ProviderId;
  // External ids of the titles listed in one section of the service.
  listSection(section: string): Promise<string[]>;
  getTitle(externalId: string): Promise<ProviderTitle | null>;
  // Fallback when the device cannot play the recipe as it is: the direct
  // stream URL, resolved from the server (short-lived, never stored). Null if
  // the service refuses it from here (geo-blocked).
  resolveStream?(recipeUrl: string): Promise<string | null>;
  // TV guide and replays, for the services that have them.
  listChannels?(): Promise<ProviderChannel[]>;
  // One day (YYYY-MM-DD, the service's local day) of a channel's schedule.
  channelGuide?(channel: string, day: string): Promise<ProviderProgram[]>;
  // The link of a recording, read when someone presses play; null = it cannot
  // be played here (DRM, gone).
  resolveReplay?(replayPath: string): Promise<{ playbackUrl: string; durationSec: number | null } | null>;
}
