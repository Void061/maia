"use client";

import Link from "next/link";
import { useMemo } from "react";
import Hero from "@/components/hero";
import Poster, { GenreCard, PosterSkeleton, Tile } from "@/components/poster";
import Rail from "@/components/rail";
import Spotlight from "@/components/spotlight";
import { channels, scheduleAround } from "@/lib/live-demo";
import { useProfile } from "@/lib/session";
import { useGenres, useHome } from "@/lib/tv";
import { greeting, hhmm, useNow } from "@/lib/use-now";

// Home, HBO Max layout: hero carousel, then editorial rows (new, live,
// explore, spotlight) before the plain genre rows. Everything comes from the
// catalog in maia-be except the live channels (still demo data).
export default function TvHome() {
  const profile = useProfile();
  const now = useNow();
  const home = useHome();
  const genres = useGenres();

  const rows = home.data?.rows ?? [];
  const newest = rows.find((r) => r.key === "new");
  const genreRows = rows.filter((r) => r.genre);
  const spotlight = genreRows[0];
  const other = rows.filter((r) => r !== newest && r !== spotlight);

  if (home.isError) {
    return (
      <div className="night min-h-dvh px-4 pt-28 sm:px-10 lg:px-16">
        <p className="text-lg text-muted">Il catalogo non risponde. Riprova tra poco.</p>
      </div>
    );
  }

  return (
    <div className="bg-canvas">
      <Hero items={home.data?.featured ?? []} eyebrow={now && profile ? `${greeting(now)}, ${profile.name}` : undefined} />

      <div className="relative">
        {home.isPending && (
          <Rail title="Novità">
            {Array.from({ length: 8 }, (_, i) => (
              <PosterSkeleton key={i} className="w-32 sm:w-44 xl:w-52" />
            ))}
          </Rail>
        )}

        {newest && (
          <Rail title={newest.name}>
            {newest.items.map((t, i) => (
              // Right under the hero: on phones its first tiles are on screen at once.
              <Tile key={t.id} title={t} eager={i < 2} className="w-64 sm:w-80 xl:w-96" />
            ))}
          </Rail>
        )}

        <OnAir now={now} />

        {genres.data && genres.data.length > 0 && (
          <Rail title="Esplora">
            {genres.data.slice(0, 12).map((g) => (
              <GenreCard
                key={g.slug}
                href={`/tv/genre/${g.slug}`}
                name={g.name}
                image={rows.find((r) => r.genre === g.slug)?.items.find((t) => t.backdropUrl)?.backdropUrl}
              />
            ))}
          </Rail>
        )}

        {spotlight && spotlight.items.length > 1 && (
          <Spotlight heading={`In primo piano: ${spotlight.name.toLowerCase()}`} lead={spotlight.items[0]} more={spotlight.items.slice(1)} />
        )}

        {other.map((row) => (
          <Rail key={row.key} title={row.name} href={row.genre ? `/tv/genre/${row.genre}` : row.key === "movies" ? "/tv/movies" : "/tv/series"}>
            {row.items.map((t) => (
              <Poster key={t.id} title={t} className="w-32 sm:w-44 xl:w-52" />
            ))}
          </Rail>
        ))}
        <div className="h-16" />
      </div>
    </div>
  );
}

// Live channels: demo data until channels and EPG are in maia-be.
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
