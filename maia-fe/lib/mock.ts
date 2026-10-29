// Prototype data only: replaced by maia-be's API once the catalog exists.

export type Profile = { id: string; name: string; hue: number };

export const profiles: Profile[] = [
  { id: "p1", name: "Ivan", hue: 38 },
  { id: "p2", name: "Sofia", hue: 330 },
  { id: "p3", name: "Ospite", hue: 200 },
];

export type MaiaApp = {
  key: string;
  name: string;
  description: string;
  href: string;
  enabled: boolean;
};

export const apps: MaiaApp[] = [
  { key: "tv", name: "MAIA TV", description: "Film, serie e canali live", href: "/tv", enabled: true },
  { key: "casa", name: "Casa", description: "In arrivo", href: "#", enabled: false },
];

export type Kind = "MOVIE" | "SERIES";

export type Title = {
  id: string;
  kind: Kind;
  name: string;
  year: number;
  genres: string[];
  minutes?: number;
  seasons?: number;
  overview: string;
  sources: string[];
  progress?: number; // 0..1, "Continua a guardare"
};

export const genres = [
  { slug: "commedia", name: "Commedie" },
  { slug: "horror", name: "Horror" },
  { slug: "giallo", name: "Gialli" },
  { slug: "dramma", name: "Drammi" },
  { slug: "documentario", name: "Documentari" },
  { slug: "animazione", name: "Animazione" },
];

export const titles: Title[] = [
  { id: "t1", kind: "SERIES", name: "Il porto delle nebbie", year: 2023, genres: ["giallo", "dramma"], seasons: 2, overview: "Una commissaria torna nella città dove è cresciuta per indagare su una scomparsa che nessuno vuole risolvere.", sources: ["RaiPlay", "Pluto TV"], progress: 0.42 },
  { id: "t2", kind: "MOVIE", name: "La casa sul lago", year: 2019, genres: ["horror"], minutes: 98, overview: "Un weekend tra amici in una villa isolata. Il lago, di notte, restituisce qualcosa che aveva preso anni prima.", sources: ["Pluto TV"] },
  { id: "t3", kind: "MOVIE", name: "Tutti a tavola", year: 2021, genres: ["commedia"], minutes: 104, overview: "Tre generazioni, un pranzo della domenica e un segreto di famiglia che salta fuori tra il primo e il secondo.", sources: ["RaiPlay"], progress: 0.8 },
  { id: "t4", kind: "SERIES", name: "Condominio Aurora", year: 2022, genres: ["commedia"], seasons: 3, overview: "Le vite intrecciate degli inquilini di un palazzo di Torino, tra assemblee infinite e amori sul pianerottolo.", sources: ["RaiPlay", "La7"] },
  { id: "t5", kind: "MOVIE", name: "Oltre la cresta", year: 2020, genres: ["documentario"], minutes: 87, overview: "Un anno sulle Alpi con chi le abita, seguendo il ritmo delle stagioni e dei ghiacciai che si ritirano.", sources: ["RaiPlay"] },
  { id: "t6", kind: "SERIES", name: "Notte fonda", year: 2024, genres: ["horror", "giallo"], seasons: 1, overview: "Una radio notturna riceve chiamate da ascoltatori che descrivono crimini non ancora avvenuti.", sources: ["Pluto TV"], progress: 0.15 },
  { id: "t7", kind: "MOVIE", name: "Il ritorno di Nino", year: 2018, genres: ["commedia", "dramma"], minutes: 112, overview: "Dopo vent'anni in Argentina, Nino torna al paese per vendere la casa di famiglia. Il paese ha altri piani.", sources: ["La7", "Pluto TV"] },
  { id: "t8", kind: "MOVIE", name: "Cartoline da Marte", year: 2022, genres: ["animazione", "commedia"], minutes: 81, overview: "Una sonda dimenticata su Marte decide di scrivere a casa. Ogni lunedì, una cartolina.", sources: ["RaiPlay"] },
  { id: "t9", kind: "SERIES", name: "Mare d'inverno", year: 2021, genres: ["dramma"], seasons: 2, overview: "Una famiglia di pescatori di Chioggia affronta l'inverno più duro degli ultimi trent'anni.", sources: ["RaiPlay"] },
  { id: "t10", kind: "MOVIE", name: "L'ultimo treno", year: 2017, genres: ["giallo"], minutes: 95, overview: "Sette passeggeri, un treno notturno fermo in galleria e un controllore che non risponde più.", sources: ["Pluto TV"] },
  { id: "t11", kind: "SERIES", name: "La cucina di Rosa", year: 2023, genres: ["documentario"], seasons: 4, overview: "Rosa gira l'Italia di trattoria in trattoria alla ricerca delle ricette che stanno scomparendo.", sources: ["La7"] },
  { id: "t12", kind: "MOVIE", name: "Il pozzo", year: 2021, genres: ["horror"], minutes: 89, overview: "In una masseria pugliese, un pozzo chiuso da decenni viene riaperto per l'estate più secca del secolo.", sources: ["Pluto TV", "RaiPlay"] },
  { id: "t13", kind: "SERIES", name: "Ufficio smarriti", year: 2020, genres: ["commedia"], seasons: 2, overview: "L'ufficio oggetti smarriti della stazione di Bologna e i suoi tre impiegati, che restituiscono più storie che oggetti.", sources: ["RaiPlay"] },
  { id: "t14", kind: "MOVIE", name: "Volpi", year: 2024, genres: ["animazione"], minutes: 76, overview: "Una cucciola di volpe si perde in città e deve trovare la strada di casa prima dell'alba.", sources: ["Pluto TV"] },
];

