// Phase-5-Gate aus PHASES.md:
// "Amok starten → 35 Marker-Zahl, Kliniken im Zentrum werden gelb/orange.
//  E2E-Test: Starte Amok, warte 20 Sim-Min, erwarte mindestens 3 Kliniken
//  mit > 80 % Auslastung."
//
// Umsetzung als Integration-Test auf Store-/Engine-Ebene. Playwright-E2E
// kommt wenn noetig in Phase 10 (Demo-Showcase).

import { describe, it, expect } from 'vitest';
import { getHospitals } from '@/lib/data/hospitalsLoader';
import { emptySimState, tick } from '@/lib/simulation/engine';
import {
  createIncidentFromScenario,
  getScenarioById,
} from '@/lib/simulation/scenarios';
import { spawnIncidentPatients } from '@/lib/simulation/allocation';
import { seededRng } from '@/lib/simulation/rng';
import { overallOccupancyRatio } from '@/lib/simulation/baseline';
import { haversine } from '@/lib/geo';
import type { ResourceType } from '@/lib/types';
import { RESOURCE_TYPES } from '@/lib/data/resources';

function buildInitialState(initialOccupancy = 0.5) {
  const state = emptySimState(20260418);
  const hospitals = getHospitals();
  for (const h of hospitals) {
    const caps = {} as Record<ResourceType, typeof h.capacity.normal_bett>;
    for (const r of RESOURCE_TYPES) {
      const src = h.capacity[r];
      caps[r] = { ...src, occupied: Math.round(src.total * initialOccupancy) };
    }
    state.hospitals[h.id] = { ...h, capacity: caps };
  }
  return state;
}

describe('Phase-5-Gate: Amok-Szenario', () => {
  it('S-Bahn-Ostbahnhof: 20 Sim-Min nach Start >= 3 Kliniken ueber 80 %', () => {
    // Baseline 0.7 entspricht dem Mid-Range der Spec (65–80 %).
    const state = buildInitialState(0.7);
    const scenario = getScenarioById('sbahn-ostbahnhof')!;
    const incident = createIncidentFromScenario('sbahn-ostbahnhof', 0, seededRng(1))!;
    state.incidents.push(incident);

    // Spawn aller Patienten bei simTime=0 (immediate-Curve: Engine wuerde sie
    // sukzessive erzeugen; fuer den Integration-Test reicht direkt-Spawn).
    const patients = spawnIncidentPatients(
      incident.id,
      incident.estimatedCasualties,
      incident.triageMix,
      incident.needsProfile,
      0,
      seededRng(2)
    );
    state.patients.push(...patients);

    // 20 Tick-Schritte.
    for (let i = 0; i < 20; i++) tick(state);

    const hospitalsNear = Object.values(state.hospitals).filter(
      (h) => haversine(incident.location, h.coords) <= 50
    );
    const heavilyLoaded = hospitalsNear.filter((h) => {
      const r = overallOccupancyRatio(h.capacity);
      return r > 0.8;
    });
    expect(heavilyLoaded.length).toBeGreaterThanOrEqual(3);
    expect(scenario.estimatedCasualties).toBe(180);
  });

  it('Parallel-Start: S-Bahn + Fussball erzeugen zwei Incidents', () => {
    const state = buildInitialState(0.5);
    const inc1 = createIncidentFromScenario('sbahn-ostbahnhof', 0, seededRng(1))!;
    const inc2 = createIncidentFromScenario('allianz-arena-panik', 0, seededRng(2), { perturbLocation: true })!;
    state.incidents.push(inc1, inc2);
    expect(state.incidents).toHaveLength(2);
    expect(inc1.location).not.toEqual(inc2.location);
    const dist = haversine(inc1.location, inc2.location);
    expect(dist).toBeGreaterThan(5); // deutlich unterschiedliche Orte
  });
});
