"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Remote-control navigation: arrow keys move focus to the nearest focusable
// element in that direction, Enter activates it (native for links/buttons),
// Backspace/Escape go back. Mouse and touch keep working as usual.

const FOCUSABLE = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';

type Dir = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function candidates(): HTMLElement[] {
  // A modal layer (e.g. the app switcher) traps focus inside itself.
  const trap = document.querySelector<HTMLElement>("[data-focus-trap]");
  const root = trap ?? document.body;
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
}

function nearest(from: DOMRect, dir: Dir, els: HTMLElement[], self: Element | null) {
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of els) {
    if (el === self) continue;
    const r = el.getBoundingClientRect();
    const ex = r.left + r.width / 2;
    const ey = r.top + r.height / 2;
    const dx = ex - cx;
    const dy = ey - cy;
    let main: number;
    let cross: number;
    if (dir === "ArrowRight") { if (r.left < from.right - 4) continue; main = dx; cross = dy; }
    else if (dir === "ArrowLeft") { if (r.right > from.left + 4) continue; main = -dx; cross = dy; }
    else if (dir === "ArrowDown") { if (r.top < from.bottom - 4) continue; main = dy; cross = dx; }
    else { if (r.bottom > from.top + 4) continue; main = -dy; cross = dx; }
    // Staying in the same row/column matters more than raw distance.
    const score = main + Math.abs(cross) * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

export default function SpatialNav() {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const active = document.activeElement as HTMLElement | null;
      const typing = active instanceof HTMLInputElement && active.type !== "range";

      if ((e.key === "Backspace" && !typing) || e.key === "Escape") {
        if (document.querySelector("[data-focus-trap]")) return; // the layer closes itself
        e.preventDefault();
        router.back();
        return;
      }
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      if (typing && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;
      if (active?.closest("[data-own-keys]")) return; // e.g. the video player

      const els = candidates();
      if (!active || active === document.body || !els.includes(active)) {
        e.preventDefault();
        els[0]?.focus();
        return;
      }
      const next = nearest(active.getBoundingClientRect(), e.key as Dir, els, active);
      if (next) {
        e.preventDefault();
        next.focus({ preventScroll: true });
        next.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return null;
}
