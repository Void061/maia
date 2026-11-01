"use client";

import { airedOn, useReplay } from "@/lib/replay";
import Player from "./player";

// Loads a program of the TV guide and plays its replay.
export default function WatchReplay({ id }: { id: string }) {
  const { data, isError } = useReplay(id);
  if (isError) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-black p-6 text-center">
        <p className="text-lg text-muted">Questo programma non è disponibile.</p>
      </div>
    );
  }
  if (!data) return <div className="fixed inset-0 bg-black" />;
  const title = data.episodeTitle && !data.title.includes(data.episodeTitle) ? `${data.title} · ${data.episodeTitle}` : data.title;
  return <Player replay={{ id: data.id, title, subtitle: `${data.channelName} · ${airedOn(data.start)}` }} />;
}
