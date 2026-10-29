"use client";

import { useState } from "react";
import Poster from "@/components/poster";
import { genres, titles, type Kind } from "@/lib/mock";

// Film / Serie: one grid, filtered by genre chips. The same component will
// back the menu entries and shortcuts stored in the database.
export default function Catalog({ kind, title }: { kind: Kind; title: string }) {
  const [genre, setGenre] = useState<string | null>(null);
  const list = titles.filter((t) => t.kind === kind && (!genre || t.genres.includes(genre)));
  const available = genres.filter((g) => titles.some((t) => t.kind === kind && t.genres.includes(g.slug)));

  return (
    <div className="night min-h-dvh px-4 pt-20 sm:px-10 md:pt-28 lg:px-16">
      <h1 className="font-display text-4xl font-extrabold sm:text-5xl">{title}</h1>
      <div className="rail -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 py-2 sm:mx-0 sm:flex-wrap sm:px-0">
        {[{ slug: null, name: "Tutti" }, ...available].map((g) => (
          <button
            key={g.slug ?? "all"}
            onClick={() => setGenre(g.slug)}
            aria-pressed={genre === g.slug}
            className="focusable pill-focus h-11 shrink-0 rounded-full bg-white/10 px-5 font-medium text-muted aria-pressed:bg-white aria-pressed:text-black"
          >
            {g.name}
          </button>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-3 gap-x-3 gap-y-6 pb-16 sm:grid-cols-4 sm:gap-x-6 lg:grid-cols-5 xl:grid-cols-7">
        {list.map((t) => (
          <Poster key={t.id} title={t} />
        ))}
      </div>
      {list.length === 0 && <p className="mt-6 text-lg text-muted">Nessun titolo in questo genere, per ora.</p>}
    </div>
  );
}
