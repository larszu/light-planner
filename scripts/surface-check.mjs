// Verifies the configurable floor / wall finishes in the realistic view.
// Renders the harness in photo mode, cycles the floor through its presets and
// the back wall through a couple of finishes, and writes screenshots.
// Usage (dev server on 5174): node scripts/surface-check.mjs [baseURL]
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5174';
const URL = `${BASE}/scene-harness.html`;
const OUT = '/tmp/surf';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  headless: true,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push('[err] ' + m.text()); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction('window.__lpReady === true', { timeout: 30000 });

// A camera low and back so we see a big sweep of floor plus the back wall.
const cam = { x: 5.5, y: -1.5, height: 2.2, aimX: 6, aimY: 8.5, fov: 60 };
await page.evaluate(() => window.__lp.setMode({ photo: true, heatmap: false, beams: false, ambience: 0.7 }));
await sleep(400);
await page.evaluate((c) => window.__lp.lookAt(c), cam);
await sleep(3500);

const floors = ['parquet', 'concrete', 'planks', 'tiles', 'carpet'];
for (const f of floors) {
  await page.evaluate((fl) => window.__lp.setMode({ floor: fl }), f);
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/floor-${f}.png` });
  console.log('shot floor', f);
}

// Wall finishes (rebuild needs a mode nudge to re-run the data effect).
await page.evaluate(() => window.__lp.setMode({ floor: 'parquet' }));
for (const wm of ['woodchip', 'brick', 'concrete']) {
  await page.evaluate((m) => { window.__lp.setWallMaterial(m); window.__lp.setMode({ photo: false }); }, wm);
  await sleep(500);
  await page.evaluate(() => window.__lp.setMode({ photo: true }));
  await sleep(2500);
  await page.evaluate((c) => window.__lp.lookAt(c), cam);
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/wall-${wm}.png` });
  console.log('shot wall', wm);
}

console.log('errors:', logs.slice(-15).join(' | ') || 'none');
await browser.close();
console.log('DONE →', OUT);
