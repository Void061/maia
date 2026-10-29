"use client";

import Link from "next/link";
import Hero from "@/components/hero";
import Poster, { GenreCard, Top10Card } from "@/components/poster";
import Rail from "@/components/rail";
import { byGenre, findGenre, genres, pick, titles, top10Ids, type Kind } from "@/lib/mock";

const base = { MOVIE: "/tv/film", SERIES: "/tv/serie" } as const;
const label = { MOVIE: "Film", SERIES: "Serie" } as const;

// Film / Serie: a mini home for one kind. Hero, top 10, explore tiles, then
// one row per genre. The full grid lives inside each genre page.
export function Hub({ kind }: { kind: Kind }) {
  const ofKind = titles.filter((t) => t.kind === kind);
  const available = genres.filter((g) => byGenre(g.slug, kind).length > 0);
  const top = pick(top10Ids, kind);

  return (
    <div className="bg-canvas">
      <Hero items={ofKind.slice(0, 4)} eyebrow={label[kind]} />

      <div className="relative">
        {top.length > 2 && (
          <Rail title={`Top ${top.length} ${kind === "MOVIE" ? "film" : "serie"}`}>
            {top.map((t, i) => (
              <Top10Card key={t.id} title={t} rank={i + 1} />
            ))}
          </Rail>
        )}

        <Rail title="Esplora per genere">
          {available.map((g) => (
            <GenreCard key={g.slug} href={`${base[kind]}/${g.slug}`} name={g.name} slug={g.slug} />
          ))}
        </Rail>

        {available.map((g) => (
          <Rail key={g.slug} title={g.name} href={`${base[kind]}/${g.slug}`}>
            {byGenre(g.slug, kind).map((t) => (
              <Poster key={t.id} title={t} className="w-32 sm:w-44 xl:w-52" />
            ))}
          </Rail>
        ))}
        <div className="h-16" />
      </div>
    </div>
  );
}

// One genre (optionally one kind): hero with the genre's titles, then every
// title in a grid. Also backs shortcuts such as "Commedie" (both kinds).
export function GenrePage({ slug, kind }: { slug: string; kind?: Kind }) {
  const genre = findGenre(slug);
  const list = byGenre(slug, kind);
  if (!genre || list.length === 0) {
    return (
      <div className="night min-h-dvh px-4 pt-28 sm:px-10 lg:px-16">
        <p className="text-lg text-muted">Nessun titolo in questo genere, per ora.</p>
      </div>
    );
  }
  const heading = kind ? `${label[kind]} · ${genre.name}` : genre.name;

  return (
    <div className="bg-canvas">
      <Hero items={list.slice(0, 3)} eyebrow={heading} short />
      <section className="px-4 pb-20 pt-6 sm:px-10 lg:px-16">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl font-bold sm:text-2xl">
            Tutti i titoli <span className="text-faint">{list.length}</span>
          </h2>
          {kind && (
            <Link
              href={base[kind]}
              className="focusable pill-focus rounded-full px-4 py-1.5 text-sm font-medium text-muted"
            >
              Tutti i generi
            </Link>
          )}
        </div>
        <div className="mt-6 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 sm:gap-x-6 sm:gap-y-8 lg:grid-cols-5 xl:grid-cols-7">
          {list.map((t) => (
            <Poster key={t.id} title={t} />
          ))}
        </div>
      </section>
    </div>
  );
}
