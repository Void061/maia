// A TV: the Fire TV app (maia-tv/ adds MaiaTV to the user agent) or a TV browser.
const TV_BROWSER = /MaiaTV|AFT[A-Z]|SmartTV|Tizen|Web0S/;

export function isTv() {
  return typeof navigator !== "undefined" && TV_BROWSER.test(navigator.userAgent);
}
