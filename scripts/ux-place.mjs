// Places fixtures + a person properly, then screenshots the populated app and
// the selected-fixture property panel for the UX review.
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
await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(1200);

const armFixture = (name) => page.evaluate((n) => {
  const el = [...document.querySelectorAll('.fixture-item')].find((e) => e.textContent.includes(n));
  if (el) { el.click(); return true; } return false;
}, name);
const clickTool = (label) => page.evaluate((l) => {
  const el = [...document.querySelectorAll('.tool-label, button')].find((e) => e.textContent.trim() === l);
  if (el) { el.click(); return true; } return false;
}, label);

// Place three profile spots aimed across the plan.
const spots = [[780, 360], [680, 470], [900, 470]];
for (const [x, y] of spots) {
  await armFixture('Source Four 26');
  await sleep(150);
  await page.mouse.click(x, y);
  await sleep(200);
}
// A person.
await clickTool('Person');
await sleep(150);
await page.mouse.click(800, 560);
await sleep(300);

await page.screenshot({ path: `${OUT}/p1-placed-2d.png` });
console.log('placed; fixtures on canvas');

// Select the first fixture so the property panel populates, then clip it.
await clickTool('Auswahl');
await sleep(150);
await page.mouse.click(780, 360);
await sleep(400);
await page.screenshot({ path: `${OUT}/p2-selected.png` });
await page.screenshot({ path: `${OUT}/p3-propertypanel.png`, clip: { x: 1180, y: 75, width: 260, height: 820 } });

// Heatmap on.
await clickTool('Heatmap');
await sleep(700);
await page.screenshot({ path: `${OUT}/p4-heatmap2d.png` });

// 3D + live lux readout: hover the canvas centre, expect the "<n> lx" pill.
await clickTool('3D');
await sleep(2800);
await page.evaluate(() => {
  const cv = document.querySelector('canvas'); const r = cv.getBoundingClientRect();
  cv.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.62, bubbles: true }));
});
await sleep(400);
await page.screenshot({ path: `${OUT}/p5-3d-lux.png` });
const luxText = await page.evaluate(() => document.querySelector('.cursor-lux-display')?.textContent ?? 'NONE');
console.log('3D readout pill:', luxText);

console.log('DONE', OUT);
await browser.close();
