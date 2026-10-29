import { notFound } from "next/navigation";
import { Suspense } from "react";
import { channels, findTitle, titles } from "@/lib/mock";
import Player from "./player";

export function generateStaticParams() {
  return [...titles.map((t) => ({ id: t.id })), ...channels.map((c) => ({ id: `live-${c.id}` }))];
}

export default function Page({ params }: PageProps<"/guarda/[id]">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id.startsWith("live-")) {
    const channel = channels.find((c) => `live-${c.id}` === id);
    if (!channel) notFound();
    return <Player live={{ channelId: channel.id }} />;
  }
  const title = findTitle(id);
  if (!title) notFound();
  return <Player title={title} />;
}
