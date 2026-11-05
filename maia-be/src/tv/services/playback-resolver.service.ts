import { Injectable, NotFoundException } from '@nestjs/common';
import { CacheService } from '../../cache/cache.service.js';
import {
  SdmAdapter,
  episodeRelinker,
  movieRelinkerUrl,
} from '../providers/sdm/sdm.adapter.js';
import type {
  PlaybackResolution,
  SdmEpisodeMapping,
  SdmKind,
  SdmSearchResult,
  SdmTitleMapping,
} from '../providers/sdm/sdm.types.js';
import { TmdbCatalogService, parseId } from '../tmdb-catalog.service.js';
import type { TitleDetailDto } from '../tv.dto.js';

// From a catalog id to the video on SDM, at the moment of playing. What is
// stable (which SDM title or episode a TMDB id is) lives in the cache; the HLS
// URL expires, so it is read from the server at every playback.

// Years on the two sides can be one apart (a festival, a release abroad).
const YEAR_TOLERANCE = 1;

type PlaybackItem = {
  // The title's catalog id: `series-7` for `series-7-s1e2`.
  titleId: string;
  kind: SdmKind;
  tmdbId: number;
  season: number | null;
  episode: number | null;
};

type MatchTarget = {
  kind: SdmKind;
  names: string[];
  year: number | null;
};

const noSource = () =>
  new NotFoundException({
    code: 'NO_SOURCE',
    message: 'Nessuna fonte per questo titolo.',
  });

const mappingKey = (id: string) => `sdm:mapping:${id}`;

// `movie-603`, `series-7` or an episode, `series-7-s1e2`.
export function parsePlaybackId(id: string): PlaybackItem | null {
  const m = /^(series-\d+)-s(\d+)e(\d+)$/.exec(id);
  const titleId = m ? m[1] : id;
  const title = parseId(titleId);
  return (
    title && {
      ...title,
      titleId,
      season: m ? Number(m[2]) : null,
      episode: m ? Number(m[3]) : null,
    }
  );
}

// "L'Été: Parte 2" -> "l ete parte 2": the same title however it is written.
export function normalizeTitle(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// The only result that is the title: same kind, same name (localized or
// original), the closest year. Results without a year come last. Two equally
// good results give null: better no video than the wrong one.
export function pickMatch(
  results: SdmSearchResult[],
  target: MatchTarget,
): SdmSearchResult | null {
  const names = new Set(target.names.map(normalizeTitle));
  const same = results.filter(
    (r) => r.kind === target.kind && names.has(normalizeTitle(r.name)),
  );
  const gap = (r: SdmSearchResult) =>
    r.year === null || target.year === null
      ? null
      : Math.abs(r.year - target.year);

  for (let years = 0; years <= YEAR_TOLERANCE; years++) {
    const close = same.filter((r) => gap(r) === years);
    if (close.length) return close.length === 1 ? close[0] : null;
  }
  const undated = same.filter((r) => gap(r) === null);
  return undated.length === 1 ? undated[0] : null;
}

@Injectable()
export class PlaybackResolverService {
  private readonly sdm = new SdmAdapter();

  constructor(
    private readonly catalog: TmdbCatalogService,
    private readonly cache: CacheService,
  ) {}

  async resolve(itemId: string): Promise<PlaybackResolution> {
    const item = parsePlaybackId(itemId);
    if (!item) throw noSource();
    return item.kind === 'MOVIE'
      ? this.playMovie(itemId, item)
      : this.playEpisode(itemId, item);
  }

  private async playMovie(
    itemId: string,
    item: PlaybackItem,
  ): Promise<PlaybackResolution> {
    const { externalId } = await this.titleMapping(item);
    const relinkerUrl = movieRelinkerUrl(externalId);
    if (!relinkerUrl) throw noSource();
    return {
      itemId,
      externalId,
      season: null,
      episode: null,
      hlsUrl: await this.stream(relinkerUrl),
    };
  }

  private async playEpisode(
    itemId: string,
    item: PlaybackItem,
  ): Promise<PlaybackResolution> {
    const { season, episode } = await this.episodeOf(item);
    const mapping = await this.episodeMapping(item, season, episode);
    return {
      itemId,
      externalId: mapping.externalId,
      season,
      episode,
      hlsUrl: await this.stream(
        episodeRelinker(mapping.titleId, mapping.episodeId),
      ),
    };
  }

  // The episode asked for; for a whole series, the first one TMDB lists.
  private async episodeOf(item: PlaybackItem) {
    if (item.season !== null && item.episode !== null)
      return { season: item.season, episode: item.episode };
    const { seasonList } = await this.catalog.title(item.titleId);
    const first = seasonList.find((s) => s.episodes.length)?.episodes[0];
    if (first?.number == null) throw noSource();
    return { season: first.season, episode: first.number };
  }

  // Failures throw, so that `wrap` stores only what was really found: a title
  // the server gets later is found at the next playback.
  private titleMapping(item: PlaybackItem): Promise<SdmTitleMapping> {
    return this.cache.wrap(mappingKey(item.titleId), async () => {
      const title = await this.catalog.title(item.titleId);
      const match = await this.findOnSdm(title);
      if (!match) throw noSource();
      return {
        tmdbId: item.tmdbId,
        kind: item.kind,
        externalId: match.externalId,
      };
    });
  }

  private episodeMapping(
    item: PlaybackItem,
    season: number,
    episode: number,
  ): Promise<SdmEpisodeMapping> {
    const key = mappingKey(`${item.titleId}-s${season}e${episode}`);
    return this.cache.wrap(key, async () => {
      const { tmdbId, externalId } = await this.titleMapping(item);
      const found = await this.sdm.getSeason(externalId, season);
      const ep = found?.episodes.find((e) => e.episode === episode);
      if (!ep) throw noSource();
      return {
        tmdbId,
        kind: 'SERIES',
        externalId,
        season,
        episode,
        titleId: ep.titleId,
        episodeId: ep.externalId,
      };
    });
  }

  // By the localized name first, then the original one: a second search only
  // when the first finds nothing.
  private async findOnSdm(
    title: TitleDetailDto,
  ): Promise<SdmSearchResult | null> {
    const target = {
      kind: title.kind,
      names: [title.name, title.originalName ?? ''].filter(Boolean),
      year: title.year,
    };
    const type = title.kind === 'MOVIE' ? 'movie' : 'tv';
    for (const name of new Set(target.names)) {
      const { titles } = await this.sdm.search(name, { type });
      const match = pickMatch(titles, target);
      if (match) return match;
    }
    return null;
  }

  private async stream(relinkerUrl: string): Promise<string> {
    const hlsUrl = await this.sdm.resolveStream(relinkerUrl);
    if (!hlsUrl) throw noSource();
    return hlsUrl;
  }
}
