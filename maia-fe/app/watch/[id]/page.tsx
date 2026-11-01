import { Suspense } from "react";
import WatchTitle from "./watch-title";

// Titles load in the browser; Cache Components needs one param to prerender
// the shell.
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

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WatchTitle id={id} />;
}
