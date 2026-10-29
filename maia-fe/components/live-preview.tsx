"use client";

import type Hls from "hls.js";
import { useEffect, useRef } from "react";
import { demoStream } from "@/lib/mock";

// Muted live preview of a channel, like the top of the Pluto TV / Samsung TV
// Plus guide. Remount it (key) to switch channel. Prototype: every channel is
// the same demo stream, started at a different point so they look different.
export default function LivePreview({ channelId, className = "" }: { channelId: string; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let hls: Hls | null = null;
    let cancelled = false;
    const offset = (Number(channelId.replace(/\D/g, "")) * 37) % 500;
    const start = () => {
      v.currentTime = offset;
      v.play().catch(() => {});
    };
    (async () => {
      const { default: HlsLib } = await import("hls.js");
      if (cancelled) return;
      if (HlsLib.isSupported()) {
        hls = new HlsLib({ capLevelToPlayerSize: true });
        hls.loadSource(demoStream);
        hls.attachMedia(v);
        hls.on(HlsLib.Events.MANIFEST_PARSED, start);
      } else {
        v.src = demoStream;
        v.addEventListener("loadedmetadata", start, { once: true });
      }
    })();
    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [channelId]);

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <video ref={video} muted playsInline className="absolute inset-0 size-full object-cover" />
      <span className="absolute left-3 top-3 rounded bg-white px-1.5 py-0.5 text-[11px] font-bold text-black">LIVE</span>
    </div>
  );
}
