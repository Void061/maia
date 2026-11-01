"use client";

import Link from "next/link";
import { useState } from "react";
import { Art } from "@/components/poster";
import { dayLabel, hm, minutesBetween, replayDays, useChannels, useReplays, type Program } from "@/lib/replay";
import { useNow } from "@/lib/use-now";

// Replay, like RaiPlay's guide: pick a day of the last week and a channel,
// then any program that aired can be watched again.
export default function Replay() {
  const now = useNow(60_000);
  const channels = useChannels();
  const [day, setDay] = useState(0); // 0 = today, 1 = yesterday…
  const [picked, setPicked] = useState<string | null>(null);
  const days = now ? replayDays(now) : [];
  const channelId = picked ?? channels.data?.[0]?.id;
  const programs = useReplays(channelId, days[day]);
  const list = programs.data ?? [];

  return (
    <div className="night min-h-dvh px-4 pb-20 pt-20 sm:px-10 md:pt-28 lg:px-16">
      <h1 className="font-display text-4xl font-extrabold sm:text-5xl">Replay</h1>
      <p className="mt-2 text-muted">Rivedi i programmi andati in onda nell&apos;ultima settimana.</p>

      <div role="group" aria-label="Giorno" className="rail -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0">
        {days.map((d, i) => (
          <button
            key={d}
            onClick={() => setDay(i)}
            aria-pressed={day === i}
            className="focusable pill-focus h-11 shrink-0 rounded-full bg-white/10 px-5 text-base font-medium capitalize text-muted aria-pressed:bg-white aria-pressed:text-black"
          >
            {dayLabel(d, i)}
          </button>
        ))}
      </div>

      <div role="group" aria-label="Canale" className="rail -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0">
        {channels.data?.map((c) => (
          <button
            key={c.id}
            onClick={() => setPicked(c.id)}
            aria-pressed={channelId === c.id}
            aria-label={c.name}
            title={c.name}
            className="focusable pill-focus flex h-14 shrink-0 items-center gap-2 rounded-2xl bg-white/[0.06] px-4 text-sm font-semibold text-muted aria-pressed:bg-white/20 aria-pressed:text-label"
          >
            {c.logoUrl ? (
              // Logos differ in shape: shown as a fitted background, the name is the button's label.
              <span aria-hidden className="block h-8 w-20 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url("${c.logoUrl}")` }} />
            ) : (
              c.name
            )}
          </button>
        ))}
      </div>

      {channels.isError || programs.isError ? (
        <p className="mt-10 text-lg text-muted">La guida non risponde. Riprova tra poco.</p>
      ) : !programs.data ? (
        <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-6 sm:gap-y-8 lg:grid-cols-3 xl:grid-cols-4" aria-busy>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="aspect-video animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="mt-10 text-lg text-muted">
          {day === 0 ? "Ancora niente da rivedere oggi su questo canale." : "Nessun programma da rivedere in questo giorno."}
        </p>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-6 sm:gap-y-8 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((p) => (
            <li key={p.id}>
              <ProgramCard program={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProgramCard({ program: p }: { program: Program }) {
  const minutes = minutesBetween(p.start, p.end);
  return (
    <Link href={`/watch/replay-${p.id}`} className="group block outline-none">
      <span className="focusable lift relative block aspect-video overflow-hidden rounded-xl bg-surface group-focus-visible:scale-[1.04] group-focus-visible:shadow-[0_0_0_2px_white,0_30px_60px_-15px_black]">
        <Art src={p.imageUrl} seed={p.id} />
        <span className="absolute bottom-2 left-2 rounded-md bg-black/75 px-2 py-0.5 text-sm font-semibold tabular-nums text-white">
          {hm(p.start)}
        </span>
        {minutes > 0 && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-2 py-0.5 text-xs font-semibold text-white">{minutes} min</span>
        )}
      </span>
      <span className="mt-3 block truncate text-base font-semibold text-label">{p.title}</span>
      {p.episodeTitle && !p.title.includes(p.episodeTitle) && (
        <span className="block truncate text-sm text-faint">{p.episodeTitle}</span>
      )}
    </Link>
  );
}
