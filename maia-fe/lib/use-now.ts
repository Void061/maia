"use client";

import { useEffect, useState } from "react";

// Current time, client-only (null during prerender and the first paint, so
// server and client markup match), refreshed every `everyMs`.
export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

export function greeting(now: number) {
  const h = new Date(now).getHours();
  if (h < 5) return "Buonanotte";
  if (h < 13) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
}

export const hhmm = (t: number) =>
  new Date(t).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
