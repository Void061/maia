import Link from "next/link";

// "/" never renders in practice: proxy.ts sends it to the login or the
// profiles. A redirect() here broke Next's prerender check (cacheComponents)
// on every visit, so this is only a fallback link.
export default function Home() {
  return (
    <main className="grid min-h-screen place-items-center">
      <Link href="/login" className="focusable rounded-full bg-white px-6 py-3 font-semibold text-black">
        Entra in MAIA
      </Link>
    </main>
  );
}
