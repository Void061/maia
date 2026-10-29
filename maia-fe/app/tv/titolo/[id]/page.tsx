import { notFound } from "next/navigation";
import { Suspense } from "react";
import { findTitle, titles } from "@/lib/mock";
import TitleDetail from "./title-detail";

export function generateStaticParams() {
  return titles.map((t) => ({ id: t.id }));
}

export default function Page({ params }: PageProps<"/tv/titolo/[id]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const title = findTitle(id);
  if (!title) notFound();
  return <TitleDetail title={title} />;
}
