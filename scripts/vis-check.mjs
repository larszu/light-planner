// Repro: in 3D photo mode, do persons + fixtures vanish when heatmap is toggled
// off? Renders photo+heatmap then photo-only from a wide angle that shows the
// overhead lamps AND the people.
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5174';
const OUT = '/tmp/light';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  headless: true,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  defaultViewport: { width: 960, height: 640, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/scene-harness.html`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction('window.__lpReady === true', { timeout: 30000 });

// Wide angle: camera low & far in front, looking back so the overhead lamps and
// the people are both in frame.
const CAM = { x: 6, y: -7, height: 3.5, aimX: 6, aimY: 4.5, fov: 62 };

await page.evaluate(() => window.__lp.setMode({ photo: true, heatmap: true, exposure: 1.2, haze: 0.15 }));
await sleep(4500);
await page.evaluate((c) => window.__lp.lookAt(c), CAM);
await sleep(1800);
await page.screenshot({ path: `${OUT}/vis-photo-heat.png` });
console.log('shot photo+heat');

// Toggle heatmap OFF (photo stays on) — the reported failure case.
await page.evaluate(() => window.__lp.setMode({ heatmap: false }));
await sleep(1800);
await page.screenshot({ path: `${OUT}/vis-photo-only.png` });
console.log('shot photo-only');

await browser.close();
console.log('DONE', OUT);
