"use client";

import { useEffect, useRef, useState } from "react";
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

  // On-screen keyboard (TV, large screens): closed until the search field is
  // pressed (OK on the remote, a click, Enter), not just reached with the arrows.
  const [keyboard, setKeyboard] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const firstKey = useRef<HTMLButtonElement>(null);
  const focusKeys = useRef(false);
  useEffect(() => {
    // Opened from the remote: straight to the letters.
    if (keyboard && focusKeys.current) firstKey.current?.focus();
    focusKeys.current = false;
  }, [keyboard]);
  const closeKeyboard = () => {
    setKeyboard(false);
    input.current?.focus();
  };

  return (
    <div className="night min-h-dvh px-4 pt-20 sm:px-10 md:pt-28 lg:px-16">
      <h1 className="font-display text-4xl font-extrabold sm:text-5xl">Cerca</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <div
          ref={area}
          // While open, the keyboard is a layer for the remote: arrows stay in it and
          // Back/Esc close it instead of leaving the page (components/spatial-nav.tsx).
          {...(keyboard ? { "data-focus-trap": "" } : {})}
          // Leaving the search area with the mouse or touch closes the keyboard too.
          onBlur={(e) => {
            if (!area.current?.contains(e.relatedTarget as Node | null)) setKeyboard(false);
          }}
          onKeyDown={(e) => {
            const typing = e.target === input.current;
            if (keyboard && (e.key === "Escape" || (e.key === "Backspace" && !typing))) {
              e.preventDefault();
              closeKeyboard();
            }
          }}
        >
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onClick={() => setKeyboard(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !keyboard) {
                e.preventDefault();
                focusKeys.current = true;
                setKeyboard(true);
              }
            }}
            aria-controls="search-keyboard"
            placeholder="Titolo di un film o di una serie"
            className="focusable h-16 w-full rounded-2xl bg-surface px-5 text-2xl placeholder:text-lg placeholder:text-faint"
          />
          {/* On-screen keyboard: only where there is no physical or touch
              keyboard to rely on (TV, large screens), and only once asked for. */}
          {keyboard && (
          <div id="search-keyboard" role="group" aria-label="Tastiera" className="mt-4 hidden grid-cols-6 gap-2 md:grid">
            {KEYS.map((k, i) => (
              <button
                key={k}
                ref={i === 0 ? firstKey : undefined}
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
            <button onClick={closeKeyboard} className="focusable pill-focus col-span-6 h-12 rounded-xl bg-white/5 text-muted">
              Chiudi tastiera
            </button>
          </div>
          )}
        </div>
        <div>
          <h2 className="text-muted">{query ? (found.isPending ? "Cerco…" : `${found.data?.total ?? 0} risultati`) : "Suggeriti"}</h2>
          <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-6 pb-16 sm:grid-cols-4 sm:gap-x-6 xl:grid-cols-5">
            {results.map((t, i) => (
              // The first two rows are on screen at once (the keyboard is closed): load them eagerly.
              <Poster key={t.id} title={t} eager={i < 10} />
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
