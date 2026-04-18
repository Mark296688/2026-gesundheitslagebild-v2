import { chromium } from '@playwright/test';

const URL = process.env.URL ?? 'http://localhost:3005';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();

const events = [];
const errors = [];
const pageErrs = [];

page.on('console', (msg) => {
  const t = msg.type();
  if (t === 'error' || t === 'warning') {
    errors.push({ t, text: msg.text() });
  }
  events.push({ t, text: msg.text().slice(0, 200) });
});
page.on('pageerror', (err) => pageErrs.push(String(err)));
page.on('requestfailed', (req) =>
  errors.push({ t: 'netfail', text: `${req.url()} ${req.failure()?.errorText}` })
);

const step = async (name, fn) => {
  console.log(`\n=== ${name} ===`);
  const before = errors.length;
  await fn();
  await page.waitForTimeout(1500);
  const newErrs = errors.slice(before);
  if (newErrs.length) {
    console.log(`  Errors (${newErrs.length}):`);
    for (const e of newErrs) console.log(`    [${e.t}] ${e.text.slice(0, 300)}`);
  } else {
    console.log('  keine neuen Errors');
  }
  const fname = `scripts/_inspect-${name.replace(/\s/g, '-')}.png`;
  await page.screenshot({ path: fname });
  console.log(`  → ${fname}`);
};

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

await step('00-load', async () => {});

await step('10-launch-amok', async () => {
  await page.click('[data-testid="btn-launch-incident"]');
});

await step('20-play', async () => {
  await page.click('[data-testid="btn-play"]');
});

await step('30-wait-sim', async () => {
  await page.waitForTimeout(4000);
});

await step('40-tab-recs', async () => {
  await page.click('[data-testid="tab-recs"]');
});

await step('50-hover-rec', async () => {
  const rec = await page.$('[data-testid="recommendation-card"]');
  if (rec) {
    await rec.hover();
  } else {
    console.log('  (keine Recommendation vorhanden — skip)');
  }
});

await step('60-click-hospital-on-map', async () => {
  // Simuliere Klick auf Kliniken-Layer — MapLibre expects canvas click at lng/lat.
  // Einfacher: tab-hospital direkt (auch wenn disabled); oder hit-test in der Mitte.
  const canvas = await page.$('.maplibregl-canvas');
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
});

await step('70-pause', async () => {
  const pauseBtn = await page.$('[data-testid="btn-pause"]');
  if (pauseBtn) await pauseBtn.click();
});

await step('80-showcase', async () => {
  await page.click('[data-testid="btn-showcase"]');
  await page.waitForTimeout(3000);
});

console.log('\n=== GESAMT ===');
console.log(`console errors/warnings: ${errors.length}`);
console.log(`pageErrors: ${pageErrs.length}`);
for (const e of pageErrs) console.log('  PAGEERROR:', e);

// Alle eindeutigen Fehler-Meldungen am Ende.
const uniq = new Map();
for (const e of errors) {
  const k = `${e.t}|${e.text.slice(0, 160)}`;
  uniq.set(k, (uniq.get(k) ?? 0) + 1);
}
console.log('\nuniq errors:');
for (const [k, c] of [...uniq.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  [×${c}] ${k.slice(0, 220)}`);
}

await browser.close();
