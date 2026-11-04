"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PlayIcon, PlusIcon } from "@/components/icons";
import Poster, { Art } from "@/components/poster";
import Trailer from "@/components/trailer";
import { episodeLabel, flatEpisodes, useTitle, type ExtraGroup, type TitleDetail as Detail } from "@/lib/tv";

const extraKind: Record<ExtraGroup["kind"], string> = {
  HIGHLIGHTS: "Highlights",
  CLIPS: "Clip",
  PREVIEWS: "Anticipazioni",
  EXTRAS: "Extra",
};

export default function TitleScreen({ id }: { id: string }) {
  const { data, isPending, isError } = useTitle(id);
  if (isPending) return <section aria-busy className="min-h-[82vh] animate-pulse bg-surface" />;
  if (isError || !data) {
    return (
      <div className="night min-h-dvh px-4 pt-28 sm:px-10 lg:px-16">
        <p className="text-lg text-muted">Questo titolo non è disponibile.</p>
      </div>
    );
  }
  return <TitleDetail title={data} />;
}

// Sources are deliberately absent: MAIA picks and switches them on its own,
// the viewer never sees where a title comes from.
function TitleDetail({ title }: { title: Detail }) {
  const play = useRef<HTMLAnchorElement>(null);
  const isSeries = title.kind === "SERIES";
  const [season, setSeason] = useState(title.seasonList[0]?.number ?? 1);
  const tabs = [
    ...(isSeries ? [{ key: "episodi", label: "Episodi" }] : []),
    ...(title.extras.length ? [{ key: "extra", label: "Extra" }] : []),
    ...(title.similar.length ? [{ key: "simili", label: "Altri come questo" }] : []),
    { key: "dettagli", label: "Dettagli" },
  ];
  const [tab, setTab] = useState(tabs[0].key);
  const [trailer, setTrailer] = useState(false);
  const closeTrailer = useCallback(() => setTrailer(false), []);

  // Land on the main action, ready for OK on the remote.
  useEffect(() => play.current?.focus(), []);

  const first = isSeries ? flatEpisodes(title)[0] : null;
  const length = isSeries
    ? `${title.seasonList.length} stagion${title.seasonList.length === 1 ? "e" : "i"}`
    : title.minutes
      ? `${title.minutes} min`
      : null;
  const episodes = title.seasonList.find((s) => s.number === season)?.episodes ?? [];
  // Extras of the chosen season first (when the group says), then the general ones.
  const extras = isSeries
    ? [...title.extras.filter((g) => g.season === season), ...title.extras.filter((g) => g.season === null || g.season === undefined)]
    : title.extras;
  const seasonName = (n: number) => (n >= 1900 ? `Edizione ${n}` : `Stagione ${n}`);

  return (
    <div className="bg-canvas">
      {trailer && title.trailerUrl && <Trailer url={title.trailerUrl} name={title.name} onClose={closeTrailer} />}
      <section data-hero="title" className="relative min-h-[82vh] overflow-hidden">
        <Art src={title.backdropUrl ?? title.posterUrl} seed={title.id} eager />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/40" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/30 to-transparent" />

        <div className="relative flex min-h-[82vh] flex-col justify-end px-4 pb-12 pt-28 sm:px-10 lg:px-16">
          <h1 className="max-w-4xl font-display text-5xl leading-[0.95] font-extrabold sm:text-8xl">{title.name}</h1>
          <p className="mt-5 text-base font-medium text-muted sm:text-lg">
            {[isSeries ? "Serie" : "Film", title.genres.slice(0, 3).join(", "), title.year ? String(title.year) : null, length]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {title.overview && (
            <p className="mt-4 line-clamp-5 max-w-2xl text-lg leading-relaxed text-label/90 sm:text-xl">{title.overview}</p>
          )}
          <div className="mt-8 flex items-center gap-3">
            <Link
              ref={play}
              href={first ? `/watch/${title.id}?ep=${first.id}` : `/watch/${title.id}`}
              className="focusable inline-flex h-14 items-center gap-2 rounded-full bg-white px-8 text-lg font-semibold text-black"
            >
              <PlayIcon /> Guarda
            </Link>
            {title.trailerUrl && (
              <button
                onClick={() => setTrailer(true)}
                className="focusable pill-focus inline-flex h-14 items-center rounded-full bg-white/[0.15] px-8 text-lg font-semibold"
              >
                Trailer
              </button>
            )}
            <button
              aria-label="Aggiungi ai preferiti"
              className="tv-none focusable pill-focus glass grid size-12 shrink-0 place-items-center rounded-full sm:size-14"
            >
              <PlusIcon />
            </button>
          </div>
        </div>
      </section>

      {/* Max-style tabs under the hero. */}
      <section data-block className="px-4 pb-20 sm:px-10 lg:px-16">
        <div role="tablist" aria-label="Sezioni" className="flex gap-6 overflow-x-auto border-b border-hairline [scrollbar-width:none]">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              onFocus={() => setTab(t.key)}
              className="focusable -mb-px shrink-0 rounded-t-lg border-b-2 border-transparent px-1 pb-3 pt-1 text-lg font-semibold text-faint aria-selected:border-white aria-selected:text-label"
            >
              {t.label}
            </button>
          ))}
        </div>

        {(tab === "episodi" || (tab === "extra" && isSeries)) && title.seasonList.length > 1 && (
          // One row that scrolls sideways: long series (20+ seasons) used to fill the screen before the episodes.
          <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:mx-0 sm:px-0">
            {title.seasonList.map((s) => (
              <button
                key={s.number}
                onClick={() => setSeason(s.number)}
                aria-pressed={season === s.number}
                className="focusable pill-focus h-11 shrink-0 rounded-full px-5 text-base font-medium text-muted aria-pressed:bg-white/15 aria-pressed:text-label"
              >
                {seasonName(s.number)}
              </button>
            ))}
          </div>
        )}

        {tab === "episodi" && (
          <div className="rail-clip">
          <div className="rail -mx-4 mt-4 flex gap-5 overflow-x-auto px-4 pb-6 pt-4 sm:mx-0 sm:px-0">
            {episodes.map((ep, i) => (
              <Link key={ep.id} href={`/watch/${title.id}?ep=${ep.id}`} className="tv-tile group block w-64 shrink-0 outline-none sm:w-80">
                <span className="focusable lift relative block aspect-video overflow-hidden rounded-xl bg-surface group-focus-visible:scale-[1.06] group-focus-visible:shadow-[0_0_0_2px_white,0_30px_60px_-15px_black]">
                  {/* The first ones are on screen; without a picture of its own an episode reuses the
                      hero's (already loaded, so eager costs nothing and Next stops flagging it as LCP). */}
                  <Art src={ep.imageUrl ?? title.backdropUrl} seed={ep.id} eager={i < 4 || !ep.imageUrl} />
                  <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [&>svg]:size-8">
                    <PlayIcon />
                  </span>
                </span>
                <span className="mt-3 block text-sm text-faint">{episodeLabel(ep)}</span>
                <span className="block truncate text-base font-semibold text-label">{ep.name}</span>
                {ep.minutes && <span className="block text-sm text-faint">{ep.minutes} min</span>}
              </Link>
            ))}
          </div>
          </div>
        )}

        {tab === "extra" &&
          (extras.length ? (
            extras.map((g) => (
              <div key={g.id} className="mt-6">
                <h3 className="text-base font-semibold text-muted">
                  {g.label.toLowerCase().startsWith(extraKind[g.kind].toLowerCase()) ? g.label : `${extraKind[g.kind]} · ${g.label}`}
                </h3>
                <div className="rail-clip">
                <div className="rail -mx-4 flex gap-5 overflow-x-auto px-4 pb-4 pt-3 sm:mx-0 sm:px-0">
                  {g.items.map((x) => (
                    <Link key={x.id} href={`/watch/${title.id}?extra=${x.id}`} className="tv-tile group block w-56 shrink-0 outline-none sm:w-64">
                      <span className="focusable lift relative block aspect-video overflow-hidden rounded-xl bg-surface group-focus-visible:scale-[1.06] group-focus-visible:shadow-[0_0_0_2px_white,0_30px_60px_-15px_black]">
                        <Art src={x.imageUrl ?? title.backdropUrl} seed={x.id} />
                        {x.minutes && (
                          <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white">
                            {x.minutes} min
                          </span>
                        )}
                      </span>
                      <span className="mt-2 line-clamp-2 text-sm font-semibold text-label">{x.name}</span>
                    </Link>
                  ))}
                </div>
                </div>
              </div>
            ))
          ) : (
            <p className="mt-6 text-muted">Nessun extra per questa stagione.</p>
          ))}

        {tab === "simili" && (
          <div className="tv-grid mt-6 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 sm:gap-x-6 lg:grid-cols-6 xl:grid-cols-7">
            {title.similar.map((t) => (
              <Poster key={t.id} title={t} />
            ))}
          </div>
        )}

        {tab === "dettagli" && (
          <dl className="mt-6 grid max-w-3xl gap-x-10 gap-y-5 sm:grid-cols-2">
            {[
              ["Titolo", title.name],
              ...(title.originalName && title.originalName !== title.name ? [["Titolo originale", title.originalName]] : []),
              ["Tipo", isSeries ? "Serie" : "Film"],
              ["Generi", title.genres.join(", ") || "—"],
              ["Anno", title.year ? String(title.year) : "—"],
              [isSeries ? "Stagioni" : "Durata", length ?? "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-sm text-faint">{k}</dt>
                <dd className="mt-1 text-lg text-label">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}
