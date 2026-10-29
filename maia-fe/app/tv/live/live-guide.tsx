"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { channels, scheduleAround, type Program } from "@/lib/mock";
import { hhmm, useNow } from "@/lib/use-now";

const PX_PER_MIN = 4; // one hour = 240px
const MIN = 60 * 1000;

export default function LiveGuide() {
  const now = useNow();
  const schedule = useMemo(() => (now ? scheduleAround(now) : []), [now]);
  const [preview, setPreview] = useState<Program | null>(null);

  if (!now) return <div className="min-h-dvh" />;

  const hour = 60 * MIN;
  const from = Math.floor(now / hour) * hour - 30 * MIN;
  const to = from + 5 * hour;
  const x = (t: number) => ((Math.max(t, from) - from) / MIN) * PX_PER_MIN;
  const current = (chId: string) => schedule.find((p) => p.channelId === chId && p.start <= now && p.end > now);
  const shown = preview ?? current(channels[0].id) ?? null;
  const shownChannel = channels.find((c) => c.id === shown?.channelId);

  return (
    <div className="px-4 pt-2 sm:px-10 md:pt-10">
      <h1 className="font-display text-3xl font-semibold sm:text-4xl">Live</h1>

      {/* Phone: what's on now, one channel per row. */}
      <ul className="mt-6 grid gap-3 md:hidden">
        {channels.map((ch) => {
          const p = current(ch.id);
          return (
            <li key={ch.id}>
              <Link href={`/guarda/live-${ch.id}`} className="lamp flex items-center gap-4 rounded-2xl bg-dusk p-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-haze font-display text-lg font-semibold">
                  {ch.number}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-moon">{ch.name}</span>
                  <span className="block truncate text-lg">{p?.title}</span>
                  {p && (
                    <span className="mt-2 block h-1 overflow-hidden rounded-full bg-paper/15">
                      <span
                        className="block h-full bg-lamp"
                        style={{ width: `${((now - p.start) / (p.end - p.start)) * 100}%` }}
                      />
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* TV, desktop, tablet: preview of the focused program + the grid. */}
      <div className="hidden md:block">
        <div className="mt-6 flex min-h-36 items-end justify-between gap-8 rounded-3xl bg-dusk/70 p-8">
          {shown && (
            <div>
              <p className="text-moon">
                {shownChannel?.number} {shownChannel?.name}, {hhmm(shown.start)} – {hhmm(shown.end)}
                {shown.start <= now && shown.end > now ? ", in onda" : ""}
              </p>
              <p className="mt-2 font-display text-4xl font-semibold">{shown.title}</p>
            </div>
          )}
          <p className="text-moon">Su e giù per cambiare canale, OK per guardare</p>
        </div>

        <div className="rail mt-6 overflow-x-auto pb-10">
          <div className="relative" style={{ width: 176 + x(to) }}>
            {/* Time ruler */}
            <div className="sticky top-0 z-10 flex h-10 pl-44 text-sm text-moon">
              {Array.from({ length: 10 }, (_, i) => from + i * 30 * MIN).map((t) => (
                <span key={t} className="shrink-0" style={{ width: 30 * PX_PER_MIN }}>
                  {hhmm(t)}
                </span>
              ))}
            </div>
            {/* Now line */}
            <div
              aria-hidden
              className="absolute bottom-0 top-8 z-10 w-0.5 bg-lamp shadow-[0_0_12px_2px_rgb(245_184_86/0.6)]"
              style={{ left: 176 + x(now) }}
            />
            {channels.map((ch) => (
              <div key={ch.id} className="flex h-20 items-stretch gap-0 py-1">
                <div className="sticky left-0 z-20 flex w-44 shrink-0 items-center gap-3 bg-ink pr-3">
                  <span className="w-8 text-right font-display text-lg text-moon">{ch.number}</span>
                  <span className="truncate text-lg font-semibold">{ch.name}</span>
                </div>
                <div className="relative flex-1">
                  {schedule
                    .filter((p) => p.channelId === ch.id && p.end > from && p.start < to)
                    .map((p) => {
                      const live = p.start <= now && p.end > now;
                      return (
                        <Link
                          key={p.start}
                          href={live ? `/guarda/live-${ch.id}` : "#"}
                          onFocus={() => setPreview(p)}
                          onMouseEnter={() => setPreview(p)}
                          className={`lamp absolute inset-y-0 flex flex-col justify-center overflow-hidden rounded-xl border px-4 ${
                            live ? "border-lamp/40 bg-haze" : p.end <= now ? "border-transparent bg-dusk/40 text-moon" : "border-line/50 bg-dusk"
                          }`}
                          style={{ left: x(p.start), width: Math.max(x(p.end) - x(p.start) - 6, 24) }}
                        >
                          <span className="truncate text-base">{p.title}</span>
                          <span className="truncate text-sm text-moon">{hhmm(p.start)}</span>
                        </Link>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
