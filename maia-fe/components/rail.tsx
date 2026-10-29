import Link from "next/link";

// A horizontal row of items. Vertical padding on the scroller leaves room for
// the lifted, focused item so it is never clipped.
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
    <section className="mt-4 sm:mt-6">
      <div className="flex items-baseline justify-between px-4 sm:px-10 lg:px-16">
        <h2 className="font-display text-xl font-bold sm:text-2xl">{title}</h2>
        {href && (
          <Link href={href} tabIndex={-1} className="text-sm font-medium text-muted hover:text-label">
            Vedi tutto
          </Link>
        )}
      </div>
      <div className="rail relative flex gap-4 overflow-x-auto px-4 pb-4 pt-4 sm:gap-6 sm:px-10 sm:pb-6 lg:px-16">{children}</div>
    </section>
  );
}
