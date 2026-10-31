import Image from "next/image";
import Link from "next/link";
import { subtitle, type TitleCard } from "@/lib/tv";

// Shared focus treatment for every card: the artwork lifts with a white edge.
const art =
  "focusable lift relative block overflow-hidden rounded-xl bg-surface group-focus-visible:scale-[1.06] group-focus-visible:shadow-[0_0_0_2px_white,0_30px_60px_-15px_black]";

// Bottom scrim strong enough that white text stays readable on any image.
const scrim = "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent";

// Titles without artwork get a calm gradient, a different hue per title.
function Fallback({ seed }: { seed: string }) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span
      aria-hidden
      className="absolute inset-0"
      style={{ background: `linear-gradient(160deg, hsl(${h} 45% 28%), hsl(${(h + 40) % 360} 40% 10%))` }}
    />
  );
}

function Art({ src, seed, priority }: { src: string | null | undefined; seed: string; priority?: boolean }) {
  return src ? (
    <Image src={src} alt="" fill unoptimized priority={priority} className="object-cover" />
  ) : (
    <Fallback seed={seed} />
  );
}

// Portrait poster, Max style: the title is set inside the artwork, at the bottom.
export default function Poster({ title, className = "" }: { title: TitleCard; className?: string }) {
  return (
    <Link href={`/tv/title/${title.id}`} data-title={title.id} className={`group block shrink-0 outline-none ${className}`}>
      <span className={`${art} aspect-[2/3]`}>
        <Art src={title.posterUrl ?? title.backdropUrl} seed={title.id} />
        <span className={`${scrim} h-1/2`} />
        <span className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
          <span className="line-clamp-3 font-display text-base leading-tight font-extrabold text-white sm:text-xl">
            {title.name}
          </span>
        </span>
      </span>
    </Link>
  );
}

// Landscape tile (Novità): 16:9 with caption below.
export function Tile({ title, className = "" }: { title: TitleCard; className?: string }) {
  return (
    <Link href={`/tv/title/${title.id}`} data-title={title.id} className={`group block shrink-0 outline-none ${className}`}>
      <span className={`${art} aspect-video`}>
        <Art src={title.backdropUrl ?? title.posterUrl} seed={title.id} />
      </span>
      <span className="mt-3 block truncate text-sm font-semibold text-label sm:text-base">{title.name}</span>
      <span className="block text-sm text-faint">{subtitle(title)}</span>
    </Link>
  );
}

// Top 10: a huge outlined rank number beside the poster.
export function Top10Card({ title, rank }: { title: TitleCard; rank: number }) {
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
        <Art src={title.posterUrl ?? title.backdropUrl} seed={title.id} />
      </span>
      <span className="sr-only">
        {rank}. {title.name}
      </span>
    </Link>
  );
}

// "Esplora" tile: a doorway into a genre (or any menu entry stored in the DB).
export function GenreCard({ href, name, image }: { href: string; name: string; image?: string | null }) {
  return (
    <Link href={href} className="group block w-56 shrink-0 outline-none sm:w-72">
      <span className={`${art} aspect-video`}>
        <Art src={image} seed={name} />
        <span className="absolute inset-0 bg-gradient-to-tr from-black/90 via-black/50 to-black/10" />
        <span className="absolute bottom-4 left-4 font-display text-2xl font-extrabold text-white sm:text-3xl">
          {name}
        </span>
      </span>
    </Link>
  );
}

// Placeholder while a row loads, same size as the real cards.
export function PosterSkeleton({ className = "" }: { className?: string }) {
  return <span className={`block aspect-[2/3] shrink-0 animate-pulse rounded-xl bg-surface ${className}`} />;
}

// Re-exported for the screens that print the line under a title.
export { Art };
