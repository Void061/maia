// QR login and two-step verification end to end, on a throwaway account, with
// emails read from Mailpit (the backend runs without Resend for this test).
// Usage: node fast-login.cjs <email> <password> <accountId> <outDir>
const path = require('node:path');
const { execSync } = require('node:child_process');
const { chromium } = require('C:/Users/ivanl/Desktop/Ember/node_modules/playwright-core');
const [email, password, accountId, out] = process.argv.slice(2);
const UA_TV = 'Mozilla/5.0 (Linux; Android 9; AFTSS; wv) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 MaiaTV/1.0';
const sql = (q) => execSync('docker exec -i maia-postgres-1 psql -U maia -d maia -tA', { input: q }).toString().trim();
let fail = 0;
const check = (ok, text) => { if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'KO  '} ${text}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mailpit = 'http://localhost:8025/api/v1';
const clearMail = () => fetch(`${mailpit}/messages`, { method: 'DELETE' });
async function lastCode() {
  for (let i = 0; i < 30; i++) {
    const { messages } = await (await fetch(`${mailpit}/messages`)).json();
    const m = messages?.find((x) => x.To?.some((t) => t.Address === email));
    if (m) return m.Subject.match(/\d{6}/)?.[0];
    await wait(300);
  }
  return null;
}
const api = (url, body, cookie) => fetch(`http://localhost:3000${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body ?? {}) });

(async () => {
  const b = await chromium.launch({ channel: 'chrome' });
  const phoneCtx = await b.newContext({ viewport: { width: 390, height: 800 } });
  const phone = await phoneCtx.newPage();

  // Phone: not signed in, the QR link goes through the login and keeps the code.
  await clearMail();
  const tvCtx = await b.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2, isMobile: true, userAgent: UA_TV });
  const tv = await tvCtx.newPage();
  await tv.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await tv.waitForSelector('img[alt^="QR"]', { timeout: 15000 });
  await tv.waitForTimeout(800);
  await tv.screenshot({ path: path.join(out, 'fast-tv.png') });
  const code = await tv.evaluate(() => document.querySelector('.tv-login .font-mono')?.textContent);
  const focus = await tv.evaluate(() => document.activeElement?.textContent);
  check(/^[A-Z2-9]{6}$/.test(code), `TV: QR e codice a schermo (${code})`);
  check(focus === 'Usa email e password', `TV: il telecomando parte da "${(focus ?? '').slice(0, 30)}"`);
  const qrFits = await tv.evaluate(() => { const r = document.querySelector('.tv-login').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; });
  check(qrFits, 'TV: tutto dentro lo schermo');

  await phone.goto(`http://localhost:3001/link?code=${code}`, { waitUntil: 'networkidle' });
  check(/\/login\?next=/.test(phone.url()) && decodeURIComponent(phone.url()).includes(`/link?code=${code}`), 'Telefono senza sessione: al login, tenendo il codice');
  await phone.fill('input[name=email]', email);
  await phone.fill('input[name=password]', 'sbagliata-123');
  await phone.getByRole('button', { name: 'Accedi', exact: true }).click();
  await phone.waitForTimeout(800);
  check(/non corrette/.test(await phone.textContent('body')), 'Password sbagliata rifiutata');
  await phone.fill('input[name=password]', password);
  await phone.getByRole('button', { name: 'Accedi', exact: true }).click();
  await phone.waitForURL(/\/link/, { timeout: 15000 });
  await phone.getByText('Fire TV').waitFor({ timeout: 10000 });
  await phone.screenshot({ path: path.join(out, 'fast-phone.png') });
  check(true, 'Telefono: dopo il login torna alla conferma, con il dispositivo');
  await phone.getByRole('button', { name: 'Conferma' }).click();
  await phone.getByText('Fatto').waitFor({ timeout: 8000 });
  await tv.waitForURL(/\/profiles|\/welcome/, { timeout: 12000 });
  check(true, `TV: entrata da sola (${new URL(tv.url()).pathname})`);
  const tvSessions = sql(`select count(*) from sessions where account_id='${accountId}' and user_agent like '%MaiaTV%' and revoked_at is null`);
  check(tvSessions === '1', 'La TV ha la sua sessione, separata dal telefono');

  // The code cannot be used twice, and Rifiuta works.
  const again = await phone.evaluate(async (c) => (await fetch(`/api/auth/pair/${c}`)).status, code);
  check(again === 404, 'Il codice già usato non vale più');
  const tv2 = await (await b.newContext({ userAgent: UA_TV })).newPage();
  await tv2.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await tv2.waitForSelector('img[alt^="QR"]', { timeout: 15000 });
  await tv2.waitForTimeout(600);
  const code2 = await tv2.evaluate(() => document.querySelector('.tv-login .font-mono')?.textContent);
  await phone.goto(`http://localhost:3001/link?code=${code2.toLowerCase()}`, { waitUntil: 'networkidle' });
  await phone.getByRole('button', { name: 'Non sono io' }).click();
  await phone.getByText('Accesso rifiutato').waitFor({ timeout: 8000 });
  await tv2.getByText('Accesso rifiutato dal telefono').waitFor({ timeout: 8000 });
  await tv2.waitForTimeout(500);
  const code3 = await tv2.evaluate(() => document.querySelector('.tv-login .font-mono')?.textContent);
  check(code3 !== code2 && /\/login/.test(tv2.url()), `Rifiutato: la TV resta fuori con un codice nuovo (${code3})`);
  await phone.goto('http://localhost:3001/link', { waitUntil: 'networkidle' });
  await phone.fill('input[name=code]', 'ZZZZZZ');
  await phone.getByRole('button', { name: 'Continua' }).click();
  await phone.getByText('Codice scaduto o sbagliato').waitFor({ timeout: 8000 });
  check(true, 'Codice inventato: spiegato sul telefono');
  const anon = await api('/auth/pair/approve', { code: code3 });
  check(anon.status === 401, 'Approvare senza sessione non è possibile');
  const fakePoll = await (await api('/auth/pair/poll', { token: 'inventato' })).json();
  check(fakePoll.status === 'expired', 'Un token inventato non ottiene niente');

  // Two-step verification: on from Account, with a code.
  await phone.goto('http://localhost:3001/account', { waitUntil: 'networkidle' });
  await clearMail();
  const section = phone.locator('section', { hasText: 'Verifica in due passaggi' });
  await section.getByRole('button', { name: 'Attiva' }).click();
  await section.locator('input[name=two-factor-code]').waitFor({ timeout: 8000 });
  const c1 = await lastCode();
  check(!!c1, `Codice di attivazione arrivato per email (${c1})`);
  await section.locator('input[name=two-factor-code]').fill(c1 === '000000' ? '111111' : '000000');
  await section.getByRole('button', { name: 'Attiva' }).click();
  await phone.getByText(/Codice sbagliato/).waitFor({ timeout: 8000 });
  check(sql(`select two_factor from accounts where id='${accountId}'`) === 'f', 'Codice sbagliato: non si attiva');
  await section.locator('input[name=two-factor-code]').fill(c1);
  await section.getByRole('button', { name: 'Attiva' }).click();
  await section.getByText('Password, per disattivarla').waitFor({ timeout: 8000 });
  check(sql(`select two_factor from accounts where id='${accountId}'`) === 't', 'Codice giusto: attiva');

  // Login with it, from a clean browser.
  await clearMail();
  const pc = await (await b.newContext({ viewport: { width: 1000, height: 800 } })).newPage();
  await pc.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await pc.fill('input[name=email]', email);
  await pc.fill('input[name=password]', password);
  await pc.getByRole('button', { name: 'Accedi', exact: true }).click();
  await pc.getByText("Controlla l'email").waitFor({ timeout: 8000 });
  await pc.screenshot({ path: path.join(out, 'fast-code.png') });
  const cookies = (await pc.context().cookies()).map((c) => c.name);
  check(!cookies.includes('maia_at') && !cookies.includes('maia_rt'), 'Dopo la sola password nessuna sessione');
  const c2 = await lastCode();
  await pc.fill('input[name=code]', c2 === '000000' ? '111111' : '000000');
  await pc.getByRole('button', { name: 'Entra' }).click();
  await pc.getByText(/Tentativi rimasti: 4/).waitFor({ timeout: 8000 });
  check(true, 'Codice sbagliato: dice i tentativi rimasti');
  await pc.fill('input[name=code]', c2);
  await pc.getByRole('button', { name: 'Entra' }).click();
  await pc.waitForURL(/\/profiles|\/welcome/, { timeout: 12000 });
  check(true, `Codice giusto: dentro (${new URL(pc.url()).pathname})`);

  // Five wrong codes end the challenge; a spent code does not come back.
  await clearMail();
  const login = await (await api('/auth/login', { email, password })).json();
  const c3 = await lastCode();
  check(login.twoFactor && !!login.challenge, 'API: password giusta dà solo la sfida');
  let last;
  for (let i = 0; i < 5; i++) last = await (await api('/auth/login/verify', { challenge: login.challenge, code: c3 === '000000' ? '111111' : '000000' })).json();
  const blocked = await api('/auth/login/verify', { challenge: login.challenge, code: c3 });
  check(last.code === 'CODE_EXPIRED' && blocked.status === 400, 'Dopo 5 errori nemmeno il codice giusto entra');

  // QR with two-step on: the phone already passed it, the TV does not ask.
  const tv3 = await (await b.newContext({ userAgent: UA_TV })).newPage();
  await tv3.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await tv3.waitForSelector('img[alt^="QR"]', { timeout: 15000 });
  await tv3.waitForTimeout(600);
  const code4 = await tv3.evaluate(() => document.querySelector('.tv-login .font-mono')?.textContent);
  await phone.goto(`http://localhost:3001/link?code=${code4}`, { waitUntil: 'networkidle' });
  await phone.getByRole('button', { name: 'Conferma' }).click();
  await tv3.waitForURL(/\/profiles|\/welcome/, { timeout: 12000 });
  check(true, 'Col QR la TV entra anche con la verifica attiva');

  // Off, with the password.
  await phone.goto('http://localhost:3001/account', { waitUntil: 'networkidle' });
  await phone.fill('input[name=two-factor-password]', 'sbagliata-123');
  await section.getByRole('button', { name: 'Disattiva' }).click();
  await phone.getByText('La password non è corretta').waitFor({ timeout: 8000 });
  await phone.fill('input[name=two-factor-password]', password);
  await section.getByRole('button', { name: 'Disattiva' }).click();
  await section.getByRole('button', { name: 'Attiva' }).waitFor({ timeout: 8000 });
  check(sql(`select two_factor from accounts where id='${accountId}'`) === 'f', 'Disattivata solo con la password giusta');

  await b.close();
  console.log(fail ? `\nFALLITI: ${fail}` : '\nTUTTO OK');
})().catch((e) => { console.error(e.message.slice(0, 500)); process.exit(1); });
