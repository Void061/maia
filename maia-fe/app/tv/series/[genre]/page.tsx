import { Suspense } from "react";
import { GenrePage } from "@/components/catalog";

// Genres come from the catalog at runtime; Cache Components needs one param to
// prerender the shell, the page itself loads its titles in the browser.
export function generateStaticParams() {
  return [{ genre: "dramma" }];
}

export default function Page({ params }: PageProps<"/tv/series/[genre]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ genre: string }> }) {
  const { genre } = await params;
  return <GenrePage slug={genre} kind="SERIES" />;
}