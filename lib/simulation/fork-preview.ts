// Fork-Preview: klont einen SimState, wendet eine Maßnahme an und simuliert
// N Minuten weiter. Liefert Kurven-Diff fuer Timeline-Overlay.
// SIMULATION.md §8.

import type {
  ForkPreviewResult,
  Recommendation,
  ResourceType,
  SimState,
  TimelinePoint,
} from '@/lib/types';
import { RESOURCE_TYPES } from '@/lib/data/resources';
import { tick } from './engine';
import { applyMeasureToState } from './measures';
import { effectiveTotal } from './router';

export type { ForkPreviewResult, TimelinePoint };

function snapshot(state: SimState): TimelinePoint {
  const totals: Record<ResourceType, { tot: number; occ: number }> = {
    notaufnahme: { tot: 0, occ: 0 },
    op_saal: { tot: 0, occ: 0 },
    its_bett: { tot: 0, occ: 0 },
    normal_bett: { tot: 0, occ: 0 },
  };
  for (const h of Object.values(state.hospitals)) {
    for (const r of RESOURCE_TYPES) {
      totals[r].tot += effectiveTotal(h.capacity[r]);
      totals[r].occ += h.capacity[r].occupied;
    }
  }
  const totSum = RESOURCE_TYPES.reduce((s, r) => s + totals[r].tot, 0);
  const occSum = RESOURCE_TYPES.reduce((s, r) => s + totals[r].occ, 0);
  return {
    simTime: state.simTime,
    overall: totSum === 0 ? 0 : occSum / totSum,
    notaufnahme: totals.notaufnahme.tot === 0 ? 0 : totals.notaufnahme.occ / totals.notaufnahme.tot,
    op_saal: totals.op_saal.tot === 0 ? 0 : totals.op_saal.occ / totals.op_saal.tot,
    its_bett: totals.its_bett.tot === 0 ? 0 : totals.its_bett.occ / totals.its_bett.tot,
    normal_bett: totals.normal_bett.tot === 0 ? 0 : totals.normal_bett.occ / totals.normal_bett.tot,
  };
}

// Klont nur die Teile die fuer die Simulation relevant sind. Events/Routes
// uebernehmen wir als-is (read-only waehrend Preview).
function cloneForFork(state: SimState): SimState {
  return {
    simTime: state.simTime,
    speed: state.speed,
    isRunning: false,
    seed: state.seed ^ 0xbad,
    hospitals: Object.fromEntries(
      Object.entries(state.hospitals).map(([id, h]) => [
        id,
        {
          ...h,
          capacity: {
            notaufnahme: { ...h.capacity.notaufnahme },
            op_saal: { ...h.capacity.op_saal },
            its_bett: { ...h.capacity.its_bett },
            normal_bett: { ...h.capacity.normal_bett },
          },
          staff: { ...h.staff },
        },
      ])
    ),
    patients: state.patients.map((p) => ({ ...p, needs: { ...p.needs } })),
    incidents: state.incidents.map((i) => ({ ...i })),
    plannedIntakes: state.plannedIntakes.map((i) => ({ ...i })),
    routes: {},
    alerts: [],
    recommendations: [],
    occupancyHistory: [],
    forkPreviewCache: {},
    filters: { ...state.filters },
  };
}

export function computeForkPreview(
  baseState: SimState,
  rec: Recommendation,
  horizonMin = 240
): ForkPreviewResult {
  const A = cloneForFork(baseState);
  const B = cloneForFork(baseState);
  applyMeasureToState(B, rec);

  const curveA: TimelinePoint[] = [snapshot(A)];
  const curveB: TimelinePoint[] = [snapshot(B)];

  for (let m = 1; m <= horizonMin; m++) {
    tick(A);
    tick(B);
    if (m % 5 === 0 || m === horizonMin) {
      curveA.push(snapshot(A));
      curveB.push(snapshot(B));
    }
  }

  let peakA = 0;
  let peakB = 0;
  let critA = 0;
  let critB = 0;
  for (const p of curveA) {
    if (p.overall > peakA) peakA = p.overall;
    if (p.overall >= 0.95) critA++;
  }
  for (const p of curveB) {
    if (p.overall > peakB) peakB = p.overall;
    if (p.overall >= 0.95) critB++;
  }
  const peakLoadDelta = Math.round((peakB - peakA) * 1000) / 10; // pp
  // Betten-Delta: am Ende der Preview.
  const lastA = curveA[curveA.length - 1];
  const lastB = curveB[curveB.length - 1];
  const bedsFreedDelta = Math.round((lastA.overall - lastB.overall) * 10000) / 10; // scaled

  return {
    recommendationId: rec.id,
    computedAt: baseState.simTime,
    horizonMin,
    curveWithout: curveA,
    curveWith: curveB,
    diff: {
      peakLoadDelta,
      critCountDelta: critB - critA,
      bedsFreedDelta,
    },
  };
}
