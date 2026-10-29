"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PlayIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui";
import { backdropUrl, genres, type Title } from "@/lib/mock";

export default function TitleDetail({ title }: { title: Title }) {
  const play = useRef<HTMLAnchorElement>(null);
  const [season, setSeason] = useState(1);
  const [source, setSource] = useState<string>("auto");

  // Land on the main action, ready for OK on the remote.
  useEffect(() => play.current?.focus(), []);

  const genreNames = title.genres.map((g) => genres.find((x) => x.slug === g)?.name ?? g);
  const sourceQuery = source === "auto" ? "" : `?fonte=${encodeURIComponent(source)}`;

  return (
    <div className="relative min-h-dvh">
      <div aria-hidden className="pointer-events-none fixed inset-0 md:left-24">
        <Image src={backdropUrl(title.id)} alt="" fill unoptimized priority className="object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/80 to-ink/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
      </div>

      <div className="relative px-4 pt-[28vh] sm:px-10 md:pt-[30vh]">
        <p className="text-lg text-moon">{title.kind === "SERIES" ? "Serie" : "Film"}</p>
        <h1 className="mt-1 max-w-4xl font-display text-5xl leading-[1.02] font-bold sm:text-7xl">{title.name}</h1>
        <p className="mt-4 text-lg text-moon">
          {title.year}, {genreNames.join(", ").toLowerCase()},{" "}
          {title.kind === "MOVIE" ? `${title.minutes} minuti` : `${title.seasons} stagion${title.seasons === 1 ? "e" : "i"}`}
        </p>
        <p className="mt-5 max-w-2xl text-xl leading-relaxed text-paper/90">{title.overview}</p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            ref={play}
            href={`/guarda/${title.id}${sourceQuery}`}
            className="lamp inline-flex h-14 items-center gap-2 rounded-xl bg-lamp px-7 text-lg font-semibold text-ink"
          >
            <PlayIcon /> {title.progress !== undefined ? "Riprendi" : "Guarda"}
          </Link>
          <ButtonLink href="#" variant="ghost">
            Aggiungi ai preferiti
          </ButtonLink>
        </div>

        {/* Sources: MAIA picks the best one by itself; picking one here is optional. */}
        <div className="mt-10">
          <h2 className="text-moon">Disponibile su</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {["auto", ...title.sources].map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                aria-pressed={source === s}
                className="lamp h-11 rounded-full border border-line px-5 text-moon aria-pressed:border-lamp aria-pressed:text-paper"
              >
                {s === "auto" ? "Scelta automatica" : s}
              </button>
            ))}
          </div>
        </div>

        {title.kind === "SERIES" && (
          <section className="mt-12 pb-16">
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: title.seasons ?? 1 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setSeason(n)}
                  aria-pressed={season === n}
                  className="lamp h-11 rounded-full px-5 font-display text-lg text-moon aria-pressed:bg-haze aria-pressed:text-paper"
                >
                  Stagione {n}
                </button>
              ))}
            </div>
            <ol className="mt-6 grid max-w-4xl gap-3">
              {Array.from({ length: 6 }, (_, i) => i + 1).map((ep) => (
                <li key={ep}>
                  <Link
                    href={`/guarda/${title.id}`}
                    className="lamp flex items-center gap-5 rounded-2xl bg-dusk/80 p-4"
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-haze font-display text-xl">
                      {ep}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-lg">Episodio {ep}</span>
                      <span className="block text-moon">{48 + ((ep * 7) % 12)} minuti</span>
                    </span>
                    {season === 1 && ep === 3 && title.progress !== undefined && (
                      <span className="ml-auto shrink-0 text-sm text-lamp">Stai guardando</span>
                    )}
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}
        <div className="h-16" />
      </div>
    </div>
  );
}
