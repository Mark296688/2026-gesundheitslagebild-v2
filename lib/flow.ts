// Patienten-Fluss-Visualisierung ohne OSRM.
// Eine sanft gebogene Bezier-Kurve von Start zu Ziel + Positions-Interpolation
// entlang der Kurve. Keine externe Netzwerk-Abhaengigkeit.

import { haversine, type LngLat } from '@/lib/geo';

const DEFAULT_SEGMENTS = 24;
const BEND_FRACTION = 0.12; // 12 % der Distanz als Seitenversatz fuer die Kruemmung
const TRANSPORT_AVG_KMH = 55;
const HANDOVER_MIN = 2;

// Quadratischer Bezier zwischen two points mit Kontrollpunkt senkrecht
// zur Verbindung — gibt der Linie eine leichte Biegung und macht sie
// bei mehreren parallelen Fluessen unterscheidbar.
function controlPoint(from: LngLat, to: LngLat): LngLat {
  const midLng = (from[0] + to[0]) / 2;
  const midLat = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  // Senkrechter Einheitsvektor (links herum).
  const len = Math.hypot(dx, dy);
  if (len === 0) return [midLng, midLat];
  const nx = -dy / len;
  const ny = dx / len;
  const bend = len * BEND_FRACTION;
  return [midLng + nx * bend, midLat + ny * bend];
}

function bezier(a: LngLat, c: LngLat, b: LngLat, t: number): LngLat {
  const u = 1 - t;
  return [
    u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
    u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
  ];
}

// Polyline entlang der Bezier-Kurve. Default 24 Segmente → glatte Kurve.
export function flowPath(
  from: LngLat,
  to: LngLat,
  segments: number = DEFAULT_SEGMENTS
): LngLat[] {
  const c = controlPoint(from, to);
  const n = Math.max(2, segments);
  const out: LngLat[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push(bezier(from, c, to, t));
  }
  return out;
}

// Position zu einem Fortschritt [0..1] entlang der Bezier-Kurve.
export function flowPosition(from: LngLat, to: LngLat, progress: number): LngLat {
  const t = Math.max(0, Math.min(1, progress));
  const c = controlPoint(from, to);
  return bezier(from, c, to, t);
}

// Schaetzt die Fluss-Dauer (Sim-Minuten) aus der Haversine-Distanz.
export function flowDurationMin(
  from: LngLat,
  to: LngLat,
  avgKmh: number = TRANSPORT_AVG_KMH,
  handoverMin: number = HANDOVER_MIN
): number {
  const distKm = haversine(from, to);
  return (distKm / avgKmh) * 60 + handoverMin;
}
