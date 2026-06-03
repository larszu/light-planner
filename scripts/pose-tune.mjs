// Drives the pose harness to screenshot candidate sitting poses into /tmp/pose.
// Setup: npm i --no-save puppeteer-core @sparticuz/chromium ; dev server on 5174.
// Run:   node scripts/pose-tune.mjs http://localhost:5174
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5174';
const OUT = '/tmp/pose';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Sit candidates for BOTH legs (mirror z-splay). +X UpLeg = hip flexion forward;
// +X Leg (in the forward-thigh frame) should drop the shin down.
const L = (up, leg, foot = 0) => ({
  LeftUpLeg: [up, 0, 0.1], LeftLeg: [leg], LeftFoot: [foot],
  RightUpLeg: [up, 0, -0.1], RightLeg: [leg], RightFoot: [foot],
});
const POSES = [
  { name: 'sitFinal', map: {
    LeftUpLeg: [1.5, 0, 0.1], RightUpLeg: [1.5, 0, -0.1],
    LeftLeg: [1.5], RightLeg: [1.5],
    LeftFoot: [0.15], RightFoot: [0.15],
    Spine: [0.08],
    LeftArm: [0.35], RightArm: [0.35],
  } },
  { name: 'sitFinal2', map: {
    LeftUpLeg: [1.45, 0, 0.12], RightUpLeg: [1.45, 0, -0.12],
    LeftLeg: [1.55], RightLeg: [1.55],
    LeftFoot: [0.2], RightFoot: [0.2],
    Spine: [0.06], Spine1: [0.04],
    LeftArm: [0.45, 0, 0.1], RightArm: [0.45, 0, -0.1],
  } },
];

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  headless: true,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  defaultViewport: { width: 720, height: 900, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/pose-harness.html`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction('window.__poseReady === true', { timeout: 30000 });
console.log('bones:', (await page.evaluate(() => window.__pose.bones())).join(', '));

for (const p of POSES) {
  await page.evaluate((m) => window.__pose.set(m), p.map);
  await page.evaluate(() => window.__pose.view(0, 0.9, 3.2, 0, 0.55, 0)); // front
  await sleep(500);
  await page.screenshot({ path: `${OUT}/${p.name}-front.png` });
  await page.evaluate(() => window.__pose.view(3.2, 0.9, 0.01, 0, 0.55, 0)); // side
  await sleep(400);
  await page.screenshot({ path: `${OUT}/${p.name}-side.png` });
  console.log('posed', p.name);
}
await browser.close();
console.log('DONE →', OUT);
