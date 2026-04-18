// Facade: getRoute(from, to) liefert eine Route aus Cache, OSRM oder Fallback.
// Synchroner in-memory-Fallback, asynchroner Upgrade-Pfad fuer echte Strassen-
// Routen. ROUTING.md §3.3.

import type { Route } from '@/lib/types';
import type { LngLat } from '@/lib/geo';
import { routeId } from './route-id';
import { fallbackRoute } from './fallback';
import { fetchRoute, type FetchRouteOptions } from './osrm-client';
import {
  getCachedRoute,
  putCachedRoute,
  getMemRoute,
  putMemRoute,
} from './route-cache';

// Liefert synchron einen Fallback und startet asynchron ein Upgrade auf eine
// echte OSRM-Route. Das Callback `onUpgrade` wird nur bei erfolgreichem Upgrade
// aufgerufen (source === 'osrm').
export function getRouteSync(
  from: LngLat,
  to: LngLat,
  onUpgrade?: (route: Route) => void
): Route {
  const id = routeId(from, to);
  const mem = getMemRoute(id);
  if (mem) return mem;
  const fb = fallbackRoute(from, to);
  putMemRoute(fb);
  // Async upgrade
  (async () => {
    try {
      const db = await getCachedRoute(id);
      if (db && db.source === 'osrm') {
        putMemRoute(db);
        onUpgrade?.(db);
        return;
      }
      const real = await fetchRoute(from, to);
      putMemRoute(real);
      await putCachedRoute(real);
      onUpgrade?.(real);
    } catch {
      // Kein Upgrade → Fallback bleibt aktiv.
    }
  })();
  return fb;
}

// Rein asynchrone Variante (Cache → OSRM → Fallback).
export async function getRoute(
  from: LngLat,
  to: LngLat,
  opts?: FetchRouteOptions
): Promise<Route> {
  const id = routeId(from, to);
  const mem = getMemRoute(id);
  if (mem && mem.source === 'osrm') return mem;
  const db = await getCachedRoute(id);
  if (db && db.source === 'osrm') {
    putMemRoute(db);
    return db;
  }
  try {
    const real = await fetchRoute(from, to, opts);
    putMemRoute(real);
    await putCachedRoute(real);
    return real;
  } catch {
    const fb = fallbackRoute(from, to);
    putMemRoute(fb);
    // Fallback-Routen werden auch persistiert — sie sind valide, nur unpraeziser.
    await putCachedRoute(fb);
    return fb;
  }
}

export { routeId, fallbackRoute, fetchRoute };
