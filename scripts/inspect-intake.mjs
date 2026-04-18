// Verifiziert dass PlannedIntake angekuendigt wird, in der Timeline als
// Prognose-Band + Marker sichtbar ist, und die Fluege tatsaechlich
// Patienten spawnen.
import { chromium } from '@playwright/test';

const URL = process.env.URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1920, height: 1080 } }).then((c) => c.newPage());

const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

// Intake mit kurzem Vorlauf (30 min) fuer schnellen Test.
await page.fill('[data-testid="intake-prep"]', '30');
await page.fill('[data-testid="intake-interval"]', '15');
await page.click('[data-testid="btn-announce-intake"]');
await page.waitForTimeout(500);

// Speed auf 10x
await page.selectOption('[data-testid="speed-select"]', '10');
await page.waitForTimeout(200);
await page.click('[data-testid="btn-play"]');

await page.screenshot({ path: 'scripts/_inspect-intake-0.png' });

// 6 Sekunden warten bei 10x = ~60 sim-min → 1. und 2. Flug sollten landen.
await page.waitForTimeout(6000);

const clock = await page.textContent('[data-testid="sim-clock"]');
console.log('Uhr nach 6 s real @ 10x:', clock);

await page.screenshot({ path: 'scripts/_inspect-intake-1.png' });

// Switch zu Auslastung-Tab damit Klinik-Belegung sichtbar ist
await page.click('[data-testid="tab-load"]');
await page.waitForTimeout(500);
await page.screenshot({ path: 'scripts/_inspect-intake-2.png' });

// Intake-Marker auf Timeline sollte sichtbar sein (in der SVG).
const intakeCircles = await page.$$eval('[data-testid="timeline-svg"] circle', (els) => els.length);
console.log('Event-Marker auf Timeline:', intakeCircles);

console.log('pageErrors:', errs.length);
for (const e of errs) console.log(' ', e);

await browser.close();
