"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isTv } from "@/lib/tv-device";

// Remote-control navigation: arrow keys move focus to the nearest focusable
// element in that direction, Enter activates it (native for links/buttons),
// Backspace/Escape go back. Mouse and touch keep working as usual.
// On a TV (html.tv, globals.css) the page jumps straight to the new position:
// a smooth scroll on every key is what a slow TV stick cannot keep up with.

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])';

type Dir = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

// Holding a key on a TV: one move every this many ms, the rest are dropped.
const REPEAT_MS = 120;
// The page is laid out at this width on a TV, whatever the device reports: the
// TV layout in globals.css is built on 1280x720.
const TV_WIDTH = 1280;

function candidates(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

// The open modal layer (e.g. the app switcher), which traps focus inside itself.
// Only a visible one: Next keeps visited pages hidden in the DOM, and a layer
// left open there would swallow every key of the page on screen.
function openLayer() {
  return Array.from(document.querySelectorAll("[data-focus-trap]")).find((el) => el.getClientRects().length > 0);
}

// Where the page goes for a focus move up or down on a TV: rows and grid cards
// line up under the menu, so what is on screen is always whole.
function placeOnTv(next: HTMLElement, across: boolean) {
  next.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  if (across) return;
  if (next.closest("header, [data-hero]")) {
    window.scrollTo({ top: 0, behavior: "instant" });
    return;
  }
  // Results with their own scroller (search): the row goes to its top.
  if (next.closest(".tv-grid-search")) {
    next.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
    return;
  }
  const line = next.closest<HTMLElement>("[data-row], .tv-grid > *, [data-block]");
  if (!line) {
    next.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    return;
  }
  const menu = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
  window.scrollBy({ top: line.getBoundingClientRect().top - menu, behavior: "instant" });
}

function nearest(from: DOMRect, dir: Dir, els: HTMLElement[], self: Element | null) {
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of els) {
    if (el === self) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
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
  // Styles are slow to read: only the winner is checked, not every element.
  if (best && getComputedStyle(best).visibility === "hidden") {
    return nearest(from, dir, els.filter((el) => el !== best), self);
  }
  return best;
}

export default function SpatialNav() {
  const router = useRouter();

  useEffect(() => {
    const tv = isTv();
    document.documentElement.classList.toggle("tv", tv);
    // Next writes its own viewport tag back, at any time: this one has to stay.
    const fitScreen = () => {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
      if (meta && meta.content !== `width=${TV_WIDTH}`) meta.content = `width=${TV_WIDTH}`;
    };
    const head = new MutationObserver(fitScreen);
    if (tv) {
      fitScreen();
      head.observe(document.head, { subtree: true, childList: true, attributes: true, attributeFilter: ["content"] });
    }
    let lastMove = 0;

    function onKey(e: KeyboardEvent) {
      const active = document.activeElement as HTMLElement | null;
      const typing = active instanceof HTMLInputElement && active.type !== "range";

      if ((e.key === "Backspace" && !typing) || e.key === "Escape") {
        // The layer closes itself. It may already be gone: the search keyboard
        // handles the key first, and this is not a second Back.
        if (e.defaultPrevented || openLayer()) return;
        e.preventDefault();
        // In fullscreen, Back/Esc leaves fullscreen first, like every player.
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
          return;
        }
        router.back();
        return;
      }
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      if (typing && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;
      if (active?.closest("[data-own-keys]")) return; // e.g. the video player

      if (tv && e.repeat && e.timeStamp - lastMove < REPEAT_MS) {
        e.preventDefault();
        return;
      }

      const root = openLayer() ?? document.body;
      if (!active || active === document.body || !root.contains(active) || !active.matches(FOCUSABLE)) {
        e.preventDefault();
        candidates(root)
          .find((el) => el.getClientRects().length > 0)
          ?.focus();
        return;
      }
      // Left and right stay in the row: only its cards are measured, and the
      // last card does not jump to another row.
      const across = e.key === "ArrowLeft" || e.key === "ArrowRight";
      const rail = across ? active.closest(".rail") : null;
      // The menu is fixed at the top, so it always looks "above": Up goes to
      // the previous row and reaches the menu only from the first one.
      const menu = root === document.body ? document.querySelector("header") : null;
      const inMenu = !!menu?.contains(active);
      const from = active.getBoundingClientRect();
      const dir = e.key as Dir;
      const pool = candidates(rail ?? (inMenu && across ? menu! : root));
      const page = menu && !across ? pool.filter((el) => !menu.contains(el)) : pool;
      let next: HTMLElement | null = null;
      if (!(inMenu && dir === "ArrowUp")) {
        next = nearest(from, dir, page, active) ?? (dir === "ArrowUp" ? nearest(from, dir, pool, active) : null);
      }
      if ((rail || inMenu) && !next) e.preventDefault();
      if (next) {
        e.preventDefault();
        lastMove = e.timeStamp;
        next.focus({ preventScroll: true });
        if (tv) placeOnTv(next, across);
        else next.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      head.disconnect();
    };
  }, [router]);

  return null;
}
