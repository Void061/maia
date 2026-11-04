import { useSyncExternalStore } from "react";

// A TV: the Fire TV app (maia-tv/ adds MaiaTV to the user agent) or a TV browser.
const TV_BROWSER = /MaiaTV|AFT[A-Z]|SmartTV|Tizen|Web0S/;

export function isTv() {
  return typeof navigator !== "undefined" && TV_BROWSER.test(navigator.userAgent);
}

const never = () => () => {};

// For rendering: false on the server, the truth in the browser.
export function useTv() {
  return useSyncExternalStore(never, isTv, () => false);
}

// A mouse or trackpad: a computer rather than a phone or a tablet.
export function useMouse() {
  return useSyncExternalStore(never, () => matchMedia("(pointer: fine)").matches, () => false);
}
