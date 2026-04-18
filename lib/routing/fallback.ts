import type { Route } from '@/lib/types';
import { haversine, type LngLat } from '@/lib/geo';
import { routeId } from './route-id';

// Interpoliert N zwischen from und to inklusive Endpunkten.
export function interpolate(from: LngLat, to: LngLat, n: number): LngLat[] {
  if (n < 2) return [from, to];
  const pts: LngLat[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
  }
  return pts;
}

// Haversine-Fallback laut ROUTING.md §4. 50 km/h Durchschnittstempo.
export function fallbackRoute(from: LngLat, to: LngLat): Route {
  const distKm = haversine(from, to);
  const distanceM = distKm * 1000;
  const durationSec = (distKm / 50) * 3600;
  return {
    id: routeId(from, to),
    from,
    to,
    polyline: interpolate(from, to, 20),
    durationSec,
    distanceM,
    computedAt: new Date().toISOString(),
    source: 'haversine-fallback',
  };
}
