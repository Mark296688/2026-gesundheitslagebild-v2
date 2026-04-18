import { chromium } from '@playwright/test';

const URL = process.env.URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1920, height: 1080 } }).then((c) => c.newPage());

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

await page.click('[data-testid="btn-launch-incident"]');
await page.waitForTimeout(300);
await page.click('[data-testid="btn-play"]');

// Warte bis Peak des Transports — ca T+6 bis T+10.
await page.waitForTimeout(7000);
await page.screenshot({ path: 'scripts/_inspect-peak-load.png' });
console.log('Peak screenshot → scripts/_inspect-peak-load.png');

// Dann zum Auslastungs-Tab wechseln
await page.click('[data-testid="tab-load"]');
await page.waitForTimeout(500);
await page.screenshot({ path: 'scripts/_inspect-peak-load-tab.png' });
console.log('Load-Tab → scripts/_inspect-peak-load-tab.png');

await browser.close();
