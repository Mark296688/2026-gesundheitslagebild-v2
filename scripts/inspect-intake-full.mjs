// Vollstaendiger Intake-Flow: Ankuendigen → Relocation sichtbar (violett) →
// Fluege landen → Soldaten-Transport sichtbar (gruen).
import { chromium } from '@playwright/test';

const URL = process.env.URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1920, height: 1080 } }).then((c) => c.newPage());

const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

// Kurzer Vorlauf + kleine Intake-Zahl damit Relocation + Landing in Real-Zeit
// sichtbar sind.
await page.fill('[data-testid="intake-prep"]', '60');
await page.fill('[data-testid="intake-interval"]', '20');
await page.fill('[data-testid="intake-patients"]', '300');
await page.click('[data-testid="btn-announce-intake"]');
await page.waitForTimeout(400);

await page.selectOption('[data-testid="speed-select"]', '10');
await page.click('[data-testid="btn-play"]');

// Phase 1: Prepare/Relocation (erste ~30 Sim-min)
await page.waitForTimeout(3500);
const clock1 = await page.textContent('[data-testid="sim-clock"]');
await page.screenshot({ path: 'scripts/_intake-phase1-preparing.png' });
console.log(`Phase 1 (Relocation laueft) bei ${clock1?.trim()} → scripts/_intake-phase1-preparing.png`);

// Phase 2: erste Fluege landen, Soldaten-Transport sichtbar (~T+60–T+80)
await page.waitForTimeout(4000);
const clock2 = await page.textContent('[data-testid="sim-clock"]');
await page.screenshot({ path: 'scripts/_intake-phase2-arriving.png' });
console.log(`Phase 2 (Fluege landen) bei ${clock2?.trim()} → scripts/_intake-phase2-arriving.png`);

console.log('pageErrors:', errs.length);
for (const e of errs) console.log(' ', e);

await browser.close();
