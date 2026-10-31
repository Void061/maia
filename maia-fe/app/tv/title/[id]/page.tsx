import { Suspense } from "react";
import TitleScreen from "./title-detail";

// Titles come from the catalog at runtime; Cache Components needs one param to
// prerender the shell, the page itself loads the title in the browser.
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page({ params }: PageProps<"/tv/title/[id]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TitleScreen id={id} />;
}
