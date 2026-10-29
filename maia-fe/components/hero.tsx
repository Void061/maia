"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { PlayIcon, PlusIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui";
import { backdropUrl, type Title } from "@/lib/mock";

const SLIDE_MS = 8000;

const singular: Record<string, string> = {
  commedia: "Commedia",
  horror: "Horror",
  giallo: "Giallo",
  dramma: "Dramma",
  documentario: "Documentario",
  animazione: "Animazione",
};
export const meta = (t: Title) =>
  [t.kind === "SERIES" ? "Serie" : "Film", singular[t.genres[0]], String(t.year)].filter(Boolean).join(" · ");

// Full-bleed carousel. Advances on its own and holds still while the remote
// is on it. Text sits on a heavy bottom/left scrim so it reads on any image.
export default function Hero({
  items,
  eyebrow,
  short = false,
}: {
  items: Title[];
  eyebrow?: string | null;
  short?: boolean;
}) {
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const current = items[slide % items.length];

  useEffect(() => {
    if (paused || items.length < 2) return;
    const id = setTimeout(() => setSlide((s) => (s + 1) % items.length), SLIDE_MS);
    return () => clearTimeout(id);
  }, [slide, paused, items.length]);

  return (
    <section
      className={`relative overflow-hidden ${short ? "h-[62vh] min-h-[26rem]" : "h-[78vh] min-h-[30rem] sm:h-[86vh]"}`}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div key={current.id} className="absolute inset-0 animate-[fade_700ms_ease-out]">
        <Image src={backdropUrl(current.id)} alt="" fill unoptimized priority className="object-cover" />
      </div>
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/40" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 px-4 pb-8 sm:px-10 sm:pb-14 lg:px-16">
        {eyebrow !== null && (
          <p className="text-base font-medium text-muted sm:text-lg">{eyebrow ?? " "}</p>
        )}
        <h1
          key={current.id}
          className="mt-2 max-w-4xl animate-[fade_700ms_ease-out] font-display text-5xl leading-[0.95] font-extrabold sm:text-7xl lg:text-8xl"
        >
          {current.name}
        </h1>
        <p className="mt-4 text-base font-medium text-muted sm:text-lg">{meta(current)}</p>
        <p className="mt-3 line-clamp-2 max-w-xl text-base leading-relaxed text-label/90 sm:text-lg">
          {current.overview}
        </p>
        <div className="mt-6 flex items-center gap-2 sm:gap-3">
          <ButtonLink href={`/guarda/${current.id}`}>
            <PlayIcon /> {current.progress !== undefined ? "Riprendi" : "Guarda"}
          </ButtonLink>
          <ButtonLink href={`/tv/titolo/${current.id}`} variant="secondary">
            Dettagli
          </ButtonLink>
          <button
            aria-label="Aggiungi ai preferiti"
            className="focusable pill-focus glass grid size-12 shrink-0 place-items-center rounded-full sm:size-14"
          >
            <PlusIcon />
          </button>
        </div>
        {items.length > 1 && (
          <div className="mt-7 flex gap-2" role="tablist" aria-label="Titoli in evidenza">
            {items.map((t, i) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={i === slide % items.length}
                aria-label={t.name}
                onClick={() => setSlide(i)}
                onFocus={() => setSlide(i)}
                className="focusable h-2 w-2 rounded-full bg-white/35 transition-all aria-selected:w-8 aria-selected:bg-white"
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
