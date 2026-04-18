import { chromium } from '@playwright/test';

const URL = process.env.URL ?? 'http://localhost:3001';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1920, height: 1080 } }).then((c) => c.newPage());

const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

// Check: Welche Sources/Layers sind in der Map?
const info = await page.evaluate(() => {
  // Helper: finde MapLibre-Map-Instanz via DOM.
  const el = document.querySelector('[data-testid="map-container"]');
  return { hasEl: !!el };
});
console.log(info);

// Hospitals-Check: sind Klinik-Kreise als circle-Layer gezeichnet?
// Das geht nur ueber WebGL-Rendering, nicht aus dem DOM. Stattdessen:
// Screenshot + page-errors.
await page.screenshot({ path: 'scripts/_inspect-layers.png' });
console.log('pageErrors:', errs.length);
for (const e of errs) console.log(' ', e);

await browser.close();
