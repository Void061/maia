import { Suspense } from "react";
import { GenrePage } from "@/components/catalog";
import { byGenre, genres } from "@/lib/mock";

export function generateStaticParams() {
  return genres.filter((g) => byGenre(g.slug, "MOVIE").length > 0).map((g) => ({ genere: g.slug }));
}

export default function Page({ params }: PageProps<"/tv/film/[genere]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ genere: string }> }) {
  const { genere } = await params;
  return <GenrePage slug={genere} kind="MOVIE" />;
}
