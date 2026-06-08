// Confirms the new floor-finish UI in the real app: switch to Render mode,
// open the render-settings popover, and screenshot it.
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5174';
const OUT = '/tmp/uifloor';
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

const clickByText = (text) => page.evaluate((t) => {
  const el = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === t || b.textContent?.includes(t));
  if (el) { el.click(); return true; } return false;
}, text);
const clickByTitle = (t) => page.evaluate((title) => {
  const el = document.querySelector(`button[title*="${title}"]`);
  if (el) { el.click(); return true; } return false;
}, t);

console.log('Render mode:', await clickByText('Render'));
await sleep(2500);
console.log('open settings:', await clickByTitle('Render-Einstellungen'));
await sleep(600);
await page.screenshot({ path: `${OUT}/render-popover.png` });
console.log('shot render-popover');

// Pick the Parkett floor chip, then re-open to confirm selection + colour.
console.log('pick Parkett:', await clickByText('Parkett'));
await sleep(900);
await page.screenshot({ path: `${OUT}/after-parquet.png` });
console.log('shot after-parquet');

console.log('errors:', logs.slice(-12).join(' | ') || 'none');
await browser.close();
console.log('DONE →', OUT);
