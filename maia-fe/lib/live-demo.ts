// Demo data for the live channels only: channels and EPG are not in maia-be
// yet (docs/tv/catalog.md). Films and series come from the real catalog (lib/tv.ts).

export type ChannelCategory = "general" | "movies-series" | "lifestyle" | "kids";
export type Channel = {
  id: string;
  number: number;
  name: string;
  provider: string;
  category: ChannelCategory;
  hue: number; // colour of the channel's monogram tile until real logos arrive
};

export const channelCategories: { key: ChannelCategory | "tutti"; name: string }[] = [
  { key: "tutti", name: "Tutti" },
  { key: "general", name: "Generalisti" },
  { key: "movies-series", name: "Film e serie" },
  { key: "lifestyle", name: "Lifestyle" },
  { key: "kids", name: "Bambini" },
];
export type Program = { channelId: string; title: string; start: number; end: number; description: string };

const showBlurbs: Record<string, string> = {
  Telegiornale: "Le notizie del giorno dall'Italia e dal mondo.",
  "Linea verde": "Viaggio tra campagne, mercati e prodotti del territorio italiano.",
  Meteo: "Le previsioni per le prossime ore e per il fine settimana.",
  Documentario: "Natura, storia e scienza raccontate da vicino.",
  "Film della sera": "Il grande cinema in prima serata.",
  "Rassegna stampa": "Le prime pagine dei giornali, commentate in studio.",
};

export const channels: Channel[] = [
  { id: "c1", number: 1, name: "Rai 1", provider: "RaiPlay", category: "general", hue: 212 },
  { id: "c2", number: 2, name: "Rai 2", provider: "RaiPlay", category: "general", hue: 2 },
  { id: "c3", number: 3, name: "Rai 3", provider: "RaiPlay", category: "general", hue: 145 },
  { id: "c7", number: 7, name: "La7", provider: "La7", category: "general", hue: 330 },
  { id: "c20", number: 20, name: "Pluto Cinema", provider: "Pluto TV", category: "movies-series", hue: 45 },
  { id: "c21", number: 21, name: "Pluto Gialli", provider: "Pluto TV", category: "movies-series", hue: 268 },
  { id: "c22", number: 22, name: "Pluto Cucina", provider: "Pluto TV", category: "lifestyle", hue: 24 },
  { id: "c23", number: 23, name: "Pluto Animazione", provider: "Pluto TV", category: "kids", hue: 190 },
];

const showNames = [
  "Telegiornale", "Linea verde", "Meteo", "Documentario", "Film della sera", "Rassegna stampa",
  "Mattina in famiglia", "Il giro del mondo", "Cucina di casa", "Cartoni del pomeriggio",
];

// Builds a believable schedule around `now`: programs of 30-120 minutes,
// different per channel but stable for a given hour.
export function scheduleAround(now: number): Program[] {
  const hour = 60 * 60 * 1000;
  const from = Math.floor(now / hour) * hour - 2 * hour;
  const to = from + 8 * hour;
  const out: Program[] = [];
  channels.forEach((ch, ci) => {
    let t = from - ((ci * 17) % 60) * 60 * 1000;
    let i = ci * 3;
    while (t < to) {
      const len = [30, 45, 60, 90, 120][(i + ci) % 5] * 60 * 1000;
      const name = showNames[i % showNames.length];
      const description = showBlurbs[name] ?? "Un appuntamento fisso del palinsesto.";
      out.push({ channelId: ch.id, title: name, start: t, end: t + len, description });
      t += len;
      i++;
    }
  });
  return out;
}

// Public HLS test stream (Mux) with several quality levels, played on the demo channels.
export const demoStream = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
