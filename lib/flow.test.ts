import { describe, it, expect } from 'vitest';
import { flowPath, flowPosition, flowDurationMin } from './flow';
import { haversine, FLUGHAFEN_MUC_COORDS, MARIENPLATZ_COORDS } from './geo';

describe('flowPath', () => {
  it('startet bei from und endet bei to', () => {
    const poly = flowPath([11, 48], [12, 48.5], 20);
    expect(poly[0]).toEqual([11, 48]);
    expect(poly[poly.length - 1]).toEqual([12, 48.5]);
  });

  it('liefert N Segmente (default 24)', () => {
    const poly = flowPath([11, 48], [12, 48.5]);
    expect(poly.length).toBe(24);
  });

  it('Zwischenpunkt weicht von der Luftlinie ab (Bezier-Biegung)', () => {
    const from: [number, number] = [11, 48];
    const to: [number, number] = [12, 48];
    const poly = flowPath(from, to, 9);
    const mid = poly[4];
    // Luftlinien-Mittelpunkt waere [11.5, 48]. Bezier biegt senkrecht
    // zur Verbindung — lat sollte != 48.
    expect(mid[0]).toBeCloseTo(11.5, 2);
    expect(Math.abs(mid[1] - 48)).toBeGreaterThan(0.01);
  });
});

describe('flowPosition', () => {
  it('progress 0 entspricht from', () => {
    expect(flowPosition([11, 48], [12, 49], 0)).toEqual([11, 48]);
  });

  it('progress 1 entspricht to', () => {
    expect(flowPosition([11, 48], [12, 49], 1)).toEqual([12, 49]);
  });

  it('progress 0.5 liegt in der Naehe der Luftlinien-Mitte', () => {
    const mid = flowPosition([11, 48], [12, 48], 0.5);
    expect(mid[0]).toBeCloseTo(11.5, 2);
  });

  it('progress < 0 geklemmt auf 0, > 1 auf 1', () => {
    expect(flowPosition([11, 48], [12, 49], -0.5)).toEqual([11, 48]);
    expect(flowPosition([11, 48], [12, 49], 1.5)).toEqual([12, 49]);
  });
});

describe('flowDurationMin', () => {
  it('55 km/h default + 2 min Handover → ~33 min fuer Marienplatz↔MUC', () => {
    const d = flowDurationMin(MARIENPLATZ_COORDS, FLUGHAFEN_MUC_COORDS);
    // ~28 km / 55 * 60 + 2 ≈ 30.5 + 2 = 32.5 min
    expect(d).toBeGreaterThan(30);
    expect(d).toBeLessThan(36);
  });

  it('konsistent mit haversine', () => {
    const from: [number, number] = [11, 48];
    const to: [number, number] = [12, 48];
    const d = flowDurationMin(from, to, 60, 0);
    const distKm = haversine(from, to);
    expect(d).toBeCloseTo((distKm / 60) * 60, 4);
  });

  it('schneller bei hoeherer Durchschnittsgeschwindigkeit', () => {
    const a = flowDurationMin([11, 48], [12, 49], 50);
    const b = flowDurationMin([11, 48], [12, 49], 100);
    expect(b).toBeLessThan(a);
  });
});
