// Into the player the real way: Guarda on a title page, then what the screen is.
const path = require('node:path');
const jwt = require(path.join(process.env.MAIA_BE, 'node_modules', 'jsonwebtoken'));
const { chromium } = require('C:/Users/ivanl/Desktop/Ember/node_modules/playwright-core');
const [accountId, secret, out, movieId] = process.argv.slice(2);
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
  await p.waitForTimeout(2500);
  const ringAfterLogin = await p.evaluate(() => { const r = document.getElementById('tv-ring'); const q = r.getBoundingClientRect(); return { opacity: r.style.opacity, w: Math.round(q.width), focus: document.activeElement?.textContent?.trim().slice(0, 12) }; });
  console.log('dopo il profilo, anello:', JSON.stringify(ringAfterLogin));
  await p.evaluate(() => {
    window.__meta = [];
    const m = () => document.querySelector('meta[name="viewport"]')?.content;
    new MutationObserver(() => window.__meta.push(m())).observe(document.head, { subtree: true, childList: true, attributes: true, attributeFilter: ['content'] });
  });
  await p.evaluate((id) => { window.next?.router?.push?.(`/tv/title/${id}`); }, movieId);
  await p.goto(`http://localhost:3001/tv/title/${movieId}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  console.log('focus scheda:', await p.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 16)));
  await p.keyboard.press('Enter');
  await p.waitForURL(/\/watch\//, { timeout: 20000 });
  for (const ms of [150, 800, 3000]) {
    await p.waitForTimeout(ms);
    const s = await p.evaluate(() => {
      const v = document.querySelector('video');
      const r = v?.getBoundingClientRect();
      const root = document.querySelector('[data-own-keys]')?.getBoundingClientRect();
      return { inner: [innerWidth, innerHeight], vv: [Math.round(visualViewport.width), Math.round(visualViewport.height), visualViewport.scale], meta: document.querySelector('meta[name="viewport"]')?.content, video: r && [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], root: root && [Math.round(root.width), Math.round(root.height)], native: v ? [v.videoWidth, v.videoHeight] : null, fit: v ? getComputedStyle(v).objectFit : null };
    });
    console.log(`+${ms}`, JSON.stringify(s));
  }
  await p.screenshot({ path: path.join(out, 'watch-real.png') });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
