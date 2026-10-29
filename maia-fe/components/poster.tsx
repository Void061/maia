import Image from "next/image";
import Link from "next/link";
import { backdropUrl, posterUrl, type Title } from "@/lib/mock";

const subtitle = (t: Title) =>
  t.kind === "SERIES" ? `${t.seasons} stagion${t.seasons === 1 ? "e" : "i"}` : `${t.year}`;

// Portrait poster (genre rails, catalog grids): artwork only, caption below.
export default function Poster({ title, className = "" }: { title: Title; className?: string }) {
  return (
    <Link href={`/tv/titolo/${title.id}`} data-title={title.id} className={`group block shrink-0 outline-none ${className}`}>
      <span className="focusable lift relative block aspect-[2/3] overflow-hidden rounded-xl bg-surface group-focus-visible:scale-[1.06] group-focus-visible:shadow-[0_0_0_2px_white,0_30px_60px_-15px_black]">
        <Image src={posterUrl(title.id)} alt="" fill unoptimized className="object-cover" />
      </span>
      <span className="mt-3 block truncate text-sm font-medium text-muted transition-colors group-hover:text-label group-focus-visible:text-label sm:text-base">
        {title.name}
      </span>
    </Link>
  );
}

// Landscape tile (Continua a guardare, featured rows): 16:9 with progress.
export function Tile({ title, className = "" }: { title: Title; className?: string }) {
  return (
    <Link href={`/tv/titolo/${title.id}`} data-title={title.id} className={`group block shrink-0 outline-none ${className}`}>
      <span className="focusable lift relative block aspect-video overflow-hidden rounded-xl bg-surface group-focus-visible:scale-[1.06] group-focus-visible:shadow-[0_0_0_2px_white,0_30px_60px_-15px_black]">
        <Image src={backdropUrl(title.id)} alt="" fill unoptimized className="object-cover" />
        {title.progress !== undefined && (
          <>
            <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
            <span className="absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded-full bg-white/30">
              <span className="block h-full rounded-full bg-white" style={{ width: `${title.progress * 100}%` }} />
            </span>
          </>
        )}
      </span>
      <span className="mt-3 block truncate text-sm font-medium text-label sm:text-base">{title.name}</span>
      <span className="block text-sm text-faint">{subtitle(title)}</span>
    </Link>
  );
}
