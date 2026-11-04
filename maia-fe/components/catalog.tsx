"use client";

import Link from "next/link";
import Hero from "@/components/hero";
import Poster, { GenreCard, PosterSkeleton } from "@/components/poster";
import Rail from "@/components/rail";
import { useGenres, useTitles, type Kind } from "@/lib/tv";

const base = { MOVIE: "/tv/movies", SERIES: "/tv/series" } as const;
const label = { MOVIE: "Film", SERIES: "Serie" } as const;
// Genre rows on a hub; the rest are reachable from "Esplora per genere".
const HUB_ROWS = 8;

// Film / Serie: a mini home for one kind. Hero, explore tiles, then one row
// per genre. The full grid lives inside each genre page.
export function Hub({ kind }: { kind: Kind }) {
  const latest = useTitles({ kind, take: 20 });
  const genres = useGenres(kind);
  const withArt = (latest.data?.items ?? []).filter((t) => t.backdropUrl);

  return (
    <div className="bg-canvas">
      <Hero items={withArt.slice(0, 5)} eyebrow={label[kind]} />

      <div className="relative">
        {latest.data && latest.data.items.length > 0 && (
          <Rail title={kind === "MOVIE" ? "Ultimi film arrivati" : "Ultime serie arrivate"}>
            {latest.data.items.map((t) => (
              <Poster key={t.id} title={t} className="w-32 sm:w-44 xl:w-52" />
            ))}
          </Rail>
        )}

        {genres.data && genres.data.length > 0 && (
          <Rail title="Esplora per genere">
            {genres.data.map((g) => (
              <GenreCard key={g.slug} href={`${base[kind]}/${g.slug}`} name={g.name} image={g.imageUrl} />
            ))}
          </Rail>
        )}

        {genres.data?.slice(0, HUB_ROWS).map((g) => (
          <GenreRow key={g.slug} kind={kind} slug={g.slug} name={g.name} />
        ))}
        <div className="tv-none h-16" />
      </div>
    </div>
  );
}

function GenreRow({ kind, slug, name }: { kind: Kind; slug: string; name: string }) {
  const { data, isPending } = useTitles({ kind, genre: slug, take: 20 });
  return (
    <Rail title={name} href={`${base[kind]}/${slug}`}>
      {isPending
        ? Array.from({ length: 6 }, (_, i) => <PosterSkeleton key={i} className="w-32 sm:w-44 xl:w-52" />)
        : data?.items.map((t) => <Poster key={t.id} title={t} className="w-32 sm:w-44 xl:w-52" />)}
    </Rail>
  );
}

// One genre (optionally one kind): hero with the genre's titles, then every
// title in a grid. Also backs shortcuts such as "Commedie" (both kinds).
export function GenrePage({ slug, kind }: { slug: string; kind?: Kind }) {
  const genres = useGenres(kind);
  const list = useTitles({ genre: slug, kind, take: 200 });
  const genre = genres.data?.find((g) => g.slug === slug);
  const items = list.data?.items ?? [];

  if (list.isPending || genres.isPending) {
    return <Hero items={[]} short />;
  }
  if (!genre || items.length === 0) {
    return (
      <div className="night min-h-dvh px-4 pt-28 sm:px-10 lg:px-16">
        <p className="text-lg text-muted">Nessun titolo in questo genere, per ora.</p>
      </div>
    );
  }
  const heading = kind ? `${label[kind]} · ${genre.name}` : genre.name;

  return (
    <div className="bg-canvas">
      <Hero items={items.filter((t) => t.backdropUrl).slice(0, 3)} eyebrow={heading} short />
      <section data-block className="px-4 pb-20 pt-6 sm:px-10 lg:px-16">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl font-bold sm:text-2xl">
            Tutti i titoli <span className="text-faint">{list.data?.total ?? items.length}</span>
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
        <div className="tv-grid mt-6 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 sm:gap-x-6 sm:gap-y-8 lg:grid-cols-5 xl:grid-cols-7">
          {/* The first rows of the grid are on screen at once: load them eagerly. */}
          {items.map((t, i) => (
            <Poster key={t.id} title={t} eager={i < 14} />
          ))}
        </div>
      </section>
    </div>
  );
}
