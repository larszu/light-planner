// Screenshots the REAL app (index.html) for a UX review. Drives a little UI to
// populate a scene, then captures 2D + 3D + a couple of panels.
// Setup: npm i --no-save puppeteer-core @sparticuz/chromium ; dev server on 5174.
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5174';
const OUT = '/tmp/ux';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  headless: true,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push('[err] ' + m.text()); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(1500);

const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };

// 1) Empty app (full chrome).
await shot('01-empty-2d');

// 2) Place a few fixtures: click library items (each click adds at a default
//    spot or arms placement). We click several library rows, then the canvas.
async function clickText(sel, text) {
  return page.evaluate(({ sel, text }) => {
    const els = [...document.querySelectorAll(sel)];
    const el = els.find((e) => e.textContent && e.textContent.includes(text));
    if (el) { el.click(); return true; }
    return false;
  }, { sel, text });
}

// Expand a couple library categories and click fixtures.
await clickText('*', 'Stufenlinsen');
await sleep(300);
// Click a specific fixture entry to arm/place it.
await clickText('*', 'KL Fresnel 8 FC');
await sleep(300);
// Click on the canvas to place (center-ish of the plan area).
await page.mouse.click(820, 460);
await sleep(200);
await page.mouse.click(700, 520);
await sleep(200);
await page.mouse.click(940, 520);
await sleep(300);
await shot('02-after-place');

// 3) Toggle heatmap on.
await clickText('button', 'Heatmap');
await sleep(600);
await shot('03-heatmap-2d');

// 4) Switch to 3D.
await clickText('button', '3D');
await sleep(2500);
await shot('04-3d');

// 5) Photo mode in 3D.
await clickText('button', 'Foto');
await sleep(3500);
await shot('05-3d-photo');

console.log('errors:', logs.slice(-20).join(' | ') || 'none');
await browser.close();
console.log('DONE →', OUT);
