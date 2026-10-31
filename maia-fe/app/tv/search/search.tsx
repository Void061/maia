"use client";

import { useEffect, useState } from "react";
import Poster from "@/components/poster";
import { useTitles } from "@/lib/tv";

const KEYS = "abcdefghijklmnopqrstuvwxyz1234567890".split("");

export default function Search() {
  const [q, setQ] = useState("");
  // Searches the catalog once typing pauses, not at every key.
  const [query, setQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  const found = useTitles({ q: query, take: 60 }, query.length > 0);
  const suggested = useTitles({ take: 14 });
  const results = query ? (found.data?.items ?? []) : (suggested.data?.items ?? []);

  return (
    <div className="night min-h-dvh px-4 pt-20 sm:px-10 md:pt-28 lg:px-16">
      <h1 className="font-display text-4xl font-extrabold sm:text-5xl">Cerca</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Titolo di un film o di una serie"
            className="focusable h-16 w-full rounded-2xl bg-surface px-5 text-2xl placeholder:text-lg placeholder:text-faint"
          />
          {/* On-screen keyboard: only where there is no physical or touch
              keyboard to rely on (TV, large screens). */}
          <div className="mt-4 hidden grid-cols-6 gap-2 md:grid">
            {KEYS.map((k) => (
              <button
                key={k}
                onClick={() => setQ((v) => v + k)}
                className="focusable pill-focus h-12 rounded-xl bg-white/5 text-xl font-medium uppercase"
              >
                {k}
              </button>
            ))}
            <button onClick={() => setQ((v) => v + " ")} className="focusable pill-focus col-span-3 h-12 rounded-xl bg-white/5 text-muted">
              Spazio
            </button>
            <button onClick={() => setQ((v) => v.slice(0, -1))} className="focusable pill-focus col-span-2 h-12 rounded-xl bg-white/5 text-muted">
              Cancella
            </button>
            <button onClick={() => setQ("")} className="focusable pill-focus h-12 rounded-xl bg-white/5 text-muted">
              Svuota
            </button>
          </div>
        </div>
        <div>
          <h2 className="text-muted">{query ? (found.isPending ? "Cerco…" : `${found.data?.total ?? 0} risultati`) : "Suggeriti"}</h2>
          <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-6 pb-16 sm:grid-cols-4 sm:gap-x-6 xl:grid-cols-5">
            {results.map((t, i) => (
              // The first row is on screen at once: load it eagerly.
              <Poster key={t.id} title={t} eager={i < 5} />
            ))}
          </div>
          {query && !found.isPending && results.length === 0 && (
            <p className="text-lg text-muted">Nessun titolo contiene “{query}”. Prova con meno lettere.</p>
          )}
        </div>
      </div>
    </div>
  );
}
