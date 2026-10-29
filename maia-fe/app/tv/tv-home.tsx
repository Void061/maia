"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PlayIcon } from "@/components/icons";
import Poster from "@/components/poster";
import Rail from "@/components/rail";
import { ButtonLink } from "@/components/ui";
import {
  backdropUrl,
  byGenre,
  channels,
  findTitle,
  genres,
  scheduleAround,
  titles,
  type Title,
} from "@/lib/mock";
import { useProfile } from "@/lib/session";
import { greeting, hhmm, useNow } from "@/lib/use-now";

export default function TvHome() {
  const profile = useProfile();
  const now = useNow();
  const featured = titles[0];
  // The backdrop follows whatever title has focus, so moving along a rail
  // with the remote previews it full-screen behind the rows.
  const [focused, setFocused] = useState<Title>(featured);
  const resume = titles.filter((t) => t.progress !== undefined);

  return (
    <div
      onFocusCapture={(e) => {
        const id = (e.target as HTMLElement).closest<HTMLElement>("[data-title]")?.dataset.title;
        const t = id && findTitle(id);
        if (t) setFocused(t);
      }}
    >
      <Backdrop title={focused} />

      <section className="relative flex min-h-[62vh] flex-col justify-end px-4 pb-4 sm:min-h-[60vh] sm:px-10">
        <p className="text-lg text-moon sm:text-xl">
          {now ? `${greeting(now)}${profile ? `, ${profile.name}` : ""}` : " "}
        </p>
        <h1 className="mt-2 max-w-3xl font-display text-4xl leading-[1.02] font-bold sm:text-7xl">{focused.name}</h1>
        <p className="mt-3 text-moon">
          {focused.kind === "SERIES" ? "Serie" : "Film"} del {focused.year}, su {focused.sources.join(" e ")}
        </p>
        <p className="mt-4 line-clamp-3 max-w-xl text-lg leading-relaxed text-paper/85">{focused.overview}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href={`/guarda/${focused.id}`}>
            <PlayIcon /> {focused.progress !== undefined ? "Riprendi" : "Guarda"}
          </ButtonLink>
          <ButtonLink href={`/tv/titolo/${focused.id}`} variant="ghost">
            Dettagli
          </ButtonLink>
        </div>
      </section>

      <div className="relative">
        <Rail title="Continua a guardare">
          {resume.map((t) => (
            <Poster key={t.id} title={t} className="w-36 sm:w-48 xl:w-56" />
          ))}
        </Rail>

        <OnAir now={now} />

        {genres.map((g) => {
          const list = byGenre(g.slug);
          if (list.length < 2) return null;
          return (
            <Rail key={g.slug} title={g.name}>
              {list.map((t) => (
                <Poster key={t.id} title={t} className="w-36 sm:w-48 xl:w-56" />
              ))}
            </Rail>
          );
        })}
        <div className="h-16" />
      </div>
    </div>
  );
}

function Backdrop({ title }: { title: Title }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-0 md:left-24">
      {/* Keyed so each new title fades in over the previous one. */}
      <div key={title.id} className="absolute inset-0 animate-[fade_600ms_ease-out]">
        <Image src={backdropUrl(title.id)} alt="" fill unoptimized priority className="object-cover opacity-55" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/70 to-ink/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
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
        <Link
          key={ch.id}
          href={`/guarda/live-${ch.id}`}
          className="lamp lamp-lift flex w-64 shrink-0 flex-col justify-between rounded-2xl border border-line bg-dusk/80 p-4 sm:w-72"
        >
          <div className="flex items-center justify-between">
            <span className="font-display text-lg font-semibold">{ch.name}</span>
            <span className="text-sm text-moon">{ch.number}</span>
          </div>
          {prog && now && (
            <div className="mt-6">
              <p className="truncate text-lg">{prog.title}</p>
              <p className="mt-1 text-sm text-moon">
                {hhmm(prog.start)} – {hhmm(prog.end)}
              </p>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-paper/15">
                <div
                  className="h-full bg-lamp"
                  style={{ width: `${((now - prog.start) / (prog.end - prog.start)) * 100}%` }}
                />
              </div>
            </div>
          )}
        </Link>
      ))}
    </Rail>
  );
}
