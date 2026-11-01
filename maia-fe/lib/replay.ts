"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type components } from "./api";

// Replays of the TV guide: what aired on the Rai channels in the last 7 days
// (maia-be keeps the guide; see docs/tv/catalog.md, "Replay").
export type Channel = components["schemas"]["ChannelDto"];
export type Program = components["schemas"]["ProgramDto"];
export type ReplayDetail = components["schemas"]["ReplayDetailDto"];

export const useChannels = () =>
  useQuery({ queryKey: ["tv", "channels"], queryFn: () => api<Channel[]>("/tv/channels"), staleTime: 60 * 60_000 });

export const useReplays = (channel: string | undefined, day: string | undefined) =>
  useQuery({
    queryKey: ["tv", "replays", channel, day],
    queryFn: () => api<Program[]>(`/tv/replay?${new URLSearchParams({ channel: channel!, date: day! })}`),
    enabled: !!channel && !!day,
    staleTime: 5 * 60_000,
  });

export const useReplay = (id: string) =>
  useQuery({ queryKey: ["tv", "replay", id], queryFn: () => api<ReplayDetail>(`/tv/replay/${id}`), staleTime: 5 * 60_000 });

const rome = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleString("it-IT", { timeZone: "Europe/Rome", ...opts });

// Today and the 7 days before it, as Rome calendar days (YYYY-MM-DD).
export const replayDays = (now: number) =>
  Array.from({ length: 8 }, (_, i) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(now - i * 86_400_000)));

// "Oggi", "Ieri", then "sab 25".
export const dayLabel = (day: string, index: number) =>
  index === 0 ? "Oggi" : index === 1 ? "Ieri" : new Date(`${day}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", timeZone: "UTC" });

export const hm = (iso: string) => rome(new Date(iso), { hour: "2-digit", minute: "2-digit" });

// "sabato 31 ottobre, 21:30", for the player header.
export const airedOn = (iso: string) => rome(new Date(iso), { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export const minutesBetween = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / 60_000);
