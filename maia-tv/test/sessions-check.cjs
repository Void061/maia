// Connected devices against the running backend, with throwaway sessions and a
// throwaway second account (created and removed by sessions-check.sh).
// Usage: node sessions-check.cjs <accountId> <otherAccountId> <jwtSecret> <outDir>
const path = require('node:path');
const { execSync } = require('node:child_process');
const jwt = require(path.join(process.env.MAIA_BE, 'node_modules', 'jsonwebtoken'));
const { chromium } = require('C:/Users/ivanl/Desktop/Ember/node_modules/playwright-core');
const [accountId, otherId, secret, out] = process.argv.slice(2);
const sql = (q) => execSync('docker exec -i maia-postgres-1 psql -U maia -d maia -tA', { input: q }).toString().trim();
const token = (sub, sid) => jwt.sign({ sub, sid }, secret, { expiresIn: 900 });
const call = async (sub, sid, method, url) => {
  const r = await fetch(`http://localhost:3000${url}`, { method, headers: { cookie: `maia_at=${token(sub, sid)}` } });
  let body = null;
  try { body = await r.json(); } catch {}
  return { status: r.status, body };
};
let fail = 0;
const check = (ok, text) => { if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'KO  '} ${text}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const list = await call(accountId, 't-a', 'GET', '/me/sessions');
  const mine = list.body.filter((s) => s.id.startsWith('t-'));
  check(list.status === 200 && mine.length === 4, `Elenco: ${list.body.length} sessioni, di cui mie di prova ${mine.length}`);
  check(list.body[0].id === 't-a' && list.body[0].current, 'Questo dispositivo è il primo e segnato');
  check(!list.body.some((s) => s.id === 't-revoked' || s.id === 't-expired' || s.id === 't-other'), 'Niente sessioni chiuse, scadute o di altri');
  console.log('    ', mine.map((s) => s.device).join(' | '));

  check((await call(accountId, 't-b', 'GET', '/me')).status === 200, 'Il dispositivo B funziona');
  check((await call(accountId, 't-a', 'DELETE', '/me/sessions/t-b')).status === 204, 'Disconnetto B da A');
  check((await call(accountId, 't-b', 'GET', '/me')).status === 401, 'B è fuori SUBITO, con un token ancora valido');
  check((await call(accountId, 't-a', 'GET', '/me')).status === 200, 'A resta dentro');
  check((await call(accountId, 't-a', 'DELETE', '/me/sessions/t-b')).status === 404, 'Disconnettere di nuovo B: 404');
  check((await call(accountId, 't-a', 'DELETE', '/me/sessions/t-other')).status === 404, 'La sessione di un altro account non si tocca');
  check(sql("select revoked_at is null from sessions where id = 't-other'") === 't', "...e infatti è ancora aperta");
  check((await call(accountId, 't-a', 'DELETE', '/me/sessions/t-a')).status === 400, 'Non ci si disconnette da soli da qui');
  check((await call(accountId, 'non-esiste', 'GET', '/me')).status === 401, 'Una sessione inesistente non entra');
  check((await call(otherId, 't-a', 'GET', '/me')).status === 401, 'Il token di una sessione di un altro account non entra');

  // Closed outside the app: within the 15 s memory.
  await call(accountId, 't-c', 'GET', '/me');
  sql("update sessions set revoked_at = now() where id = 't-c'");
  await wait(16000);
  check((await call(accountId, 't-c', 'GET', '/me')).status === 401, 'Chiusa senza passare dalla app: fuori entro 15 secondi');

  // The real pages: A in a browser, the list, Disconnetti; and D, disconnected, sent to the login.
  const b = await chromium.launch({ channel: 'chrome' });
  const open = async (sid, url) => {
    const ctx = await b.newContext({ viewport: { width: 1000, height: 900 } });
    await ctx.addCookies([{ name: 'maia_at', value: token(accountId, sid), domain: 'localhost', path: '/' }, { name: 'maia_rt', value: 'invalid', domain: 'localhost', path: '/' }]);
    const p = await ctx.newPage();
    await p.goto(`http://localhost:3001${url}`, { waitUntil: 'networkidle' });
    return p;
  };
  const pageD = await open('t-d', '/account');
  const pageA = await open('t-a', '/account');
  await pageA.getByText('Dispositivi connessi').waitFor({ timeout: 15000 });
  await pageA.getByText('Questo dispositivo').waitFor({ timeout: 15000 });
  await pageA.getByText('Dispositivi connessi').scrollIntoViewIfNeeded();
  await pageA.screenshot({ path: path.join(out, 'sessions.png'), fullPage: true });
  const li = pageA.locator('li', { hasText: 'iPhone' });
  await li.getByRole('button', { name: 'Disconnetti' }).click();
  await pageA.waitForTimeout(1200);
  check((await pageA.locator('li', { hasText: 'iPhone' }).count()) === 0, 'Dal browser: il tasto Disconnetti toglie il dispositivo dalla lista');
  await pageD.evaluate(async () => { await fetch('/api/me'); });
  await pageD.reload({ waitUntil: 'networkidle' });
  await pageD.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {});
  check(/\/login/.test(pageD.url()), `Il dispositivo disconnesso finisce al login (${pageD.url().slice(21, 60)})`);
  await b.close();
  console.log(fail ? `\nFALLITI: ${fail}` : '\nTUTTO OK');
})().catch((e) => { console.error(e); process.exit(1); });