export const findTitle = (id: string) => titles.find((t) => t.id === id);

export type Episode = { season: number; number: number; name: string; minutes: number };

const episodeNames = [
  "Il ritorno", "La nebbia", "Sotto il ponte", "Testimoni", "Il molo", "Alba",
  "Bassa marea", "Il faro", "Lettere", "La fiera", "Controcorrente", "Ultimo giro",
];
export const EPISODES_PER_SEASON = 6;

// Six episodes per season, names rotating per season so seasons differ.
export const episodesOf = (season: number): Episode[] =>
  Array.from({ length: EPISODES_PER_SEASON }, (_, i) => ({
    season,
    number: i + 1,
    name: episodeNames[(i + (season - 1) * 3) % episodeNames.length],
    minutes: 48 + (((i + 1) * 7 + season) % 12),
  }));

export const episodeAt = (season: number, number: number) => episodesOf(season)[number - 1];

// The episode after S/E, moving to the next season when one ends; null at the very end.
export function nextEpisode(t: Title, season: number, number: number): Episode | null {
  if (number < EPISODES_PER_SEASON) return episodeAt(season, number + 1);
  if (season < (t.seasons ?? 1)) return episodeAt(season + 1, 1);
  return null;
}

// Where "Riprendi" lands for a series in progress (prototype: S1:E3).
export const resumeEpisode = (t: Title) => (t.progress !== undefined ? episodeAt(1, 3) : episodeAt(1, 1));

// Editorial rows (in the real app: computed by maia-be or curated from the admin panel).
export const newIds = ["t6", "t14", "t12", "t11", "t8", "t3"];
export const top10Ids = ["t1", "t6", "t3", "t12", "t4", "t2", "t9", "t7", "t13", "t10"];
export const pick = (ids: string[], kind?: Kind) =>
  ids.map((id) => findTitle(id)!).filter((t) => !kind || t.kind === kind);

export const findGenre = (slug: string) => genres.find((g) => g.slug === slug);

// Titles sharing at least one genre, most shared first.
export const similarTo = (t: Title) =>
  titles
    .filter((x) => x.id !== t.id)
    .map((x) => ({ x, n: x.genres.filter((g) => t.genres.includes(g)).length }))
    .filter(({ n }) => n > 0)
    .sort((a, b) => b.n - a.n)
    .map(({ x }) => x);

export const byGenre = (slug: string, kind?: Kind) =>
  titles.filter((t) => t.genres.includes(slug) && (!kind || t.kind === kind));

// Deterministic artwork per title, so the prototype looks the same on every load.
export const posterUrl = (id: string) => `https://picsum.photos/seed/maia-${id}/400/600`;
export const backdropUrl = (id: string) => `https://picsum.photos/seed/maia-${id}-bg/1600/900`;
export const genreArtUrl = (slug: string) => `https://picsum.photos/seed/maia-genre-${slug}/800/450`;

export type Channel = { id: string; number: number; name: string; provider: string };
export type Program = { channelId: string; title: string; start: number; end: number };

export const channels: Channel[] = [
  { id: "c1", number: 1, name: "Rai 1", provider: "RaiPlay" },
  { id: "c2", number: 2, name: "Rai 2", provider: "RaiPlay" },
  { id: "c3", number: 3, name: "Rai 3", provider: "RaiPlay" },
  { id: "c7", number: 7, name: "La7", provider: "La7" },
  { id: "c20", number: 20, name: "Pluto Cinema", provider: "Pluto TV" },
  { id: "c21", number: 21, name: "Pluto Gialli", provider: "Pluto TV" },
  { id: "c22", number: 22, name: "Pluto Cucina", provider: "Pluto TV" },
  { id: "c23", number: 23, name: "Pluto Animazione", provider: "Pluto TV" },
];

const showNames = [
  "Telegiornale", "Linea verde", "Il porto delle nebbie", "Meteo", "Cartoline da Marte",
  "Notte fonda", "La cucina di Rosa", "Documentario", "Film della sera", "Ufficio smarriti",
  "Condominio Aurora", "Rassegna stampa", "Il pozzo", "Volpi", "L'ultimo treno",
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
      out.push({ channelId: ch.id, title: showNames[i % showNames.length], start: t, end: t + len });
      t += len;
      i++;
    }
  });
  return out;
}

// Public HLS test stream (Mux) with several quality levels, used to try the player.
export const demoStream = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
