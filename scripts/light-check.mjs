// Photorealism check (heatmap OFF): does the photo renderer show clear
// brightness falloff from the spots, and are the shadows real? Renders the
// scene from a few angles that reveal floor light-pools + cast shadows.
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
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/scene-harness.html`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction('window.__lpReady === true', { timeout: 30000 });

// Photo ON, heatmap OFF.
await page.evaluate(() => window.__lp.setMode({ photo: true, heatmap: false, exposure: 1.2, haze: 0.18 }));
await sleep(4500); // model + textures + a few frames

async function shot(name, cam) {
  await page.evaluate((c) => window.__lp.lookAt(c), cam);
  await sleep(1800);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}

// Elevated 3/4 front: sees lit fronts, floor pools and shadows trailing to the wall.
await shot('a-34front', { x: 3.2, y: -1.5, height: 4.2, aimX: 6.2, aimY: 6.0, fov: 55 });
// Top-ish: the two light pools + their falloff and the shadow shapes.
await shot('b-topdown', { x: 6, y: 5.6, height: 12, aimX: 6, aimY: 6.2, fov: 55 });
// Low grazing from the side: shadow length + brightness gradient across the floor.
await shot('c-graze', { x: 11.5, y: 6.2, height: 1.4, aimX: 5.5, aimY: 6.2, fov: 50 });

// Haze sweep at a beam-revealing angle: 0 must show NO shaft, rising = denser.
await page.evaluate(() => window.__lp.lookAt({ x: 10.5, y: 3.0, height: 2.4, aimX: 5.5, aimY: 6.0, fov: 52 }));
for (const h of [0, 0.15, 0.45, 0.9]) {
  await page.evaluate((hz) => window.__lp.setMode({ haze: hz }), h);
  await sleep(1300);
  await page.screenshot({ path: `${OUT}/haze-${h}.png` });
  console.log('shot haze', h);
}

await browser.close();
console.log('DONE', OUT);
