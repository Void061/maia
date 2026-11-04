// Movement on a TV. A TV stick cannot repaint the page at every key, but its
// GPU moves layers for free: everything here is a CSS transform. The rows and
// the page slide (they are not scrolled) and one ring, above everything, glides
// from card to card (so no row can ever cut it). Only cards, fields and what is
// marked data-tv-ring get it: buttons turn white, tabs have their underline.
// The layout it works on is in globals.css (html.tv).

const RING_GAP = 4;
const UNDER_MENU = "[data-row], .tv-grid > *, [data-block]";

let ring: HTMLElement | null = null;
// The element moveFocus() has just drawn the ring for: its focus event is not news.
let placed: Element | null = null;

const menuBottom = () => document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;

// How far an element is translated right now, also halfway through a slide.
function shift(el: HTMLElement, axis: "x" | "y") {
  const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
  return axis === "x" ? m.m41 : m.m42;
}

// Slides a row so that the card is inside it. Returns how far the card will move.
function placeRail(rail: HTMLElement, card: HTMLElement) {
  const clip = rail.parentElement;
  const last = rail.lastElementChild as HTMLElement | null;
  if (!clip || !last) return 0;
  const from = shift(rail, "x");
  const width = clip.clientWidth;
  const left = card.offsetLeft;
  const right = left + card.offsetWidth;
  let x = -from;
  if (left < x) x = left;
  else if (right > x + width) x = right - width;
  x = Math.max(0, Math.min(x, last.offsetLeft + last.offsetWidth - width));
  rail.style.transform = `translate3d(${-x}px, 0, 0)`;
  return -x - from;
}

// Slides the page so that the row of `next` lines up under the menu.
function placePage(page: HTMLElement, next: HTMLElement) {
  const from = shift(page, "y");
  const line = next.closest<HTMLElement>(UNDER_MENU);
  let y = 0;
  if (!next.closest("header, [data-hero]")) {
    const box = (line ?? next).getBoundingClientRect();
    y = box.top - from - (line ? menuBottom() : (innerHeight - box.height) / 2);
  }
  y = Math.max(0, Math.min(y, page.offsetHeight - innerHeight));
  page.style.transform = `translate3d(0, ${-y}px, 0)`;
  document.documentElement.toggleAttribute("data-tv-scrolled", y > 24);
  return -y - from;
}

export function hideRing() {
  if (ring) ring.style.opacity = "0";
}

function drawRing(el: HTMLElement, dx = 0, dy = 0) {
  if (!ring) return;
  const card = el.querySelector<HTMLElement>(".lift");
  const target = card ?? (el.matches("input, select, [data-tv-ring]") ? el : null);
  if (!target?.getClientRects().length) {
    hideRing();
    return;
  }
  const r = target.getBoundingClientRect();
  const radius = Number.parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0;
  ring.style.opacity = "1";
  ring.style.width = `${r.width + 2 * RING_GAP}px`;
  ring.style.height = `${r.height + 2 * RING_GAP}px`;
  ring.style.borderRadius = `${radius + RING_GAP}px`;
  ring.style.transform = `translate3d(${r.left - RING_GAP + dx}px, ${r.top - RING_GAP + dy}px, 0)`;
}

// Everything that follows a focus move: call it just before focusing `next`.
export function moveFocus(next: HTMLElement, across: boolean) {
  let dx = 0;
  let dy = 0;
  const rail = next.closest<HTMLElement>(".rail");
  if (rail) dx = placeRail(rail, next);
  if (next.closest(".tv-search")) {
    // Search does not move: its results have their own scroller.
    if (next.closest(".tv-grid-search")) next.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
  } else if (!across) {
    const page = next.closest<HTMLElement>("[data-tv-page]") ?? (next.closest("header") ? document.querySelector<HTMLElement>("[data-tv-page]") : null);
    if (page) dy = placePage(page, next);
    else next.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  }
  drawRing(next, dx, dy);
  placed = next;
}

// Runs fn with every slide switched off: a page shown again starts in place.
export function withoutSlides(fn: () => void) {
  const root = document.documentElement;
  root.classList.add("tv-still");
  fn();
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("tv-still")));
}

// The ring, and following focus that does not come from the arrows. Returns the
// clean-up.
export function startTvMotion() {
  ring = document.createElement("div");
  ring.id = "tv-ring";
  ring.style.opacity = "0";
  document.body.append(ring);
  const onFocus = (e: FocusEvent) => {
    if (e.target === placed) {
      placed = null;
      return;
    }
    if (e.target instanceof HTMLElement) drawRing(e.target);
  };
  // Focus gone with nothing after it (the page changed): no ring left behind.
  const onBlur = (e: FocusEvent) => {
    if (!e.relatedTarget) hideRing();
  };
  document.addEventListener("focusin", onFocus);
  document.addEventListener("focusout", onBlur);
  return () => {
    document.removeEventListener("focusin", onFocus);
    document.removeEventListener("focusout", onBlur);
    ring?.remove();
    ring = null;
  };
}
