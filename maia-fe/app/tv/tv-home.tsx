"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PlayIcon, PlusIcon } from "@/components/icons";
import Poster, { Tile } from "@/components/poster";
import Rail from "@/components/rail";
import { ButtonLink } from "@/components/ui";
import { backdropUrl, byGenre, channels, genres, scheduleAround, titles, type Title } from "@/lib/mock";
import { useProfile } from "@/lib/session";
import { greeting, hhmm, useNow } from "@/lib/use-now";

const featured = [titles[0], titles[3], titles[5], titles[1]];
const SLIDE_MS = 8000;

const singular: Record<string, string> = {
  commedia: "Commedia",
  horror: "Horror",
  giallo: "Giallo",
  dramma: "Dramma",
  documentario: "Documentario",
  animazione: "Animazione",
};
const meta = (t: Title) =>
  [t.kind === "SERIES" ? "Serie" : "Film", singular[t.genres[0]], String(t.year)].filter(Boolean).join(" · ");

export default function TvHome() {
  const profile = useProfile();
  const now = useNow();
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const resume = titles.filter((t) => t.progress !== undefined);
  const current = featured[slide];

  // The hero advances on its own, and holds still while the remote is on it.
  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => setSlide((s) => (s + 1) % featured.length), SLIDE_MS);
    return () => clearTimeout(id);
  }, [slide, paused]);

  return (
    <div className="bg-canvas">
      <section
        className="relative h-[78vh] min-h-[30rem] overflow-hidden sm:h-[88vh]"
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <div key={current.id} className="absolute inset-0 animate-[fade_700ms_ease-out]">
          <Image src={backdropUrl(current.id)} alt="" fill unoptimized priority className="object-cover" />
        </div>
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-black/30" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/20 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 px-4 pb-10 sm:px-10 sm:pb-16 lg:px-16">
          <p className="text-base font-medium text-muted sm:text-lg">
            {now && profile ? `${greeting(now)}, ${profile.name}` : " "}
          </p>
          <h1
            key={current.id}
            className="mt-2 max-w-4xl animate-[fade_700ms_ease-out] font-display text-5xl leading-[0.95] font-extrabold sm:text-8xl"
          >
            {current.name}
          </h1>
          <p className="mt-4 text-base font-medium text-muted sm:text-lg">{meta(current)}</p>
          <p className="mt-3 line-clamp-2 max-w-xl text-base leading-relaxed text-label/85 sm:text-lg">
            {current.overview}
          </p>
          <div className="mt-7 flex items-center gap-3">
            <ButtonLink href={`/guarda/${current.id}`}>
              <PlayIcon /> {current.progress !== undefined ? "Riprendi" : "Guarda"}
            </ButtonLink>
            <ButtonLink href={`/tv/titolo/${current.id}`} variant="secondary">
              Dettagli
            </ButtonLink>
            <button
              aria-label="Aggiungi ai preferiti"
              className="focusable pill-focus glass grid size-14 place-items-center rounded-full"
            >
              <PlusIcon />
            </button>
          </div>
          <div className="mt-8 flex gap-2" role="tablist" aria-label="Titoli in evidenza">
            {featured.map((t, i) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={i === slide}
                aria-label={t.name}
                onClick={() => setSlide(i)}
                onFocus={() => setSlide(i)}
                className="focusable h-2 w-2 rounded-full bg-white/35 transition-all aria-selected:w-8 aria-selected:bg-white"
              />
            ))}
          </div>
        </div>
      </section>

      <div className="relative -mt-4">
        <Rail title="Continua a guardare">
          {resume.map((t) => (
            <Tile key={t.id} title={t} className="w-64 sm:w-80 xl:w-96" />
          ))}
        </Rail>

        <OnAir now={now} />

        {genres.map((g) => {
          const list = byGenre(g.slug);
          if (list.length < 2) return null;
          return (
            <Rail key={g.slug} title={g.name}>
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
        <Link key={ch.id} href={`/guarda/live-${ch.id}`} className="group block w-64 shrink-0 outline-none sm:w-80 xl:w-96">
          <span className="focusable lift relative flex aspect-video flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-br from-surface to-raised p-4 group-focus-visible:scale-[1.06] group-focus-visible:shadow-[0_0_0_2px_white,0_30px_60px_-15px_black] sm:p-5">
            <span className="flex items-center justify-between">
              <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold">Live</span>
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
              <span className="mt-3 block truncate text-sm font-medium text-label sm:text-base">{prog.title}</span>
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
