import { Suspense } from "react";
import { GenrePage } from "@/components/catalog";
import { byGenre, genres } from "@/lib/mock";

export function generateStaticParams() {
  return genres.filter((g) => byGenre(g.slug).length > 0).map((g) => ({ genre: g.slug }));
}

export default function Page({ params }: PageProps<"/tv/genre/[genre]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ genre: string }> }) {
  const { genre } = await params;
  return <GenrePage slug={genre} />;
}
