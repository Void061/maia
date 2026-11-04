export type DeviceKind = 'tv' | 'phone' | 'tablet' | 'computer' | 'other';

const BROWSERS: [RegExp, string][] = [
  [/\bEdgA?\//, 'Edge'],
  [/\bOPR\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bFirefox\//, 'Firefox'],
  [/\bCriOS\/|\bChrome\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
];

// What a person recognises in the list of connected devices, from the browser's
// user agent. A guess, not a fact: the user agent says little and can be changed.
export function deviceOf(userAgent: string | null): { device: string; kind: DeviceKind } {
  const ua = userAgent ?? '';
  if (/MaiaTV/.test(ua)) return { device: 'App MAIA su Fire TV', kind: 'tv' };
  if (/\bAFT[A-Z]/.test(ua)) return { device: 'Fire TV', kind: 'tv' };
  if (/SmartTV|SMART-TV|Tizen|Web0S/.test(ua)) return { device: 'Smart TV', kind: 'tv' };

  let name: string;
  let kind: DeviceKind;
  if (/iPhone/.test(ua)) [name, kind] = ['iPhone', 'phone'];
  else if (/iPad/.test(ua)) [name, kind] = ['iPad', 'tablet'];
  else if (/Android/.test(ua)) [name, kind] = /Mobile/.test(ua) ? ['Telefono Android', 'phone'] : ['Tablet Android', 'tablet'];
  else if (/Macintosh/.test(ua)) [name, kind] = ['Mac', 'computer'];
  else if (/Windows/.test(ua)) [name, kind] = ['PC Windows', 'computer'];
  else if (/Linux|X11/.test(ua)) [name, kind] = ['PC Linux', 'computer'];
  else return { device: 'Dispositivo sconosciuto', kind: 'other' };

  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1];
  return { device: browser ? `${browser} su ${name}` : name, kind };
}
