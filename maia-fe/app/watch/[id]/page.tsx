import { notFound } from "next/navigation";
import { Suspense } from "react";
import { channels } from "@/lib/live-demo";
import Player from "./player";
import WatchTitle from "./watch-title";

// Catalog titles load in the browser; Cache Components needs one param to
// prerender the shell. Live channels are still demo data.
export function generateStaticParams() {
  return channels.map((c) => ({ id: `live-${c.id}` }));
}

export default function Page({ params }: PageProps<"/watch/[id]">) {
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
  return <WatchTitle id={id} />;
}