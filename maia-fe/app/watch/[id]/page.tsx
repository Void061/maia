import { Suspense } from "react";
import WatchReplay from "./watch-replay";
import WatchTitle from "./watch-title";

// Titles and replays load in the browser; Cache Components needs one param to
// prerender the shell.
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page({ params }: PageProps<"/watch/[id]">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
      <Content params={params} />
    </Suspense>
  );
}

// /watch/<title id> for the catalog, /watch/replay-<program id> for the replays.
async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id.startsWith("replay-")) return <WatchReplay id={id.slice("replay-".length)} />;
  return <WatchTitle id={id} />;
}
