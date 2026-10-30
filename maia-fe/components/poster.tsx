import Image from "next/image";
import Link from "next/link";
import { backdropUrl, genreArtUrl, posterUrl, type Title } from "@/lib/mock";

// Shared focus treatment for every card: the artwork lifts with a white edge.
const art =
  "focusable lift relative block overflow-hidden rounded-xl bg-surface group-focus-visible:scale-[1.06] group-focus-visible:shadow-[0_0_0_2px_white,0_30px_60px_-15px_black]";

// Bottom scrim strong enough that white text stays readable on any image.
const scrim = "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent";

const subtitle = (t: Title) =>
  t.kind === "SERIES" ? `${t.seasons} stagion${t.seasons === 1 ? "e" : "i"}` : `${t.year}`;

// Portrait poster, Max style: the title is set inside the artwork, at the bottom.
export default function Poster({ title, className = "" }: { title: Title; className?: string }) {
  return (
    <Link href={`/tv/title/${title.id}`} data-title={title.id} className={`group block shrink-0 outline-none ${className}`}>
      <span className={`${art} aspect-[2/3]`}>
        <Image src={posterUrl(title.id)} alt="" fill unoptimized className="object-cover" />
        <span className={`${scrim} h-1/2`} />
        <span className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
          <span className="block font-display text-base leading-tight font-extrabold text-white sm:text-xl">
            {title.name}
          </span>
        </span>
      </span>
    </Link>
  );
}

// Landscape tile (Continua a guardare, Novità): 16:9 with caption below.
export function Tile({ title, className = "" }: { title: Title; className?: string }) {
  return (
    <Link href={`/tv/title/${title.id}`} data-title={title.id} className={`group block shrink-0 outline-none ${className}`}>
      <span className={`${art} aspect-video`}>
        <Image src={backdropUrl(title.id)} alt="" fill unoptimized className="object-cover" />
        {title.progress !== undefined && (
          <>
            <span className={`${scrim} h-16`} />
            <span className="absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded-full bg-white/30">
              <span className="block h-full rounded-full bg-white" style={{ width: `${title.progress * 100}%` }} />
            </span>
          </>
        )}
      </span>
      <span className="mt-3 block truncate text-sm font-semibold text-label sm:text-base">{title.name}</span>
      <span className="block text-sm text-faint">{subtitle(title)}</span>
    </Link>
  );
}

// Top 10: a huge outlined rank number beside the poster.
export function Top10Card({ title, rank }: { title: Title; rank: number }) {
  return (
    <Link href={`/tv/title/${title.id}`} data-title={title.id} className="group relative flex shrink-0 items-end gap-1 outline-none">
      <span
        aria-hidden
        className="select-none font-display text-[6rem] leading-[0.8] font-black text-black sm:text-[9rem]"
        style={{ WebkitTextStroke: "3px rgb(255 255 255 / 0.7)", letterSpacing: "-0.06em" }}
      >
        {rank}
      </span>
      <span className={`${art} aspect-[2/3] w-28 sm:w-40`}>
        <Image src={posterUrl(title.id)} alt="" fill unoptimized className="object-cover" />
      </span>
      <span className="sr-only">
        {rank}. {title.name}
      </span>
    </Link>
  );
}

// "Esplora" tile: a doorway into a genre (or any menu entry stored in the DB).
export function GenreCard({ href, name, slug }: { href: string; name: string; slug: string }) {
  return (
    <Link href={href} className="group block w-56 shrink-0 outline-none sm:w-72">
      <span className={`${art} aspect-video`}>
        <Image src={genreArtUrl(slug)} alt="" fill unoptimized className="object-cover" />
        <span className="absolute inset-0 bg-gradient-to-tr from-black/90 via-black/50 to-black/10" />
        <span className="absolute bottom-4 left-4 font-display text-2xl font-extrabold text-white sm:text-3xl">
          {name}
        </span>
      </span>
    </Link>
  );
}
