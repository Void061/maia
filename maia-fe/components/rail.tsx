import Link from "next/link";

// A horizontal row of items. Padding on the scroller leaves room for the
// lifted, glowing item so the lamp is never clipped.
export default function Rail({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 sm:mt-10">
      <div className="flex items-baseline justify-between px-4 sm:px-10">
        <h2 className="font-display text-xl font-semibold sm:text-2xl">{title}</h2>
        {href && (
          <Link href={href} tabIndex={-1} className="text-sm text-moon hover:text-paper">
            Vedi tutti
          </Link>
        )}
      </div>
      <div className="rail flex gap-3 overflow-x-auto px-4 py-4 sm:gap-5 sm:px-10 sm:py-6">{children}</div>
    </section>
  );
}
