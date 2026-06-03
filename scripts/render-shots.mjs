// Headless renderer for the Scene3D harness. Launches a software-WebGL Chromium
// (via @sparticuz/chromium), drives the harness at /scene-harness.html, and
// writes screenshots of the 3D / Photo / Heatmap modes to /tmp/shots.
//
// One-time setup (kept out of package.json so the release CI / app install stay
// lean — the chromium binary is ~50 MB):
//   npm i --no-save puppeteer-core @sparticuz/chromium
//
// Then, with the dev server running (npm run dev -- --port 5174 --strictPort):
//   node scripts/render-shots.mjs http://localhost:5174
//
// Usage: node scripts/render-shots.mjs [baseURL]
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5174';
const URL = `${BASE}/scene-harness.html`;
const OUT = '/tmp/shots';
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = await chromium.executablePath();
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: [
    ...chromium.args,
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--window-size=1280,800',
  ],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[reqfail] ${r.url()} — ${r.failure()?.errorText}`));

console.log('navigating', URL);
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

// Confirm WebGL actually works (software path).
const glInfo = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return { ok: false };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return { ok: true, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a', version: gl.getParameter(gl.VERSION) };
});
console.log('WebGL:', JSON.stringify(glInfo));

await page.waitForFunction('window.__lpReady === true', { timeout: 30000 });

async function capture(name, mode, settleMs = 2500) {
  await page.evaluate((m) => window.__lp.setMode(m), mode);
  await sleep(400);
  await page.evaluate(() => window.__lp.look());
  await sleep(settleMs); // let the GLB load + a few frames render
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path });
  // also count person-ish dynamic objects via the harness? just report mean luminance.
  const stats = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    if (!cv) return null;
    const g = cv.getContext('webgl2') || cv.getContext('webgl');
    return { w: cv.width, h: cv.height, hasGL: !!g };
  });
  console.log('shot', name, JSON.stringify(stats));
  return path;
}

// Plain 3D, then photo, then heatmap, then photo+heatmap.
await capture('01-plain', { photo: false, heatmap: false });
await capture('02-photo', { photo: true, heatmap: false }, 4000);
await capture('03-heatmap', { photo: false, heatmap: true }, 3000);
await capture('04-photo-heatmap', { photo: true, heatmap: true }, 4000);

// Top-down heatmap to inspect the podium-top / floor drape unobstructed.
await page.evaluate(() => window.__lp.setMode({ photo: false, heatmap: true }));
await sleep(400);
await page.evaluate(() => window.__lp.lookAt({ x: 6, y: 6.4, height: 13, aimX: 6, aimY: 6.401, fov: 55 }));
await sleep(2500);
await page.screenshot({ path: `${OUT}/05-heatmap-top.png` });
console.log('shot 05-heatmap-top');

// Close-ups of the SITTING person (p2 at 7.4,6.6, facing −y) to check the pose.
await page.evaluate(() => window.__lp.setMode({ photo: true, heatmap: false }));
await sleep(500);
await page.evaluate(() => window.__lp.lookAt({ x: 7.4, y: 4.3, height: 1.0, aimX: 7.4, aimY: 6.6, fov: 38 }));
await sleep(3500);
await page.screenshot({ path: `${OUT}/06-sit-front.png` });
console.log('shot 06-sit-front');
await page.evaluate(() => window.__lp.lookAt({ x: 9.6, y: 6.6, height: 1.0, aimX: 7.4, aimY: 6.6, fov: 38 }));
await sleep(1500);
await page.screenshot({ path: `${OUT}/07-sit-side.png` });
console.log('shot 07-sit-side');

// ── Live lux readout test: dispatch pointermove over a few screen points in
//    heat-map mode and read back the value Scene3D reports via onHoverLux. ──
await page.evaluate(() => window.__lp.setMode({ photo: false, heatmap: true }));
await sleep(300);
await page.evaluate(() => window.__lp.lookAt({ x: 6, y: 6.4, height: 13, aimX: 6, aimY: 6.401, fov: 55 }));
await sleep(1500);
async function luxAt(px, py) {
  await page.evaluate(({ x, y }) => {
    const cv = document.querySelector('canvas');
    const r = cv.getBoundingClientRect();
    cv.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + x, clientY: r.top + y, bubbles: true }));
  }, { x: px, y: py });
  await sleep(120);
  return page.evaluate(() => window.__lpLux ?? null);
}
const cx = 640, cy = 400;
console.log('lux@center(floor/podium):', await luxAt(cx, cy));
console.log('lux@floor-edge:', await luxAt(cx, cy + 230));
console.log('lux@offstage(dark):', await luxAt(40, 60));

writeFileSync(`${OUT}/console.log`, logs.join('\n'));
console.log('\n--- page console (tail) ---');
console.log(logs.slice(-40).join('\n'));

await browser.close();
console.log('\nDONE → screenshots in', OUT);
