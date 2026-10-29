"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PlayIcon, PlusIcon } from "@/components/icons";
import { backdropUrl, genres, type Title } from "@/lib/mock";

const episodeNames = ["Il ritorno", "La nebbia", "Sotto il ponte", "Testimoni", "Il molo", "Alba"];

// Sources are deliberately absent: MAIA picks and switches them on its own,
// the viewer never sees where a title comes from.
export default function TitleDetail({ title }: { title: Title }) {
  const play = useRef<HTMLAnchorElement>(null);
  const [season, setSeason] = useState(1);

  // Land on the main action, ready for OK on the remote.
  useEffect(() => play.current?.focus(), []);

  const genreNames = title.genres.map((g) => genres.find((x) => x.slug === g)?.name ?? g);
  const length =
    title.kind === "MOVIE" ? `${title.minutes} min` : `${title.seasons} stagion${title.seasons === 1 ? "e" : "i"}`;

  return (
    <div className="bg-canvas">
      <section className="relative min-h-[82vh] overflow-hidden">
        <Image src={backdropUrl(title.id)} alt="" fill unoptimized priority className="object-cover" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/40" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/30 to-transparent" />

        <div className="relative flex min-h-[82vh] flex-col justify-end px-4 pb-12 pt-28 sm:px-10 lg:px-16">
          <h1 className="max-w-4xl font-display text-5xl leading-[0.95] font-extrabold sm:text-8xl">{title.name}</h1>
          <p className="mt-5 text-base font-medium text-muted sm:text-lg">
            {[title.kind === "SERIES" ? "Serie" : "Film", genreNames.join(", "), String(title.year), length].join(" · ")}
          </p>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-label/90 sm:text-xl">{title.overview}</p>
          <div className="mt-8 flex items-center gap-3">
            <Link
              ref={play}
              href={`/guarda/${title.id}`}
              className="focusable inline-flex h-14 items-center gap-2 rounded-full bg-white px-8 text-lg font-semibold text-black"
            >
              <PlayIcon /> {title.progress !== undefined ? "Riprendi" : "Guarda"}
            </Link>
            <button
              aria-label="Aggiungi ai preferiti"
              className="focusable pill-focus glass grid size-14 place-items-center rounded-full"
            >
              <PlusIcon />
            </button>
          </div>
          {title.progress !== undefined && (
            <div className="mt-5 flex max-w-xs items-center gap-3 text-sm text-muted">
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
                <span className="block h-full bg-white" style={{ width: `${title.progress * 100}%` }} />
              </span>
              {title.kind === "SERIES"
                ? "S1, E3"
                : `${Math.round((1 - title.progress) * (title.minutes ?? 90))} min rimasti`}
            </div>
          )}
        </div>
      </section>

      {title.kind === "SERIES" && (
        <section className="px-4 pb-20 sm:px-10 lg:px-16">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: title.seasons ?? 1 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setSeason(n)}
                aria-pressed={season === n}
                className="focusable pill-focus h-11 rounded-full px-5 text-base font-medium text-muted aria-pressed:bg-white/15 aria-pressed:text-label"
              >
                Stagione {n}
              </button>
            ))}
          </div>
          <div className="rail -mx-4 mt-6 flex gap-5 overflow-x-auto px-4 pb-6 pt-2 sm:mx-0 sm:px-0">
            {episodeNames.map((name, i) => {
              const ep = i + 1;
              return (
                <Link key={ep} href={`/guarda/${title.id}`} className="group block w-64 shrink-0 outline-none sm:w-80">
                  <span className="focusable lift relative block aspect-video overflow-hidden rounded-xl bg-surface group-focus-visible:scale-[1.06] group-focus-visible:shadow-[0_0_0_2px_white,0_30px_60px_-15px_black]">
                    <Image
                      src={`https://picsum.photos/seed/maia-${title.id}-s${season}e${ep}/640/360`}
                      alt=""
                      fill
                      unoptimized
                      className="object-cover"
                    />
                    {season === 1 && ep === 3 && title.progress !== undefined && (
                      <span className="absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded-full bg-white/30">
                        <span className="block h-full w-2/5 bg-white" />
                      </span>
                    )}
                  </span>
                  <span className="mt-3 block text-sm text-faint">Episodio {ep}</span>
                  <span className="block truncate text-base font-medium text-label">{name}</span>
                  <span className="block text-sm text-faint">{48 + ((ep * 7) % 12)} min</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
