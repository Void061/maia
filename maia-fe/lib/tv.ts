"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type components } from "./api";

// MAIA TV catalog from maia-be (types generated from its OpenAPI).
export type TitleCard = components["schemas"]["TitleCardDto"];
export type TitleDetail = components["schemas"]["TitleDetailDto"];
export type Episode = components["schemas"]["EpisodeDto"];
export type ExtraGroup = components["schemas"]["ExtraGroupDto"];
export type Genre = components["schemas"]["GenreDto"];
export type Home = components["schemas"]["HomeDto"];
export type Playback = components["schemas"]["PlaybackDto"];
export type Kind = TitleCard["kind"];

// The catalog changes a few times a day: a few minutes of cache is plenty.
const STALE = 5 * 60_000;

export const useHome = () => useQuery({ queryKey: ["tv", "home"], queryFn: () => api<Home>("/tv/home"), staleTime: STALE });

export const useGenres = (kind?: Kind) =>
  useQuery({
    queryKey: ["tv", "genres", kind ?? "all"],
    queryFn: () => api<Genre[]>(`/tv/genres${kind ? `?kind=${kind}` : ""}`),
    staleTime: STALE,
  });

export type TitlesQuery = { kind?: Kind; genre?: string; q?: string; take?: number };

export const useTitles = (query: TitlesQuery, enabled = true) =>
  useQuery({
    queryKey: ["tv", "titles", query],
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") params.set(k, String(v));
      return api<{ items: TitleCard[]; total: number }>(`/tv/titles?${params}`);
    },
    staleTime: STALE,
    enabled,
  });

export const useTitle = (id: string) =>
  useQuery({ queryKey: ["tv", "title", id], queryFn: () => api<TitleDetail>(`/tv/titles/${id}`), staleTime: STALE });

// What to give the player for a movie, an episode or an extra; `exclude` skips
// the services that just failed on this device.
export const fetchPlayback = (itemId: string, exclude: string[] = []) =>
  api<Playback>(`/tv/playback/${itemId}${exclude.length ? `?exclude=${exclude.join(",")}` : ""}`);

// The same source as a direct playlist link for hls.js, resolved by maia-be,
// for when the device's native HLS rejects it.
export const fetchStream = (itemId: string, provider: string) =>
  api<Playback>(`/tv/playback/${itemId}/stream?provider=${encodeURIComponent(provider)}`);

export const reportPlaybackFailed =(itemId: string, provider: string) =>
  api(`/tv/playback/${itemId}/failed`, { method: "POST", body: { provider } }).catch(() => {});

// Episodes of a series in watching order, across seasons.
export const flatEpisodes = (t: TitleDetail): Episode[] => t.seasonList.flatMap((s) => s.episodes);

// "Episodio 3", or the air date for puntate known only by date.
export const episodeLabel = (e: Episode) =>
  e.number !== null && e.number !== undefined
    ? `Episodio ${e.number}`
    : e.airDate
      ? new Date(`${e.airDate}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })
      : "Puntata";

export const subtitle = (t: TitleCard) =>
  t.kind === "SERIES"
    ? t.seasons
      ? `${t.seasons} stagion${t.seasons === 1 ? "e" : "i"}`
      : "Serie"
    : [t.year, t.minutes ? `${t.minutes} min` : null].filter(Boolean).join(" · ");

export const meta = (t: TitleCard) =>
  [t.kind === "SERIES" ? "Serie" : "Film", t.genres[0], t.year ? String(t.year) : null].filter(Boolean).join(" · ");
