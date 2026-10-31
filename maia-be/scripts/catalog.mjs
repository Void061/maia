// Catalog commands from the terminal. The work itself is done by the catalog
// workers (backend, or `npm run catalog:worker` in local dev).
//   npm run catalog -- fill raiplay              first fill: list everything, sync every title
//   npm run catalog -- refresh raiplay           what the nightly pass does
//   npm run catalog -- sync raiplay marefuori    sync the given titles now
//   npm run catalog -- status                    what is in the catalog and in the queue
import 'dotenv/config';
import pg from 'pg';
import { PgBoss } from 'pg-boss';

const [command, provider, ...ids] = process.argv.slice(2);
const url = process.env.DATABASE_URL;

async function withBoss(fn) {
  // Only queues jobs: no maintenance, cron or instance registration here.
  const boss = new PgBoss({ connectionString: url, schema: 'pgboss', supervise: false, schedule: false, registerInstance: false });
  await boss.start();
  try {
    await fn(boss);
  } finally {
    await boss.stop({ graceful: false });
  }
}

if ((command === 'fill' || command === 'refresh') && provider) {
  await withBoss((boss) => boss.send('catalog-discover', { provider, mode: command }));
  console.log(`${provider}: ${command === 'fill' ? 'primo riempimento' : 'aggiornamento'} in coda. Avanzamento: npm run catalog -- status`);
} else if (command === 'sync' && provider && ids.length) {
  await withBoss(async (boss) => {
    for (const externalId of ids) await boss.send('catalog-sync-title', { provider, externalId }, { singletonKey: `${provider}:${externalId}` });
  });
  console.log(`${ids.length} titoli in coda.`);
} else if (command === 'status') {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const q = async (sql) => (await client.query(sql)).rows;
  const [titles] = await q(`SELECT count(*) FILTER (WHERE kind='MOVIE') movies, count(*) FILTER (WHERE kind='SERIES') series,
                                   count(*) FILTER (WHERE tmdb_id IS NOT NULL) with_tmdb FROM titles`);
  const verdicts = await q(`SELECT provider, verdict, count(*) n FROM provider_titles GROUP BY 1, 2 ORDER BY 1, 2`);
  const [sources] = await q(`SELECT count(*) total, count(*) FILTER (WHERE available) available, count(*) FILTER (WHERE drm) drm FROM sources`);
  const [episodes] = await q(`SELECT count(*) total, count(*) FILTER (WHERE provisional) provisional FROM episodes`);
  const [extras] = await q(`SELECT count(*) total, count(*) FILTER (WHERE available) available FROM extras`);
  const [reviews] = await q(`SELECT count(*) pending FROM match_reviews WHERE status='PENDING'`);
  const runs = await q(`SELECT provider, status, found, enqueued, started_at, finished_at, note FROM sync_runs ORDER BY started_at DESC LIMIT 3`);
  const health = await q(`SELECT provider, status, fail_streak, last_error FROM provider_health`);
  const jobs = await q(`SELECT name, state, count(*) n FROM pgboss.job WHERE name LIKE 'catalog-%' GROUP BY 1, 2 ORDER BY 1, 2`).catch(() => []);
  await client.end();

  console.log(`Titoli: ${titles.movies} film, ${titles.series} serie/programmi (${titles.with_tmdb} abbinati a TMDB)`);
  console.log(`Abbinamenti: ${verdicts.map((v) => `${v.provider} ${v.verdict ?? 'in corso'} ${v.n}`).join(', ') || '-'}`);
  console.log(`Episodi: ${episodes.total} (${episodes.provisional} provvisori) | Fonti: ${sources.available}/${sources.total} disponibili, ${sources.drm} con DRM`);
  console.log(`Extra: ${extras.available}/${extras.total} disponibili | Dubbi da rivedere: ${reviews.pending}`);
  for (const h of health) console.log(`Servizio ${h.provider}: ${h.status}${h.fail_streak ? ` (${h.fail_streak} errori di fila: ${h.last_error})` : ''}`);
  for (const r of runs)
    console.log(`Passata ${r.provider} ${r.started_at.toISOString().slice(0, 16)}: ${r.status}, trovati ${r.found ?? '-'}, in coda ${r.enqueued ?? '-'}${r.note ? ` (${r.note})` : ''}`);
  console.log(`Coda: ${jobs.map((j) => `${j.name.replace('catalog-', '')} ${j.state} ${j.n}`).join(', ') || 'vuota'}`);
} else {
  console.error('Uso: npm run catalog -- fill|refresh <servizio> | sync <servizio> <id...> | status');
  process.exit(1);
}
