import type { Route } from '@/lib/types';
import type { LngLat } from '@/lib/geo';
import { routeId } from './route-id';

const DEFAULT_TIMEOUT_MS = 8000;
const RATE_LIMIT_MIN_INTERVAL_MS = 500; // max 2 Req/s
const DEFAULT_BASE_URL =
  process.env.NEXT_PUBLIC_OSRM_URL ?? 'https://router.project-osrm.org';

let lastCallAt = 0;
async function rateLimit(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, lastCallAt + RATE_LIMIT_MIN_INTERVAL_MS - now);
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastCallAt = Date.now();
}

interface OSRMResponse {
  code: string;
  routes?: Array<{
    geometry: { coordinates: [number, number][]; type: 'LineString' };
    duration: number;
    distance: number;
  }>;
}

export interface FetchRouteOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  baseUrl?: string;
  // Testhook — erlaubt fetch-Mock ohne monkey-patching.
  fetchImpl?: typeof fetch;
  // Testhook — deaktiviert Rate-Limit bei Unit-Tests.
  rateLimited?: boolean;
}

export async function fetchRoute(
  from: LngLat,
  to: LngLat,
  opts: FetchRouteOptions = {}
): Promise<Route> {
  if (opts.rateLimited !== false) await rateLimit();
  const base = opts.baseUrl ?? DEFAULT_BASE_URL;
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchFn = opts.fetchImpl ?? fetch;

  const url =
    `${base}/route/v1/driving/` +
    `${from[0]},${from[1]};${to[0]},${to[1]}` +
    `?overview=full&geometries=geojson&steps=false`;

  const ac = new AbortController();
  const abortRelay = () => ac.abort();
  if (opts.signal) opts.signal.addEventListener('abort', abortRelay);
  const timer = setTimeout(() => ac.abort(), timeout);

  const tryOnce = async (): Promise<OSRMResponse> => {
    const res = await fetchFn(url, { signal: ac.signal });
    if (!res.ok) {
      const err = new Error(`OSRM ${res.status}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    return (await res.json()) as OSRMResponse;
  };

  try {
    let data: OSRMResponse;
    try {
      data = await tryOnce();
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      // Retry einmal bei 5xx oder Network-Error; nicht bei 4xx.
      if (status != null && status >= 400 && status < 500) throw err;
      data = await tryOnce();
    }
    const route = data.routes?.[0];
    if (!route || data.code !== 'Ok') {
      throw new Error(`OSRM code ${data.code}`);
    }
    return {
      id: routeId(from, to),
      from,
      to,
      polyline: route.geometry.coordinates,
      durationSec: route.duration,
      distanceM: route.distance,
      computedAt: new Date().toISOString(),
      source: 'osrm',
    };
  } finally {
    clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener('abort', abortRelay);
  }
}
