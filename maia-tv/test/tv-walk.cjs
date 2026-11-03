// The remote on every screen, as on the Fire Stick: a mobile WebView-like page
// (960x540 @2, meta viewport honoured), real key presses. After every press:
// is the focus visible, is any card or image cut by the screen, the menu or its row?
// Usage: node tv-walk.cjs <accountId> <jwtSecret> <outDir>
const path = require('node:path');
const jwt = require(path.join(process.env.MAIA_BE, 'node_modules', 'jsonwebtoken'));
const { chromium } = require('C:/Users/ivanl/Desktop/Ember/node_modules/playwright-core');
const [accountId, secret, out] = process.argv.slice(2);
const UA = 'Mozilla/5.0 (Linux; Android 9; AFTMM) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 MaiaTV/1.0';
const report = { fail: 0 };

(async () => {
  const token = jwt.sign({ sub: accountId, sid: 'test-session' }, secret, { expiresIn: 1800 });
  const b = await chromium.launch({ channel: 'chrome' });
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2, isMobile: true, hasTouch: false, userAgent: UA });
  await ctx.addCookies([{ name: 'maia_at', value: token, domain: 'localhost', path: '/' }, { name: 'maia_rt', value: 'x', domain: 'localhost', path: '/' }]);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  const state = () => p.evaluate(() => {
    const W = innerWidth, H = innerHeight;
    const bar = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
    const a = document.activeElement;
    const r = a?.getBoundingClientRect();
    const cut = [];
    for (const el of document.querySelectorAll('.lift')) {
      if (!el.getClientRects().length) continue;
      const c = el.getBoundingClientRect();
      if (c.bottom <= bar + 1 || c.top >= H - 1 || c.right <= 1 || c.left >= W - 1) continue; // off screen
      // Clipped by its rail?
      const rail = el.closest('.rail');
      if (rail) {
        const q = rail.getBoundingClientRect();
        if (c.right <= q.left + 1 || c.left >= q.right - 1) continue; // scrolled out of the rail
        if (c.left < q.left - 1 || c.right > q.right + 1) { cut.push(`riga:${Math.round(c.left)}-${Math.round(c.right)}`); continue; }
      }
      const box = el.closest('.tv-grid-search');
      if (box) {
        const q = box.getBoundingClientRect();
        if (c.bottom <= q.top + 1 || c.top >= q.bottom - 1) continue;
        if (c.top < q.top - 1 || c.bottom > q.bottom + 1) { cut.push(`risultati:${Math.round(c.top)}`); continue; }
      }
      if (c.top < bar - 1) cut.push(`sopra:${Math.round(c.top)}`);
      else if (c.bottom > H + 1) cut.push(`sotto:${Math.round(c.bottom)}`);
      else if (c.left < -1 || c.right > W + 1) cut.push(`lato:${Math.round(c.left)}`);
    }
    // Anything of the page hidden under the menu: tabs, headings, buttons.
    const under = [];
    for (const el of document.querySelectorAll('main [role=tab], main h2, main h1, main button, main a')) {
      if (!el.getClientRects().length || el.closest('.tv-grid-search, .rail')) continue;
      const c = el.getBoundingClientRect();
      if (c.top < bar - 1 && c.bottom > bar + 1) under.push((el.textContent || '').trim().slice(0, 14));
    }
    if (under.length) cut.push(`sotto-menu:${under.slice(0, 2).join(',')}`);
    // More than half of the screen empty under the last thing shown.
    let low = 0;
    for (const el of document.querySelectorAll('main .lift')) {
      if (!el.getClientRects().length) continue;
      const c = el.getBoundingClientRect();
      if (c.top < H && c.bottom > 0) low = Math.max(low, c.bottom);
    }
    const empty = low > 0 && low < H * 0.45 && document.querySelectorAll('main [data-row]').length > 2;
    if (empty) cut.push(`vuoto-sotto:${Math.round(low)}`);
    return {
      W, H,
      tag: a?.tagName,
      name: (a?.getAttribute('aria-label') || a?.textContent || '').trim().slice(0, 24),
      row: a?.closest('section')?.querySelector('h2')?.textContent?.slice(0, 22) ?? '',
      y: r ? Math.round(r.top) : null,
      visible: r ? r.bottom > 0 && r.top < H && r.left < W && r.right > 0 && r.width > 0 : false,
      body: a === document.body,
      cut,
      path: location.pathname + location.search,
      scrollY: Math.round(scrollY),
    };
  });

  async function walk(label, keys, { shot } = {}) {
    let moves = 0, cutPresses = 0, lost = 0, sample = '';
    let last = await state();
    for (const k of keys) {
      await p.keyboard.press(k);
      await p.waitForTimeout(110);
      const s = await state();
      if (s.name !== last.name || s.scrollY !== last.scrollY || s.path !== last.path) moves++;
      if (!s.visible && !s.body) lost++;
      if (s.cut.length) { cutPresses++; sample = sample || `${k}@${s.row || s.name}: ${s.cut.slice(0, 4).join(' ')}`; }
      last = s;
    }
    const ok = cutPresses === 0 && lost === 0 && moves > 0;
    if (!ok) report.fail++;
    console.log(`${ok ? 'OK  ' : 'KO  '} ${label}: pressioni ${keys.length}, mosse ${moves}, con tagli ${cutPresses}, focus perso ${lost} ${sample}`);
    if (shot) await p.screenshot({ path: path.join(out, `walk-${shot}.png`) });
    return last;
  }
  const down = (n) => Array(n).fill('ArrowDown'), up = (n) => Array(n).fill('ArrowUp'), right = (n) => Array(n).fill('ArrowRight'), left = (n) => Array(n).fill('ArrowLeft');
  const ready = async (fn) => { await p.waitForFunction(fn, null, { timeout: 60000 }); await p.waitForTimeout(1500); };

  await p.goto('http://localhost:3001/profiles', { waitUntil: 'networkidle' });
  await p.getByText('Ivan', { exact: true }).first().click();
  await p.waitForURL(/\/tv/, { timeout: 20000 });
  await ready(() => document.images.length > 100);
  const first = await state();
  console.log('schermo logico', first.W, 'x', first.H, '| tv', await p.evaluate(() => document.documentElement.classList.contains('tv')));
  await p.screenshot({ path: path.join(out, 'walk-home.png') });

  await walk('Home giù', down(14), { shot: 'home-row' });
  await walk('Home destra', right(25), { shot: 'home-right' });
  await walk('Home sinistra', left(25));
  await walk('Home su', up(16));

  // Menu → Film / Serie.
  for (const [name, url] of [['Film', /movies/], ['Serie', /series/]]) {
    await p.goto(`http://localhost:3001/tv/${name === 'Film' ? 'movies' : 'series'}`, { waitUntil: 'networkidle' });
    await ready(() => document.images.length > 20);
    await walk(`${name} giù`, down(10), { shot: name.toLowerCase() });
    await walk(`${name} destra`, right(10));
    await walk(`${name} su`, up(12));
  }

  // A genre page (grid).
  await p.goto('http://localhost:3001/tv/movies/commedia', { waitUntil: 'networkidle' });
  await ready(() => document.images.length > 10);
  await walk('Genere giù', down(9), { shot: 'genre' });
  await walk('Genere su', up(11));

  // A title with episodes.
  const id = await p.evaluate(async () => {
    const d = await (await fetch('/api/tv/titles?kind=SERIES&take=40')).json();
    return d.items.find((t) => t.seasons > 0)?.id;
  });
  await p.goto(`http://localhost:3001/tv/title/${id}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: path.join(out, 'walk-title.png') });
  await walk('Scheda giù', down(4), { shot: 'title-eps' });
  await walk('Scheda destra', right(8));
  await walk('Scheda su', up(6));

  // Search: one keyboard, MAIA's.
  await p.goto('http://localhost:3001/tv/search', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  await walk('Cerca risultati', [...down(3), ...right(5), ...down(6)], { shot: 'search' });
  await walk('Cerca su', up(8));
  const ro = await p.evaluate(() => { const i = document.querySelector('input'); return { readOnly: i?.readOnly, inputMode: i?.inputMode }; });
  await p.locator('input').first().focus();
  await p.keyboard.press('Enter');
  await p.waitForTimeout(400);
  const keys = await p.evaluate(() => ({ grid: !!document.querySelector('#search-keyboard'), focus: document.activeElement?.textContent }));
  await p.screenshot({ path: path.join(out, 'walk-keyboard.png') });
  await p.keyboard.press('Enter');
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(150);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(700);
  const typed = await p.evaluate(() => document.querySelector('input')?.value);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const closed = await p.evaluate(() => !document.querySelector('#search-keyboard') && location.pathname);
  const kOk = ro.readOnly && keys.grid && keys.focus === 'a' && typed === 'ab' && closed === '/tv/search';
  if (!kOk) report.fail++;
  console.log(`${kOk ? 'OK  ' : 'KO  '} Tastiera: sola lettura ${ro.readOnly}, si apre ${keys.grid} su "${keys.focus}", scritto "${typed}", Indietro chiude e resta su ${closed}`);

  // Admin, the real way: profile menu → Amministrazione, then move and go back.
  await p.goto('http://localhost:3001/tv', { waitUntil: 'networkidle' });
  await ready(() => document.images.length > 100);
  await p.getByRole('button', { name: /Profilo/ }).focus();
  await p.keyboard.press('Enter');
  await p.waitForTimeout(500);
  await p.getByRole('link', { name: 'Amministrazione' }).focus();
  await p.keyboard.press('Enter');
  await p.waitForURL(/admin/, { timeout: 15000 });
  await p.waitForTimeout(2500);
  const seen = new Set();
  for (const k of [...down(6), ...right(3), ...up(3), ...down(4)]) {
    await p.keyboard.press(k);
    await p.waitForTimeout(110);
    seen.add((await state()).name);
  }
  const adminMoved = seen.size;
  await p.screenshot({ path: path.join(out, 'walk-admin.png') });
  await p.evaluate(() => { const el = document.activeElement ?? document.body; el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
  await p.waitForTimeout(1500);
  const after = await state();
  const backOk = !after.path.startsWith('/admin');
  if (adminMoved < 3 || !backOk) report.fail++;
  console.log(`${adminMoved >= 3 && backOk ? 'OK  ' : 'KO  '} Admin: elementi raggiunti ${adminMoved}, Indietro porta a ${after.path}`);

  console.log(report.fail ? `\nFALLITI: ${report.fail}` : '\nTUTTO OK', '| errori pagina', errors.length, errors.slice(0, 2));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
