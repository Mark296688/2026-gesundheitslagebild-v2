import { describe, it, expect, beforeEach } from 'vitest';
import { routeId } from '@/lib/routing/route-id';
import { fallbackRoute, interpolate } from '@/lib/routing/fallback';
import { fetchRoute, resetCircuit } from '@/lib/routing/osrm-client';

beforeEach(() => {
  resetCircuit();
});

describe('routeId', () => {
  it('rundet auf 3 Dezimalstellen', () => {
    const a = routeId([11.5751, 48.1372], [11.7861, 48.3538]);
    const b = routeId([11.5753, 48.1371], [11.7859, 48.3541]);
    // Beide auf 3 Dezimalstellen → gleiche ID (Marienplatz ↔ MUC).
    expect(a).toBe(b);
  });

  it('liefert unterschiedliche IDs fuer weit entfernte Punkte', () => {
    const a = routeId([11.5, 48.1], [11.8, 48.4]);
    const b = routeId([12.0, 48.5], [12.5, 48.9]);
    expect(a).not.toBe(b);
  });

  it('Format: R-lng,lat-lng,lat', () => {
    const id = routeId([11.5, 48.1], [11.8, 48.4]);
    expect(id).toMatch(/^R-\d+\.\d{3},\d+\.\d{3}-\d+\.\d{3},\d+\.\d{3}$/);
  });
});

describe('interpolate', () => {
  it('liefert N Punkte inkl. Endpunkten', () => {
    const pts = interpolate([0, 0], [10, 10], 5);
    expect(pts).toHaveLength(5);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[4]).toEqual([10, 10]);
  });

  it('Zwischenpunkte sind linear interpoliert', () => {
    const pts = interpolate([0, 0], [10, 0], 3);
    expect(pts[1]).toEqual([5, 0]);
  });
});

describe('fallbackRoute', () => {
  it('liefert ~28 km fuer Marienplatz ↔ Flughafen MUC', () => {
    const r = fallbackRoute([11.5755, 48.1374], [11.7861, 48.3538]);
    expect(r.distanceM).toBeGreaterThan(27_000);
    expect(r.distanceM).toBeLessThan(30_000);
  });

  it('durationSec bei 50 km/h Fallback-Geschwindigkeit', () => {
    const r = fallbackRoute([11, 48], [12, 48]);
    const expectedSec = (r.distanceM / 1000 / 50) * 3600;
    expect(r.durationSec).toBeCloseTo(expectedSec, 0);
  });

  it('source ist "haversine-fallback"', () => {
    const r = fallbackRoute([11, 48], [12, 48]);
    expect(r.source).toBe('haversine-fallback');
  });

  it('polyline hat 20 Punkte gerade Linie', () => {
    const r = fallbackRoute([11, 48], [12, 48]);
    expect(r.polyline).toHaveLength(20);
  });
});

describe('fetchRoute (mit Mock-fetch)', () => {
  it('liefert OSRM-Route bei erfolgreicher Antwort', async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          code: 'Ok',
          routes: [
            {
              geometry: {
                type: 'LineString',
                coordinates: [
                  [11.5, 48.1],
                  [11.7, 48.3],
                  [11.78, 48.35],
                ],
              },
              duration: 1200,
              distance: 28_500,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    const r = await fetchRoute([11.5, 48.1], [11.78, 48.35], {
      fetchImpl: mockFetch as unknown as typeof fetch,
      rateLimited: false,
    });
    expect(r.source).toBe('osrm');
    expect(r.distanceM).toBe(28_500);
    expect(r.durationSec).toBe(1200);
    expect(r.polyline).toHaveLength(3);
  });

  it('Retry einmal bei 5xx', async () => {
    let calls = 0;
    const mockFetch = async () => {
      calls++;
      if (calls === 1) return new Response('nope', { status: 503 });
      return new Response(
        JSON.stringify({
          code: 'Ok',
          routes: [
            {
              geometry: { type: 'LineString', coordinates: [[11, 48], [12, 48]] },
              duration: 100,
              distance: 1000,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };
    const r = await fetchRoute([11, 48], [12, 48], {
      fetchImpl: mockFetch as unknown as typeof fetch,
      rateLimited: false,
    });
    expect(calls).toBe(2);
    expect(r.source).toBe('osrm');
  });

  it('kein Retry bei 4xx — wirft direkt', async () => {
    let calls = 0;
    const mockFetch = async () => {
      calls++;
      return new Response('bad', { status: 400 });
    };
    await expect(
      fetchRoute([11, 48], [12, 48], {
        fetchImpl: mockFetch as unknown as typeof fetch,
        rateLimited: false,
      })
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('Timeout via AbortController → Fehler', async () => {
    const mockFetch = ((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const sig = init?.signal;
        if (sig?.aborted) {
          reject(new Error('aborted'));
          return;
        }
        sig?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }) as unknown as typeof fetch;
    await expect(
      fetchRoute([11, 48], [12, 48], {
        fetchImpl: mockFetch,
        rateLimited: false,
        timeoutMs: 100,
      })
    ).rejects.toThrow();
  }, 10_000);
});
