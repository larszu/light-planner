// Minimal, fast beam check (3 shots) so the software renderer doesn't time out
// while iterating on the raymarched volumetric beam.
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5174';
const HAZE = Number(process.argv[3] ?? 0.35);
const BEAMS = process.argv[4] !== 'off';
const OUT = '/tmp/light';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  headless: true,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  defaultViewport: { width: 960, height: 600, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/scene-harness.html`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction('window.__lpReady === true', { timeout: 30000 });
await page.evaluate((p) => window.__lp.setMode({ photo: true, heatmap: false, exposure: 1.2, haze: p.h, beams: p.b }), { h: HAZE, b: BEAMS });
await sleep(4500);

const suffix = BEAMS ? '' : '-nobeam';
const shot = async (name, cam) => {
  await page.evaluate((c) => window.__lp.lookAt(c), cam);
  await sleep(1600);
  await page.screenshot({ path: `${OUT}/bm-${name}${suffix}.png` });
  console.log('shot', name + suffix);
};
await shot('side', { x: 10.5, y: 3.0, height: 2.4, aimX: 5.5, aimY: 6.0, fov: 52 });
await shot('34', { x: 3.2, y: -1.5, height: 4.2, aimX: 6.2, aimY: 6.0, fov: 55 });
await shot('top', { x: 6, y: 5.6, height: 12, aimX: 6, aimY: 6.2, fov: 55 });
// A low back-corner angle (different orbit) — beam must still be visible here.
await shot('fwd', { x: 9.8, y: 9.8, height: 1.4, aimX: 4, aimY: 2.5, fov: 62 });
await browser.close();
console.log('DONE', OUT, 'haze', HAZE, 'beams', BEAMS);
