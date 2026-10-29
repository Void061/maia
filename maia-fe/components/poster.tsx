import Image from "next/image";
import Link from "next/link";
import { posterUrl, type Title } from "@/lib/mock";

export default function Poster({ title, className = "" }: { title: Title; className?: string }) {
  return (
    <Link
      href={`/tv/titolo/${title.id}`}
      data-title={title.id}
      className={`lamp lamp-lift group relative block aspect-[2/3] shrink-0 overflow-hidden rounded-2xl bg-haze ${className}`}
    >
      <Image src={posterUrl(title.id)} alt="" fill unoptimized className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
        <p className="font-display text-base leading-tight font-semibold sm:text-lg">{title.name}</p>
        <p className="mt-1 text-xs text-moon sm:text-sm">
          {title.kind === "SERIES" ? `${title.seasons} stagion${title.seasons === 1 ? "e" : "i"}` : `${title.year}`}
        </p>
        {title.progress !== undefined && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-paper/20">
            <div className="h-full rounded-full bg-lamp" style={{ width: `${title.progress * 100}%` }} />
          </div>
        )}
      </div>
    </Link>
  );
}
