import { describe, it, expect } from 'vitest';
import {
  SCENARIO_TEMPLATES,
  RANDOM_PLACES_MUC,
  INCIDENT_TYPE_COLOR,
  INCIDENT_TYPE_LABEL,
  getScenarioById,
  createIncidentFromScenario,
  perturb,
  markerDiameterPx,
} from '@/lib/simulation/scenarios';
import { seededRng } from '@/lib/simulation/rng';
import { haversine } from '@/lib/geo';

describe('SCENARIO_TEMPLATES', () => {
  it('enthaelt genau 5 Szenarien', () => {
    expect(SCENARIO_TEMPLATES).toHaveLength(5);
  });

  it('Amok-Innenstadt hat 35 Verletzte, immediate Curve', () => {
    const amok = getScenarioById('amok-innenstadt');
    expect(amok?.estimatedCasualties).toBe(35);
    expect(amok?.arrivalCurve).toBe('immediate');
  });

  it('S-Bahn-Ostbahnhof ist der Showcase-Kern mit 180 Verletzten', () => {
    const sbahn = getScenarioById('sbahn-ostbahnhof');
    expect(sbahn?.estimatedCasualties).toBe(180);
  });

  it('Fussball-Allianz hat 220 Verletzte, Panik, gauss', () => {
    const foot = getScenarioById('allianz-arena-panik');
    expect(foot?.estimatedCasualties).toBe(220);
    expect(foot?.type).toBe('panik');
    expect(foot?.arrivalCurve).toBe('gauss');
  });

  it('alle triageMix-Summen liegen bei 1.0', () => {
    for (const t of SCENARIO_TEMPLATES) {
      const sum = t.triageMix.T1 + t.triageMix.T2 + t.triageMix.T3 + t.triageMix.T4;
      expect(sum).toBeCloseTo(1, 6);
    }
  });

  it('alle needsProfile-Summen liegen bei 1.0', () => {
    for (const t of SCENARIO_TEMPLATES) {
      const sum =
        t.needsProfile.opShare +
        t.needsProfile.itsShare +
        t.needsProfile.notaufnahmeShare +
        t.needsProfile.normalBedShare;
      expect(sum).toBeCloseTo(1, 6);
    }
  });

  it('alle Locations liegen im Grossraum Muenchen', () => {
    for (const t of SCENARIO_TEMPLATES) {
      const [lng, lat] = t.location;
      expect(lng).toBeGreaterThan(10);
      expect(lng).toBeLessThan(13);
      expect(lat).toBeGreaterThan(47);
      expect(lat).toBeLessThan(49);
    }
  });

  it('INCIDENT_TYPE_COLOR hat Farbe fuer jeden Typ', () => {
    for (const t of SCENARIO_TEMPLATES) {
      expect(INCIDENT_TYPE_COLOR[t.type]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('INCIDENT_TYPE_LABEL liefert deutsche Labels', () => {
    for (const t of SCENARIO_TEMPLATES) {
      expect(INCIDENT_TYPE_LABEL[t.type].length).toBeGreaterThan(0);
    }
  });
});

describe('RANDOM_PLACES_MUC', () => {
  it('mind. 7 Orte vorhanden', () => {
    expect(RANDOM_PLACES_MUC.length).toBeGreaterThanOrEqual(7);
  });
  it('jeder Ort hat Koordinaten im Raum Muenchen', () => {
    for (const p of RANDOM_PLACES_MUC) {
      expect(p.coords[0]).toBeGreaterThan(10);
      expect(p.coords[0]).toBeLessThan(13);
      expect(p.coords[1]).toBeGreaterThan(47);
      expect(p.coords[1]).toBeLessThan(49);
    }
  });
});

describe('perturb', () => {
  it('verschiebt um 0.5-3 km', () => {
    const base: [number, number] = [11.5755, 48.1374];
    const rng = seededRng(1);
    for (let i = 0; i < 20; i++) {
      const moved = perturb(base, rng);
      const d = haversine(base, moved);
      expect(d).toBeGreaterThanOrEqual(0.5);
      expect(d).toBeLessThanOrEqual(3.0);
    }
  });

  it('ist deterministisch bei gleichem RNG-Seed', () => {
    const a = perturb([11.6, 48.1], seededRng(42));
    const b = perturb([11.6, 48.1], seededRng(42));
    expect(a).toEqual(b);
  });
});

describe('createIncidentFromScenario', () => {
  it('liefert null fuer unbekannte ID', () => {
    const inc = createIncidentFromScenario('unknown', 0, seededRng(1));
    expect(inc).toBeNull();
  });

  it('baut Incident mit richtiger ID (scenario-simTime)', () => {
    const inc = createIncidentFromScenario('amok-innenstadt', 42, seededRng(1));
    expect(inc?.id).toBe('amok-innenstadt-42');
    expect(inc?.startedAt).toBe(42);
  });

  it('ohne perturb ist Location identisch zum Template', () => {
    const inc = createIncidentFromScenario('amok-innenstadt', 0, seededRng(1));
    const tpl = getScenarioById('amok-innenstadt');
    expect(inc?.location).toEqual(tpl?.location);
  });

  it('mit perturb ist Location leicht verschoben (>0)', () => {
    const inc = createIncidentFromScenario('amok-innenstadt', 0, seededRng(1), {
      perturbLocation: true,
    });
    const tpl = getScenarioById('amok-innenstadt');
    expect(inc?.location).not.toEqual(tpl?.location);
    if (inc && tpl) {
      expect(haversine(inc.location, tpl.location)).toBeGreaterThan(0);
    }
  });
});

describe('markerDiameterPx', () => {
  it('35 Verletzte → ~26 px', () => {
    expect(markerDiameterPx(35)).toBeGreaterThanOrEqual(24);
    expect(markerDiameterPx(35)).toBeLessThanOrEqual(28);
  });
  it('180 Verletzte → ~48 px', () => {
    expect(markerDiameterPx(180)).toBeGreaterThanOrEqual(46);
    expect(markerDiameterPx(180)).toBeLessThanOrEqual(50);
  });
  it('220 Verletzte → ~53 px', () => {
    expect(markerDiameterPx(220)).toBeGreaterThanOrEqual(51);
    expect(markerDiameterPx(220)).toBeLessThanOrEqual(55);
  });
  it('monoton steigend', () => {
    expect(markerDiameterPx(10)).toBeLessThan(markerDiameterPx(100));
    expect(markerDiameterPx(100)).toBeLessThan(markerDiameterPx(500));
  });
});
