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
import { applyMeasureToState } from '@/lib/simulation/measures';

const DEFAULT_SEED = 42;

export interface AnnounceIntakeConfig {
  label: string;
  totalPatients: number;
  flightCount: number;
  flightIntervalMin: number;
  prepWindowMin: number;
  bufferRatio: number;
  arrivalPoint: [number, number];
}

type Store = SimState & {
  tick: () => void;
  pause: () => void;
  resume: () => void;
  setSpeed: (speed: number) => void;
  reset: () => void;
  launchIncident: (incident: Omit<Incident, 'startedAt'>) => void;
  launchPlannedIntake: (intake: PlannedIntake) => void;
  announcePlannedIntake: (config: AnnounceIntakeConfig) => string;
  executeRecommendation: (recommendationId: string) => void;
  selectHospital: (id: string | undefined) => void;
  hoverRecommendation: (id: string | undefined) => void;
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

  announcePlannedIntake: (config) => {
    const s = get();
    const {
      label,
      totalPatients,
      flightCount,
      flightIntervalMin,
      prepWindowMin,
      bufferRatio,
      arrivalPoint,
    } = config;
    const firstArrivalAt = s.simTime + prepWindowMin;
    const perFlight = Math.floor(totalPatients / Math.max(1, flightCount));
    const remainder = totalPatients - perFlight * flightCount;
    const triageMix = { T1: 0.25, T2: 0.45, T3: 0.25, T4: 0.05 };
    const needsProfile = {
      opShare: 0.55,
      itsShare: 0.3,
      notaufnahmeShare: 0.05,
      normalBedShare: 0.1,
    };
    const flights = Array.from({ length: flightCount }, (_, i) => ({
      idx: i + 1,
      etaMin: firstArrivalAt + i * flightIntervalMin,
      patientCount: perFlight + (i === flightCount - 1 ? remainder : 0),
      triageMix,
      needsProfile,
    }));
    const intake = {
      id: `PI-${s.simTime}-${s.plannedIntakes.length + 1}`,
      label,
      arrivalPoint,
      announcedAt: s.simTime,
      firstArrivalAt,
      flights,
      totalPatients,
      prepWindowMin,
      status: 'announced' as const,
      bufferRatio,
    };
    set((st) => ({ plannedIntakes: [...st.plannedIntakes, intake] }));
    return intake.id;
  },

  selectHospital: (id) => {
    set({ selectedHospitalId: id });
  },

  hoverRecommendation: (id) => {
    set({ hoveredRecommendationId: id });
  },

  executeRecommendation: (recommendationId: string) => {
    const s = get();
    const rec = s.recommendations.find((r) => r.id === recommendationId);
    if (!rec) return;
    const next: SimState = {
      ...s,
      hospitals: Object.fromEntries(
        Object.entries(s.hospitals).map(([id, h]) => [
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
      plannedIntakes: s.plannedIntakes.map((i) => ({ ...i })),
    };
    applyMeasureToState(next, rec);
    const updatedRecs = s.recommendations.map((r) =>
      r.id === recommendationId ? { ...r, executedAt: s.simTime, executable: false } : r
    );
    set({
      hospitals: next.hospitals,
      plannedIntakes: next.plannedIntakes,
      recommendations: updatedRecs,
    });
  },
}));

// Alter Store-interner applyMeasure-Helper entfernt — lib/simulation/measures.ts
// ist jetzt die einzige Quelle der Massnahmen-Anwendung (DRY).
