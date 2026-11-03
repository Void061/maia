// Does it glide? Samples the ring, the rows and the menu pill frame by frame
// during a key press, on a slowed down CPU; then Enter and Back on a card.
const path = require('node:path');
const jwt = require(path.join(process.env.MAIA_BE, 'node_modules', 'jsonwebtoken'));
const { chromium } = require('C:/Users/ivanl/Desktop/Ember/node_modules/playwright-core');
const [accountId, secret, out] = process.argv.slice(2);
const UA = 'Mozilla/5.0 (Linux; Android 9; AFTMM) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 MaiaTV/1.0';
(async () => {
  const token = jwt.sign({ sub: accountId, sid: 'test-session' }, secret, { expiresIn: 900 });
  const b = await chromium.launch({ channel: 'chrome' });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2, isMobile: true, userAgent: UA });
  await ctx.addCookies([{ name: 'maia_at', value: token, domain: 'localhost', path: '/' }, { name: 'maia_rt', value: 'x', domain: 'localhost', path: '/' }]);
  const p = await ctx.newPage();
  await p.goto('http://localhost:3001/profiles', { waitUntil: 'networkidle' });
  await p.getByText('Ivan', { exact: true }).first().click();
  await p.waitForURL(/\/tv/, { timeout: 20000 });
  await p.waitForFunction(() => document.images.length > 100, null, { timeout: 60000 });
  await p.waitForTimeout(3000);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  const sample = async (label, key, read) => {
    await p.evaluate((src) => {
      const read = new Function('return ' + src)();
      window.__s = [];
      const t0 = performance.now();
      const tick = () => { window.__s.push([Math.round(performance.now() - t0), read()]); if (performance.now() - t0 < 420) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, read.toString());
    await p.keyboard.press(key);
    await p.waitForTimeout(520);
    const s = await p.evaluate(() => window.__s);
    const vals = s.map((x) => x[1]);
    const distinct = [...new Set(vals)];
    const gaps = s.slice(1).map((x, i) => x[0] - s[i][0]);
    console.log(`${label}: ${distinct.length} posizioni diverse in ${s.length} fotogrammi, da ${vals[0]} a ${vals[vals.length - 1]}, fotogramma max ${Math.max(...gaps)} ms | ${distinct.slice(0, 8).join(' ')}`);
  };
  const ringX = () => Math.round(document.getElementById('tv-ring').getBoundingClientRect().left);
  const ringY = () => Math.round(document.getElementById('tv-ring').getBoundingClientRect().top);
  const pageY = () => Math.round(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-tv-page]')).transform).m42);
  const railX = () => Math.round(new DOMMatrixReadOnly(getComputedStyle(document.activeElement.closest('.rail')).transform).m41);
  const pillX = () => Math.round(document.querySelector('.tab-pill').getBoundingClientRect().left);

  await sample('Giù nella prima riga, pagina', 'ArrowDown', pageY);
  await p.keyboard.press('ArrowDown'); await p.waitForTimeout(400);
  await sample('Giù, pagina', 'ArrowDown', pageY);
  await sample('Destra, anello', 'ArrowRight', ringX);
  for (let i = 0; i < 6; i++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300); }
  await sample('Destra a fine schermo, riga', 'ArrowRight', railX);
  await sample('Giù, anello verticale', 'ArrowDown', ringY);

  // Enter on a card, Back: same card, same place.
  const before = await p.evaluate(() => ({ id: document.activeElement.getAttribute('data-title'), y: Math.round(document.activeElement.getBoundingClientRect().top) }));
  await p.keyboard.press('Enter');
  await p.waitForURL(/\/tv\/title\//, { timeout: 20000 });
  await p.waitForTimeout(2500);
  const onTitle = await p.evaluate(() => (document.activeElement.textContent || '').trim().slice(0, 20));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(2000);
  const after = await p.evaluate(() => ({ id: document.activeElement.getAttribute('data-title'), y: Math.round(document.activeElement.getBoundingClientRect().top), path: location.pathname }));
  console.log(`Invio e Indietro: scheda con focus su "${onTitle}", ritorno ${before.id === after.id ? 'sulla stessa card' : 'su ALTRA card'} (y ${before.y} -> ${after.y}) ${after.path}`);

  // The menu pill.
  for (let i = 0; i < 12; i++) { await p.keyboard.press('ArrowUp'); await p.waitForTimeout(240); }
  await p.waitForTimeout(400);
  console.log('in cima su', await p.evaluate(() => document.activeElement.textContent?.trim().slice(0, 12)));
  await sample('Menu, destra', 'ArrowRight', pillX);
  await p.screenshot({ path: path.join(out, 'anim-menu.png') });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
