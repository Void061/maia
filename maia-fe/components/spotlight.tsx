import Link from "next/link";
import Poster, { Art } from "@/components/poster";
import { meta, type TitleCard } from "@/lib/tv";

// "In primo piano": one large feature card followed by related titles in the
// same row. Text inside the card sits on a solid scrim for legibility.
export default function Spotlight({ heading, lead, more }: { heading: string; lead: TitleCard; more: TitleCard[] }) {
  return (
    <section className="mt-6 sm:mt-10">
      <h2 className="px-4 font-display text-xl font-bold sm:px-10 sm:text-2xl lg:px-16">{heading}</h2>
      <div className="rail relative flex items-stretch gap-4 overflow-x-auto px-4 pb-6 pt-4 sm:gap-6 sm:px-10 lg:px-16">
        <Link href={`/tv/title/${lead.id}`} data-title={lead.id} className="group block shrink-0 outline-none">
          <span className="focusable lift relative block aspect-video w-[19rem] overflow-hidden rounded-xl bg-surface group-focus-visible:scale-[1.04] group-focus-visible:shadow-[0_0_0_2px_white,0_30px_60px_-15px_black] sm:w-[34rem] lg:w-[40rem]">
            {/* On phones this is often the first large picture on screen: load it at once. */}
            <Art src={lead.backdropUrl ?? lead.posterUrl} seed={lead.id} eager />
            <span className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
            <span className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
              <span className="block font-display text-2xl font-extrabold text-white sm:text-4xl">{lead.name}</span>
              <span className="mt-1 block text-sm font-medium text-muted sm:text-base">{meta(lead)}</span>
              <span className="mt-2 line-clamp-2 hidden max-w-lg text-base text-label/90 sm:block">{lead.overview}</span>
            </span>
          </span>
        </Link>
        {more.map((t) => (
          <Poster key={t.id} title={t} className="w-32 sm:w-44 xl:w-52" />
        ))}
      </div>
    </section>
  );
}
