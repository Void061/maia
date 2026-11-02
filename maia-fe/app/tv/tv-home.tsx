"use client";

import Hero from "@/components/hero";
import Poster, { GenreCard, PosterSkeleton, Tile } from "@/components/poster";
import Rail from "@/components/rail";
import Spotlight from "@/components/spotlight";
import { useProfile } from "@/lib/session";
import { useGenres, useHome } from "@/lib/tv";
import { greeting, useNow } from "@/lib/use-now";

// Home, HBO Max layout: hero carousel, then editorial rows (new, explore,
// spotlight) before the plain genre rows. Everything comes from the catalog
// in maia-be.
export default function TvHome() {
  const profile = useProfile();
  const now = useNow();
  const home = useHome();
  const genres = useGenres();

  const rows = home.data?.rows ?? [];
  const newest = rows.find((r) => r.key === "new");
  const genreRows = rows.filter((r) => r.genre);
  const spotlight = genreRows[0];
  const other = rows.filter((r) => r !== newest && r !== spotlight);

  if (home.isError) {
    return (
      <div className="night min-h-dvh px-4 pt-28 sm:px-10 lg:px-16">
        <p className="text-lg text-muted">Il catalogo non risponde. Riprova tra poco.</p>
      </div>
    );
  }

  return (
    <div className="bg-canvas">
      <Hero items={home.data?.featured ?? []} eyebrow={now && profile ? `${greeting(now)}, ${profile.name}` : undefined} />

      <div className="relative">
        {home.isPending && (
          <Rail title="Novità">
            {Array.from({ length: 8 }, (_, i) => (
              <PosterSkeleton key={i} className="w-32 sm:w-44 xl:w-52" />
            ))}
          </Rail>
        )}

        {newest && (
          <Rail title={newest.name}>
            {newest.items.map((t, i) => (
              // Right under the hero: on phones its first tiles are on screen at once.
              <Tile key={t.id} title={t} eager={i < 2} className="w-64 sm:w-80 xl:w-96" />
            ))}
          </Rail>
        )}

        {genres.data && genres.data.length > 0 && (
          <Rail title="Esplora">
            {genres.data.slice(0, 12).map((g) => (
              <GenreCard
                key={g.slug}
                href={`/tv/genre/${g.slug}`}
                name={g.name}
                image={rows.find((r) => r.genre === g.slug)?.items.find((t) => t.backdropUrl)?.backdropUrl}
              />
            ))}
          </Rail>
        )}

        {spotlight && spotlight.items.length > 1 && (
          <Spotlight heading={`In primo piano: ${spotlight.name.toLowerCase()}`} lead={spotlight.items[0]} more={spotlight.items.slice(1)} />
        )}

        {other.map((row) => (
          <Rail key={row.key} title={row.name} href={row.genre ? `/tv/genre/${row.genre}` : row.key === "movies" ? "/tv/movies" : "/tv/series"}>
            {row.items.map((t) => (
              <Poster key={t.id} title={t} className="w-32 sm:w-44 xl:w-52" />
            ))}
          </Rail>
        ))}
        <div className="h-16" />
      </div>
    </div>
  );
}
