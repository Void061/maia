"use client";

import { useState } from "react";
import Poster from "@/components/poster";
import { titles } from "@/lib/mock";

const KEYS = "abcdefghijklmnopqrstuvwxyz1234567890".split("");

const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function Search() {
  const [q, setQ] = useState("");
  const results = q.trim() ? titles.filter((t) => normalize(t.name).includes(normalize(q.trim()))) : titles.slice(0, 7);

  return (
    <div className="px-4 pt-2 sm:px-10 md:pt-10">
      <h1 className="font-display text-3xl font-semibold sm:text-4xl">Cerca</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Titolo di un film o di una serie"
            className="lamp h-16 w-full rounded-2xl border border-line bg-dusk px-5 text-2xl placeholder:text-lg placeholder:text-moon/60"
          />
          {/* On-screen keyboard: only where there is no physical or touch
              keyboard to rely on (TV, large screens). */}
          <div className="mt-4 hidden grid-cols-6 gap-2 md:grid">
            {KEYS.map((k) => (
              <button
                key={k}
                onClick={() => setQ((v) => v + k)}
                className="lamp h-12 rounded-xl bg-dusk font-display text-xl uppercase hover:bg-haze"
              >
                {k}
              </button>
            ))}
            <button onClick={() => setQ((v) => v + " ")} className="lamp col-span-3 h-12 rounded-xl bg-dusk text-moon">
              Spazio
            </button>
            <button onClick={() => setQ((v) => v.slice(0, -1))} className="lamp col-span-2 h-12 rounded-xl bg-dusk text-moon">
              Cancella
            </button>
            <button onClick={() => setQ("")} className="lamp h-12 rounded-xl bg-dusk text-moon">
              Svuota
            </button>
          </div>
        </div>
        <div>
          <h2 className="text-moon">{q.trim() ? `${results.length} risultati` : "Suggeriti"}</h2>
          <div className="mt-4 grid grid-cols-3 gap-3 pb-12 sm:grid-cols-4 sm:gap-5 xl:grid-cols-5">
            {results.map((t) => (
              <Poster key={t.id} title={t} />
            ))}
          </div>
          {q.trim() && results.length === 0 && (
            <p className="text-lg text-moon">Nessun titolo contiene “{q.trim()}”. Prova con meno lettere.</p>
          )}
        </div>
      </div>
    </div>
  );
}
