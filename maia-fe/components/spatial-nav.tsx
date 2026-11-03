"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { isTv } from "@/lib/tv-device";
import { moveFocus, startTvMotion, withoutSlides } from "@/lib/tv-motion";

// Remote-control navigation: arrow keys move focus to the nearest focusable
// element in that direction, Enter activates it (native for links/buttons),
// Backspace/Escape go back. Mouse and touch keep working as usual.
// On a TV the movement is in lib/tv-motion.ts; every page starts with the focus
// on its first item, or back where it was.

const NOT_SKIPPED = ':not([tabindex="-1"])';
const FOCUSABLE = `a[href]${NOT_SKIPPED}, button:not([disabled])${NOT_SKIPPED}, input${NOT_SKIPPED}, select${NOT_SKIPPED}, [tabindex]${NOT_SKIPPED}`;

type Dir = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

// Holding a key on a TV: one move every this many ms, the rest are dropped.
const REPEAT_MS = 140;
// How long a page may take to show something to focus (its data is on the way).
const SETTLE_TRIES = 25;
const SETTLE_MS = 200;
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

const shown = (el: Element | null | undefined): el is HTMLElement => !!el?.isConnected && el.getClientRects().length > 0;

// The first thing to land on in a page: the remote never starts from nothing.
function firstOfPage() {
  const main = Array.from(document.querySelectorAll("main")).find(shown);
  return main ? candidates(main).find(shown) : undefined;
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
  const pathname = usePathname();
  // Where the focus was on each page, for coming back to it.
  const left = useRef(new Map<string, HTMLElement>());

  // A TV page always opens with the focus on something: where it was, or its first item.
  useEffect(() => {
    if (!isTv()) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const settle = () => {
      const active = document.activeElement;
      if (shown(document.querySelector("[data-own-keys]")) || openLayer()) return;
      const saved = left.current.get(pathname);
      const here = shown(saved) ? saved : shown(active) && active !== document.body && active.closest("main") ? (active as HTMLElement) : firstOfPage();
      if (!here) {
        if (++tries < SETTLE_TRIES) timer = setTimeout(settle, SETTLE_MS);
        return;
      }
      withoutSlides(() => {
        moveFocus(here, false);
        here.focus({ preventScroll: true });
      });
    };
    timer = setTimeout(settle, 60);
    return () => clearTimeout(timer);
  }, [pathname]);

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
    const stopMotion = tv ? startTvMotion() : undefined;
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

      // On a TV the arrows are all ours: at the end of a page the browser would
      // scroll by itself, and the page would no longer line up.
      if (tv) e.preventDefault();
      if (tv && e.repeat && e.timeStamp - lastMove < REPEAT_MS) return;

      const root = openLayer() ?? document.body;
      if (!active || active === document.body || !root.contains(active) || !active.matches(FOCUSABLE)) {
        e.preventDefault();
        candidates(root).find(shown)?.focus();
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
        if (tv) moveFocus(next, across);
        next.focus({ preventScroll: true });
        // Saved now: by the time the page has changed, the focus is gone.
        left.current.set(location.pathname, next);
        if (!tv) next.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      head.disconnect();
      stopMotion?.();
    };
  }, [router]);

  return null;
}
