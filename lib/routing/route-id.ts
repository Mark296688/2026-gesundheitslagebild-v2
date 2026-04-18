// Stabile Route-ID: Koordinaten auf 3 Dezimalstellen runden (~100 m Granularität)
// fuer hohe Cache-Hit-Rate bei leicht abweichenden Startpunkten.

import type { LngLat } from '@/lib/geo';

export function routeId(from: LngLat, to: LngLat): string {
  const r = (n: number) => (Math.round(n * 1000) / 1000).toFixed(3);
  return `R-${r(from[0])},${r(from[1])}-${r(to[0])},${r(to[1])}`;
}
