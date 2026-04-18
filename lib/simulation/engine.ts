// Engine-Kern: tick(state, rng) gemaess SIMULATION.md §3.
// In-place-Mutation aus Performance-Gruenden. Rein funktional ohne React.

import type { Patient, ResourceType, SimState } from '@/lib/types';
import { RESOURCE_TYPES } from '@/lib/data/resources';
import {
  allocateBatch,
  cumulativeArrival,
  spawnIncidentPatients,
} from './allocation';
import { seededRng } from './rng';
import {
  alertKeys,
  mergeAlertsWithDedup,
  resolveStaleAlerts,
  runAllRules,
} from './detection';
import { generateRecommendations, mergeRecommendations } from './recommendations';
import { effectiveTotal } from './router';
import { relocationStep } from './relocation';

// Feinere Timeline: 1 Sim-min pro History-Punkt → sichtbarer Verlauf auch
// bei kurzen MANV-Szenarien (15–60 Min).
const HISTORY_STRIDE = 1;
const HISTORY_CAPACITY = 1440; // 24 h bei 1-Min-Stride

function snapshot(state: SimState): SimState['occupancyHistory'][number] {
  const totals: Record<ResourceType, { total: number; occupied: number }> = {
    notaufnahme: { total: 0, occupied: 0 },
    op_saal: { total: 0, occupied: 0 },
    its_bett: { total: 0, occupied: 0 },
    normal_bett: { total: 0, occupied: 0 },
  };
  let critCount = 0;
  for (const h of Object.values(state.hospitals)) {
    let hostTot = 0;
    let hostOcc = 0;
    for (const r of RESOURCE_TYPES) {
      const cap = h.capacity[r];
      const eff = effectiveTotal(cap);
      totals[r].total += eff;
      totals[r].occupied += cap.occupied;
      hostTot += eff;
      hostOcc += cap.occupied;
    }
    if (hostTot > 0 && hostOcc / hostTot >= 0.95) critCount++;
  }
  const totalSum = RESOURCE_TYPES.reduce((s, r) => s + totals[r].total, 0);
  const occSum = RESOURCE_TYPES.reduce((s, r) => s + totals[r].occupied, 0);
  return {
    simTime: state.simTime,
    totals,
    overall: totalSum === 0 ? 0 : occSum / totalSum,
    critCount,
  };
}

function advanceTransport(state: SimState): void {
  for (const p of state.patients) {
    if (p.status === 'transport' && p.arrivedAt != null && state.simTime >= p.arrivedAt) {
      p.status = 'inTreatment';
    }
    if (
      p.status === 'transferring' &&
      p.arrivedAt != null &&
      state.simTime >= p.arrivedAt &&
      p.transferTargetHospitalId
    ) {
      // Bett in Zielklinik belegen (Primaer-Ressource beibehalten)
      const target = state.hospitals[p.transferTargetHospitalId];
      if (target) {
        for (const r of RESOURCE_TYPES) {
          if (p.needs[r]) {
            target.capacity[r].occupied += 1;
            break;
          }
        }
      }
      p.status = 'inTreatment';
      p.assignedHospitalId = p.transferTargetHospitalId;
      p.transferTargetHospitalId = undefined;
    }
  }
}

function releaseDischarged(state: SimState): void {
  for (const p of state.patients) {
    if (
      p.status === 'inTreatment' &&
      p.dischargeAt != null &&
      state.simTime >= p.dischargeAt
    ) {
      // Bett freigeben — primaer und begleitende Ressourcen
      const h = p.assignedHospitalId ? state.hospitals[p.assignedHospitalId] : undefined;
      if (h) {
        for (const r of RESOURCE_TYPES) {
          if (p.needs[r] && h.capacity[r].occupied > 0) {
            h.capacity[r].occupied -= 1;
          }
        }
      }
      p.status = 'discharged';
    }
  }
}

function updateStableFlags(state: SimState): void {
  for (const p of state.patients) {
    if (p.status !== 'inTreatment') {
      p.isStableForTransfer = false;
      continue;
    }
    const timeInTreatment =
      p.arrivedAt != null ? state.simTime - p.arrivedAt : 0;
    p.isStableForTransfer =
      (p.triage === 'T2' || p.triage === 'T3') &&
      timeInTreatment >= 60 &&
      !p.needs.op_saal;
  }
}

function pushOccupancy(state: SimState): void {
  if (state.simTime % HISTORY_STRIDE !== 0) return;
  state.occupancyHistory.push(snapshot(state));
  if (state.occupancyHistory.length > HISTORY_CAPACITY) {
    state.occupancyHistory.splice(0, state.occupancyHistory.length - HISTORY_CAPACITY);
  }
}

