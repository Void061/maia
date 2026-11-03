"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Remote-control navigation: arrow keys move focus to the nearest focusable
// element in that direction, Enter activates it (native for links/buttons),
// Backspace/Escape go back. Mouse and touch keep working as usual.
// On a TV (html.tv, globals.css) the page jumps straight to the new position:
// a smooth scroll on every key is what a slow TV stick cannot keep up with.

const FOCUSABLE = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';

type Dir = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

// Holding a key on a TV: one move every this many ms, the rest are dropped.
const REPEAT_MS = 120;
const ROWS_AROUND = 2;
const TV_BROWSER = /MaiaTV|AFT[A-Z]|SmartTV|Tizen|Web0S/;

function candidates(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

// On a TV the rows off screen are not rendered (content-visibility, globals.css)
// and measuring one forces it: moving up or down looks only at the rows around
// the focus, or the first move would render the whole page at once.
function closeRows(els: HTMLElement[], active: Element) {
  const rows = Array.from(document.querySelectorAll("main section"));
  const at = rows.indexOf(active.closest("section") as Element);
  const close = new Set(rows.slice(Math.max(at - ROWS_AROUND, 0), Math.max(at, 0) + ROWS_AROUND + 1));
  return els.filter((el) => {
    const row = el.closest("section");
    return !row || close.has(row);
  });
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
    const tv = TV_BROWSER.test(navigator.userAgent);
    document.documentElement.classList.toggle("tv", tv);
    let lastMove = 0;

    function onKey(e: KeyboardEvent) {
      const active = document.activeElement as HTMLElement | null;
      const typing = active instanceof HTMLInputElement && active.type !== "range";

      if ((e.key === "Backspace" && !typing) || e.key === "Escape") {
        if (document.querySelector("[data-focus-trap]")) return; // the layer closes itself
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

      // A modal layer (e.g. the app switcher) traps focus inside itself.
      const root = document.querySelector("[data-focus-trap]") ?? document.body;
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
        next =
          nearest(from, dir, across ? page : closeRows(page, active), active) ??
          nearest(from, dir, page, active) ??
          (dir === "ArrowUp" ? nearest(from, dir, pool, active) : null);
      }
      if ((rail || inMenu) && !next) e.preventDefault();
      if (next) {
        e.preventDefault();
        lastMove = e.timeStamp;
        next.focus({ preventScroll: true });
        next.scrollIntoView(
          tv
            ? { block: across ? "nearest" : "center", inline: "nearest", behavior: "instant" }
            : { block: "nearest", inline: "nearest", behavior: "smooth" },
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return null;
}
