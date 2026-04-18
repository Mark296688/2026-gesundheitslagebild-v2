// Screenshot im Peak des Transport-Flows + Flow-Feature-Count.
import { chromium } from '@playwright/test';

const URL = process.env.URL ?? 'http://localhost:4000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.click('[data-testid="btn-launch-incident"]');
await page.waitForTimeout(300);
await page.click('[data-testid="btn-play"]');

// Samples: nach wie vielen Sekunden wollen wir Screenshots?
const targets = [2, 4, 6, 8, 10, 12];
let prev = 0;
for (const t of targets) {
  await page.waitForTimeout((t - prev) * 1000);
  prev = t;
  const clock = await page.textContent('[data-testid="sim-clock"]');
  const marker = await page.$('[data-testid="incident-marker"]');
  const markerText = marker ? await marker.textContent() : null;
  // Anzahl der LineString-Features + Point-Features in den Route-Sources
  // koennen wir nicht direkt aus dem DOM lesen (sind in MapLibre-Source).
  // Aber aus den Map-Debug-Infos holen via page.evaluate:
  const counts = await page.evaluate(() => {
    const w = window;
    const map = w.__RL_MAP__ ?? null;
    return map ? null : null; // MapLibre-Instanz ist nicht als global verfuegbar
  });
  const file = `scripts/_inspect-flow-t${t}.png`;
  await page.screenshot({ path: file });
  console.log(`T+${clock?.trim()} marker="${markerText}" → ${file}`);
}

await browser.close();
