// Measurement prototype (docs/tv/catalog.md, "Ordine di sviluppo" step 1):
// reads a sample of RaiPlay titles, normalizes them and, with TMDB_API_KEY set,
// measures how many would be matched to TMDB automatically. Writes nothing to
// the database; the full report goes to .probe/report.json.
//
//   npm run catalog:probe                 sample from the RaiPlay sections
//   npm run catalog:probe -- marefuori    only the given slugs
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { decide, type Subject, type Verdict } from './matching/score.js';
import { TmdbClient } from './matching/tmdb.client.js';
import type { ProviderTitle } from './providers/provider.types.js';
import { RaiPlayAdapter } from './providers/raiplay/raiplay.adapter.js';

const SECTIONS = ['film', 'serieitaliane', 'serieinternazionali', 'programmi'];
const PER_SECTION = 5;
// Chosen on purpose: a daily soap with odd season labels and a multi-season series.
const EXTRAS = ['ilparadisodellesignore', 'marefuori'];

type Row = {
  slug: string;
  kind: string;
  name: string;
  year: number | null;
  episodes: number;
  declared: number;
  drm: number;
  playable: number;
  extras: number;
  extraGroups: string[];
  verdict?: Verdict;
  tmdb?: { id: number; title: string; year: number | null; score: number };
  runnerUp?: number;
  directEpisodes?: number;
  error?: string;
};

const rai = new RaiPlayAdapter();
const tmdbKey = process.env.TMDB_API_KEY;
const tmdb = tmdbKey ? new TmdbClient(tmdbKey) : null;

async function sample(): Promise<string[]> {
  const slugs: string[] = [];
  for (const section of SECTIONS) slugs.push(...(await rai.listSection(section)).slice(0, PER_SECTION));
  return [...new Set([...slugs, ...EXTRAS])];
}

function seasonCounts(title: ProviderTitle): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const season of title.seasons)
    for (const ep of season.episodes) {
      const n = ep.season ?? season.number;
      if (n !== null) counts[n] = (counts[n] ?? 0) + 1;
    }
  return counts;
}

async function probe(slug: string): Promise<Row> {
  const title = await rai.getTitle(slug);
  if (!title) return { slug, kind: '-', name: '(non trovato)', year: null, episodes: 0, declared: 0, drm: 0, playable: 0, extras: 0, extraGroups: [] };

  const videos = title.kind === 'MOVIE' ? (title.video ? [title.video] : []) : title.seasons.flatMap((s) => s.episodes);
  const row: Row = {
    slug,
    kind: title.kind,
    name: title.name,
    year: title.year,
    episodes: videos.length,
    declared: title.kind === 'MOVIE' ? videos.length : title.seasons.reduce((n, s) => n + (s.declaredCount ?? s.episodes.length), 0),
    drm: videos.filter((v) => v.drm).length,
    playable: videos.filter((v) => !v.drm && v.playback).length,
    extras: title.extras.reduce((n, g) => n + g.videos.length, 0),
    extraGroups: title.extras.map((g) => `${g.kind} "${g.label}" (${g.videos.length})`),
  };
  if (!tmdb) return row;

  const subject: Subject =
    title.kind === 'MOVIE'
      ? { title: title.name, year: title.year, runtimeMin: title.video?.durationSec ? Math.round(title.video.durationSec / 60) : null }
      : { title: title.name, year: title.year, seasonEpisodeCounts: seasonCounts(title) };
  const candidates =
    title.kind === 'MOVIE' ? await tmdb.movieCandidates(title.name, title.year) : await tmdb.tvCandidates(title.name, title.year);
  const { verdict, ranked } = decide(subject, candidates);
  row.verdict = verdict;
  const best = ranked[0];
  if (best) {
    row.tmdb = { id: best.candidate.tmdbId, title: best.candidate.title, year: best.candidate.year, score: round(best.score) };
    row.runnerUp = ranked[1] ? round(ranked[1].score) : undefined;
  }
  // Episodes whose season/number exist in TMDB as they are; the rest need a date or a mapping rule.
  if (title.kind === 'SERIES' && verdict !== 'new' && best?.candidate.seasonEpisodeCounts) {
    const tmdbSeasons = best.candidate.seasonEpisodeCounts;
    row.directEpisodes = videos.length
      ? title.seasons
          .flatMap((s) => s.episodes)
          .filter((e) => e.season !== null && e.episode !== null && (tmdbSeasons[e.season] ?? 0) >= e.episode).length
      : 0;
  }
  return row;
}

const round = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-');

const slugs = process.argv.slice(2).length ? process.argv.slice(2) : await sample();
console.log(`RaiPlay: ${slugs.length} titoli${tmdb ? '' : ' (TMDB_API_KEY assente: niente confronto con TMDB)'}\n`);

const rows: Row[] = [];
for (const slug of slugs) {
  try {
    const row = await probe(slug);
    rows.push(row);
    const tmdbPart = row.verdict
      ? `${row.verdict.padEnd(6)} ${row.tmdb ? `TMDB ${row.tmdb.id} "${row.tmdb.title}" ${row.tmdb.year ?? '?'} (${row.tmdb.score}${row.runnerUp !== undefined ? ` vs ${row.runnerUp}` : ''})` : ''}`
      : '';
    const eps = `${row.kind === 'SERIES' ? `${row.episodes}/${row.declared} ep ` : ''}+${row.extras} extra`;
    const direct = row.directEpisodes !== undefined ? ` diretti ${pct(row.directEpisodes, row.episodes)}` : '';
    console.log(
      `${row.kind.padEnd(6)} ${row.name.slice(0, 34).padEnd(34)} ${String(row.year ?? '?').padEnd(4)} ${eps.padEnd(24)} DRM ${row.drm}  ${tmdbPart}${direct}`,
    );
  } catch (err) {
    rows.push({ slug, kind: '-', name: slug, year: null, episodes: 0, declared: 0, drm: 0, playable: 0, extras: 0, extraGroups: [], error: String(err) });
    console.log(`ERRORE ${slug}: ${String(err)}`);
  }
}

const ok = rows.filter((r) => !r.error && r.kind !== '-');
const series = ok.filter((r) => r.kind === 'SERIES');
const sum = (list: Row[], key: 'episodes' | 'declared' | 'drm' | 'playable' | 'extras' | 'directEpisodes') =>
  list.reduce((n, r) => n + (r[key] ?? 0), 0);
console.log('\nRiepilogo');
console.log(`  titoli letti: ${ok.length}/${rows.length} (film ${ok.length - series.length}, serie/programmi ${series.length})`);
console.log(`  video: ${sum(ok, 'episodes')} (dichiarati da RaiPlay ${sum(ok, 'declared')}), con DRM ${sum(ok, 'drm')}, riproducibili ${sum(ok, 'playable')}`);
console.log(`  extra (sezione a parte): ${sum(ok, 'extras')} video in ${ok.reduce((n, r) => n + r.extraGroups.length, 0)} gruppi`);
if (tmdb) {
  const by = (v: Verdict) => ok.filter((r) => r.verdict === v).length;
  console.log(`  TMDB: automatici ${by('auto')} (${pct(by('auto'), ok.length)}), da rivedere ${by('review')}, nuovi ${by('new')}`);
  const matched = series.filter((r) => r.directEpisodes !== undefined);
  console.log(`  episodi delle serie abbinate che coincidono subito con TMDB: ${pct(sum(matched, 'directEpisodes'), sum(matched, 'episodes'))}`);
}

mkdirSync('.probe', { recursive: true });
writeFileSync('.probe/report.json', JSON.stringify(rows, null, 2));
console.log('\nResoconto completo: .probe/report.json');
