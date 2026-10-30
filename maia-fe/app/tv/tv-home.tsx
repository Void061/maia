"use client";

import Link from "next/link";
import { useMemo } from "react";
import Hero from "@/components/hero";
import Poster, { GenreCard, Tile, Top10Card } from "@/components/poster";
import Rail from "@/components/rail";
import Spotlight from "@/components/spotlight";
import { byGenre, channels, findTitle, genres, newIds, pick, scheduleAround, titles, top10Ids } from "@/lib/mock";
import { useProfile } from "@/lib/session";
import { greeting, hhmm, useNow } from "@/lib/use-now";

const featured = [titles[0], titles[3], titles[5], titles[1]];

// Home, HBO Max layout: hero carousel, then editorial rows (resume, top 10,
// live, explore, new, spotlight) before the plain genre rows.
export default function TvHome() {
  const profile = useProfile();
  const now = useNow();
  const resume = titles.filter((t) => t.progress !== undefined);

  return (
    <div className="bg-canvas">
      <Hero items={featured} eyebrow={now && profile ? `${greeting(now)}, ${profile.name}` : undefined} />

      <div className="relative">
        <Rail title="Continua a guardare">
          {resume.map((t) => (
            <Tile key={t.id} title={t} className="w-64 sm:w-80 xl:w-96" />
          ))}
        </Rail>

        <Rail title="Top 10 di oggi">
          {pick(top10Ids).map((t, i) => (
            <Top10Card key={t.id} title={t} rank={i + 1} />
          ))}
        </Rail>

        <OnAir now={now} />

        <Rail title="Esplora">
          {genres.map((g) => (
            <GenreCard key={g.slug} href={`/tv/genre/${g.slug}`} name={g.name} slug={g.slug} />
          ))}
        </Rail>

        <Rail title="Novità">
          {pick(newIds).map((t) => (
            <Tile key={t.id} title={t} className="w-64 sm:w-80 xl:w-96" />
          ))}
        </Rail>

        <Spotlight heading="In primo piano: gialli" lead={findTitle("t10")!} more={byGenre("crime").filter((t) => t.id !== "t10")} />

        {genres.map((g) => {
          const list = byGenre(g.slug);
          if (list.length < 2) return null;
          return (
            <Rail key={g.slug} title={g.name} href={`/tv/genre/${g.slug}`}>
              {list.map((t) => (
                <Poster key={t.id} title={t} className="w-32 sm:w-44 xl:w-52" />
              ))}
            </Rail>
          );
        })}
        <div className="h-16" />
      </div>
    </div>
  );
}

function OnAir({ now }: { now: number | null }) {
  const onAir = useMemo(() => {
    if (!now) return [];
    const schedule = scheduleAround(now);
    return channels.map((ch) => ({
      ch,
      prog: schedule.find((p) => p.channelId === ch.id && p.start <= now && p.end > now),
    }));
  }, [now]);

  return (
    <Rail title="In onda ora" href="/tv/live">
      {onAir.map(({ ch, prog }) => (
        <Link key={ch.id} href={`/watch/live-${ch.id}`} className="group block w-64 shrink-0 outline-none sm:w-80 xl:w-96">
          <span className="focusable lift relative flex aspect-video flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-br from-surface to-raised p-4 group-focus-visible:scale-[1.06] group-focus-visible:shadow-[0_0_0_2px_white,0_30px_60px_-15px_black] sm:p-5">
            <span className="flex items-center justify-between">
              <span className="rounded-md bg-white px-2 py-0.5 text-xs font-bold text-black">LIVE</span>
              <span className="text-sm text-muted">{ch.number}</span>
            </span>
            <span className="font-display text-2xl font-bold sm:text-3xl">{ch.name}</span>
            {prog && now && (
              <span className="block h-1 overflow-hidden rounded-full bg-white/20">
                <span
                  className="block h-full bg-white"
                  style={{ width: `${((now - prog.start) / (prog.end - prog.start)) * 100}%` }}
                />
              </span>
            )}
          </span>
          {prog && now && (
            <>
              <span className="mt-3 block truncate text-sm font-semibold text-label sm:text-base">{prog.title}</span>
              <span className="block text-sm text-faint">
                {hhmm(prog.start)} – {hhmm(prog.end)}
              </span>
            </>
          )}
        </Link>
      ))}
    </Rail>
  );
}
