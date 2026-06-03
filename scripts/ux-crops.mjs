// Captures readable region crops of the app UI for a detailed UX review.
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
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(1200);

const clip = async (name, x, y, w, h) => { await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x, y, width: w, height: h } }); console.log('clip', name); };

// Top chrome (menu + toolbar rows) in two halves for legibility.
await clip('c-toolbarL', 0, 0, 720, 120);
await clip('c-toolbarR', 720, 0, 720, 120);
// Left fixture library.
await clip('c-sidebar', 0, 120, 250, 780);
// Right panels (Szenen + Eigenschaften).
await clip('c-rightpanel', 1180, 75, 260, 820);
// Floating Ebenen (layers) panel.
await clip('c-layers', 285, 545, 430, 350);

await browser.close();
console.log('DONE', OUT);
