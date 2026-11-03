// Renders an SVG of this folder to a PNG with Chrome.
// Usage: node render.cjs <file.svg> <out.png> <width> <height>
// The element #spark is placed over the dotless i of #word (the logo's dot).
const fs = require('node:fs');
const { chromium } = require('C:/Users/ivanl/Desktop/Ember/node_modules/playwright-core');

const [svgFile, out, w, h] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  const svg = fs.readFileSync(svgFile, 'utf8').replace('<svg ', `<svg width="${w}" height="${h}" `);
  await page.setContent(
    `<html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@800&display=block" rel="stylesheet"></head><body style="margin:0">${svg}</body></html>`,
    { waitUntil: 'networkidle' },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const word = document.getElementById('word');
    const spark = document.getElementById('spark');
    if (!word || !spark) return;
    const box = word.getExtentOfChar(2);
    spark.setAttribute('transform', `translate(${box.x + box.width / 2} ${box.y + box.height * 0.27})`);
  });
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: +w, height: +h } });
  await browser.close();
})();