// Verarbeitet PlannedIntakes: Flug-Landungen spawnen Patienten am
// arrivalPoint, Status-Uebergaenge announced→arriving→complete. Laut
// SIMULATION.md §3.3 landen Fluege deterministisch bei etaMin.
function processPlannedIntakes(state: SimState): void {
  for (const intake of state.plannedIntakes) {
    if (intake.status === 'complete' || intake.status === 'cancelled') continue;

    // Automatische Status-Uebergaenge:
    // announced → arriving wenn firstArrivalAt erreicht (auch wenn nicht
    //   vorbereitet — Realitaet: die Fluege landen trotzdem).
    // preparing → arriving wenn firstArrivalAt erreicht.
    if (
      (intake.status === 'announced' || intake.status === 'preparing') &&
      state.simTime >= intake.firstArrivalAt
    ) {
      intake.status = 'arriving';
    }

    // Fuer alle Fluege, deren etaMin bereits erreicht ist und fuer die noch
    // nicht alle Patienten gespawnt wurden: spawne den Rest.
    let spawnedForIntake = state.patients.filter(
      (p) => p.sourceRefId === intake.id
    ).length;
    const totalSoFarTarget = intake.flights
      .filter((f) => state.simTime >= f.etaMin)
      .reduce((s, f) => s + f.patientCount, 0);
    const toSpawn = totalSoFarTarget - spawnedForIntake;
    if (toSpawn > 0) {
      // Needs-Profile und TriageMix des juengsten gelandeten Flugs nehmen.
      const lastFlight = [...intake.flights]
        .filter((f) => state.simTime >= f.etaMin)
        .pop();
      if (lastFlight) {
        const rng = seededRng(state.seed ^ intake.announcedAt ^ spawnedForIntake);
        const fresh = spawnIncidentPatients(
          intake.id,
          toSpawn,
          lastFlight.triageMix,
          lastFlight.needsProfile,
          state.simTime,
          rng,
          spawnedForIntake
        );
        // Markiere als planned-intake-Source statt incident.
        for (const p of fresh) {
          p.source = 'planned-intake';
        }
        state.patients.push(...fresh);
        spawnedForIntake += toSpawn;
      }
    }

    // Wenn alle erwarteten Patienten gespawnt sind UND keine mehr onScene →
    // status complete.
    if (
      intake.status === 'arriving' &&
      spawnedForIntake >= intake.totalPatients
    ) {
      const stillOnScene = state.patients.some(
        (p) => p.sourceRefId === intake.id && p.status === 'onScene'
      );
      if (!stillOnScene) intake.status = 'complete';
    }
  }
}

function spawnFromIncidents(state: SimState): void {
  for (const inc of state.incidents) {
    const tRel = state.simTime - inc.startedAt;
    if (tRel < 0) continue;
    const frac = cumulativeArrival(inc.arrivalCurve, tRel, inc.durationMin);
    const targetCount = Math.floor(frac * inc.estimatedCasualties);
    const currentCount = state.patients.filter(
      (p) => p.sourceRefId === inc.id
    ).length;
    const toSpawn = targetCount - currentCount;
    if (toSpawn <= 0) continue;
    const rng = seededRng(state.seed ^ inc.startedAt ^ currentCount);
    const fresh = spawnIncidentPatients(
      inc.id,
      toSpawn,
      inc.triageMix,
      inc.needsProfile,
      state.simTime,
      rng,
      currentCount
    );
    state.patients.push(...fresh);
  }
}

export function tick(state: SimState): SimState {
  state.simTime += 1;

  // Neue Patienten aus Incident-Curves und Flight-Landungen pro Tick.
  spawnFromIncidents(state);
  processPlannedIntakes(state);

  advanceTransport(state);

  // Allocation
  const assignedThisTick: Record<string, number> = {};
  allocateBatch(state.patients, {
    hospitals: state.hospitals,
    incidents: state.incidents.map((i) => ({ id: i.id, location: i.location })),
    intakes: state.plannedIntakes.map((i) => ({
      id: i.id,
      arrivalPoint: i.arrivalPoint,
    })),
    simTime: state.simTime,
    assignedThisTick,
  });

  releaseDischarged(state);
  updateStableFlags(state);

  // Relocation-Welle: aktive Intake im Status 'preparing' verlegt
  // stabile T2/T3 aus flughafennahen Kliniken in entferntere Haeuser.
  relocationStep(state);

  pushOccupancy(state);

  // Detection mit Dedup + Resolve.
  const raw = runAllRules(state);
  state.alerts = mergeAlertsWithDedup(state.alerts, raw, state.simTime);
  state.alerts = resolveStaleAlerts(state.alerts, alertKeys(raw), state.simTime);

  // Recommendations aus neuen Alerts.
  const newAlerts = raw.filter((a) =>
    state.alerts.some((e) => e.id === a.id)
  );
  const newRecs = generateRecommendations(state, newAlerts);
  state.recommendations = mergeRecommendations(state.recommendations, newRecs);

  return state;
}

// Helper fuer Test-Setups — baut einen Minimal-SimState.
export function emptySimState(seed = 42): SimState {
  return {
    simTime: 0,
    speed: 1,
    isRunning: false,
    seed,
    hospitals: {},
    patients: [],
    incidents: [],
    plannedIntakes: [],
    routes: {},
    alerts: [],
    recommendations: [],
    occupancyHistory: [],
    forkPreviewCache: {},
    filters: {
      bedThresholds: { min: 0, max: 1 },
      triage: { T1: true, T2: true, T3: true, T4: true },
    },
    events: [],
  };
}

// Re-export fuer Convenience.
export { allocateBatch, generateRecommendations };

// Unused-Patient-helper damit Linter nicht meckert wenn der Patient-Type nur
// als Typ verwendet wird.
export type { Patient };
