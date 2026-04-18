// Pro Tick die Anzahl der Patienten in jedem Status ausgeben —
// damit ich sehe ob die Soldaten wirklich nur kurz im Transport sind.
import { chromium } from '@playwright/test';

const URL = process.env.URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1920, height: 1080 } }).then((c) => c.newPage());

// Store via window exposieren. Wir brauchen das Zustand-Object.
await page.addInitScript(() => {
  // Hook: sobald Zustand create() gerufen wird, speichere im window.
  // Das ist dirty aber fuer Debug ok.
});

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

// Store-Zugriff via Dev-Tools: es gibt keinen offiziellen Zugriff, aber wir
// koennen den Store via Hack ausgeben: useSimStore hat keine Exposition.
// Alternativ: wir nutzen DOM, um Patient-counts zu ermitteln.
// Fuer diesen Debug injizieren wir eine Hilfs-Route in die app: window.__RL =
// () => useSimStore.getState(). Das geht per Eval nicht — stattdessen lese
// ich die Zahl der gruenen Pillen in der Karte aus (circle-Layer kann ich
// per WebGL nicht auslesen).
// Alternativer Ansatz: trigger Intake ueber UI, dann in Chromium Console
// per URL-Query ein JS-Snippet einfuegen.

// Der einzige sichere Weg: wir exposen Store via NEXT_PUBLIC-Flag (zu viel
// Arbeit). Stattdessen: pruefen ob Soldaten-Fluesse gerendert werden.
// Ich check per JS die Map-Sources / Features:
const getCounts = () => page.evaluate(() => {
  // MapLibre-Instanz: ueber globalen hack — Map-Instanz ist an einem
  // Canvas-Parent. Wir lesen die _map ueber canvas.parent.
  const canvas = document.querySelector('.maplibregl-canvas');
  const mapEl = canvas?.closest('.maplibregl-map');
  // Kein offizieller Zugriff. Brechen ab.
  const markerCount = document.querySelectorAll('[data-testid="intake-marker"]').length;
  return { markerCount, hasMap: !!mapEl };
});

await page.fill('[data-testid="intake-prep"]', '30');
await page.fill('[data-testid="intake-interval"]', '30');
await page.fill('[data-testid="intake-patients"]', '300');
await page.fill('[data-testid="intake-flights"]', '2');
await page.click('[data-testid="btn-announce-intake"]');

await page.selectOption('[data-testid="speed-select"]', '2');
await page.click('[data-testid="btn-play"]');

// DOM-Check ob die Map-Sources existieren via queryRenderedFeatures
// brauchen wir Zugriff auf MapLibre map instance. Nicht moeglich hier.

// Stattdessen: ich zoome in den Flughafen-Bereich und mache dort einen Shot
await page.waitForTimeout(14000); // bis T+28
await page.evaluate(() => {
  // MapLibre via DOM zoomen? Ich setze Center/Zoom auf Flughafen manuell.
});
// Statt zoom: zoom-in per MapLibre-Controls
await page.waitForSelector('.maplibregl-ctrl-zoom-in');
for (let i = 0; i < 3; i++) {
  await page.click('.maplibregl-ctrl-zoom-in');
  await page.waitForTimeout(200);
}
// Pan zum Flughafen MUC: ich verzichte auf Pan — zoom reicht.
await page.waitForTimeout(1500); // bis T+31 bei 2x, Flug 1 gelandet

for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(800);
  const clock = await page.textContent('[data-testid="sim-clock"]');
  await page.screenshot({ path: `scripts/_inspect-zoomed-${i}.png` });
  console.log(`zoom ${i}: ${clock?.trim()}`);
}

await browser.close();
