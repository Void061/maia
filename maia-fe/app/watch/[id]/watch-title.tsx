"use client";

import { useTitle } from "@/lib/tv";
import Player from "./player";

// Loads the title (seasons, episodes, extras) and hands it to the player.
export default function WatchTitle({ id }: { id: string }) {
  const { data, isError } = useTitle(id);
  if (isError) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-black p-6 text-center">
        <p className="text-lg text-muted">Questo titolo non è disponibile.</p>
      </div>
    );
  }
  if (!data) return <div className="fixed inset-0 bg-black" />;
  return <Player title={data} />;
}