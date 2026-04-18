'use client';

import { create } from 'zustand';
import type {
  Hospital,
  Incident,
  PlannedIntake,
  Recommendation,
  SimState,
} from '@/lib/types';
import { getHospitals } from '@/lib/data/hospitalsLoader';
import { baselineCapacity } from '@/lib/simulation/baseline';
import { tick } from '@/lib/simulation/engine';
import { spawnIncidentPatients } from '@/lib/simulation/allocation';
import { seededRng } from '@/lib/simulation/rng';

const DEFAULT_SEED = 42;

type Store = SimState & {
  tick: () => void;
  pause: () => void;
  resume: () => void;
  setSpeed: (speed: number) => void;
  reset: () => void;
  launchIncident: (incident: Omit<Incident, 'startedAt'>) => void;
  launchPlannedIntake: (intake: PlannedIntake) => void;
  executeRecommendation: (recommendationId: string) => void;
};

function initialState(seed = DEFAULT_SEED): SimState {
  const hospitalsArr = getHospitals();
  const hospitals: Record<string, Hospital> = {};
  for (const h of hospitalsArr) {
    hospitals[h.id] = { ...h, capacity: baselineCapacity(h, seed) };
  }
  return {
    simTime: 0,
    speed: 1,
    isRunning: false,
    seed,
    hospitals,
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
  };
}

let tickHandle: ReturnType<typeof setInterval> | null = null;

function scheduleTickLoop(getSpeed: () => number, doTick: () => void) {
  if (tickHandle) clearInterval(tickHandle);
  const intervalMs = Math.max(50, Math.round(1000 / getSpeed()));
  tickHandle = setInterval(doTick, intervalMs);
}

function clearTickLoop() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = null;
}

export const useSimStore = create<Store>((set, get) => ({
  ...initialState(),

  tick: () => {
    const s = get();
    const next = tick({ ...s, hospitals: { ...s.hospitals } });
    set({ ...next });
  },

  pause: () => {
    clearTickLoop();
    set({ isRunning: false });
  },

  resume: () => {
    if (get().isRunning) return;
    set({ isRunning: true });
    scheduleTickLoop(() => get().speed, () => get().tick());
  },

  setSpeed: (speed) => {
    set({ speed });
    if (get().isRunning) {
      scheduleTickLoop(() => get().speed, () => get().tick());
    }
  },

  reset: () => {
    clearTickLoop();
    set({ ...initialState(get().seed) });
  },

  launchIncident: (incidentPartial) => {
    const s = get();
    const rng = seededRng(s.seed ^ s.simTime);
    const incident: Incident = {
      ...incidentPartial,
      startedAt: s.simTime,
    };
    const patients = spawnIncidentPatients(
      incident.id,
      incident.estimatedCasualties,
      incident.triageMix,
      incident.needsProfile,
      s.simTime,
      rng
    );
    set({
      incidents: [...s.incidents, incident],
      patients: [...s.patients, ...patients],
    });
  },

  launchPlannedIntake: (intake) => {
    set((s) => ({ plannedIntakes: [...s.plannedIntakes, intake] }));
  },

  executeRecommendation: (recommendationId: string) => {
    const s = get();
    const rec = s.recommendations.find((r) => r.id === recommendationId);
    if (!rec) return;
    // Minimale MVP-Ausfuehrung: markiere als executed + applyMeasure (wo moeglich).
    const updatedRecs = s.recommendations.map((r) =>
      r.id === recommendationId ? { ...r, executedAt: s.simTime } : r
    );
    const hospitals = { ...s.hospitals };
    applyMeasure(hospitals, rec);
    set({ recommendations: updatedRecs, hospitals });
  },
}));

function applyMeasure(
  hospitals: Record<string, Hospital>,
  rec: Recommendation
): void {
  switch (rec.action) {
    case 'activate-surge': {
      for (const id of rec.targetHospitalIds) {
        const h = hospitals[id];
        if (!h) continue;
        for (const r of ['notaufnahme', 'op_saal', 'its_bett', 'normal_bett'] as const) {
          if (h.capacity[r].surgeReserve > 0) {
            h.capacity[r] = { ...h.capacity[r], surgeActive: true };
          }
        }
      }
      return;
    }
    case 'cancel-elective': {
      for (const id of rec.targetHospitalIds) {
        const h = hospitals[id];
        if (!h) continue;
        h.electiveActive = false;
        const op = h.capacity.op_saal;
        const extra = Math.round(op.total * 0.25);
        h.capacity.op_saal = { ...op, surgeReserve: op.surgeReserve + extra };
      }
      return;
    }
    case 'staff-callup': {
      for (const id of rec.targetHospitalIds) {
        const h = hospitals[id];
        if (!h) continue;
        h.staff = { onDuty: h.staff.onDuty + h.staff.onCall, onCall: 0 };
      }
      return;
    }
    case 'alert-adjacent': {
      for (const id of rec.targetHospitalIds) {
        const h = hospitals[id];
        if (!h) continue;
        if (h.escalation === 'normal') h.escalation = 'erhoeht';
      }
      return;
    }
    default:
      // MVP: andere Massnahmen sind registriert, Effekt folgt in spaeteren Phasen.
      return;
  }
}
