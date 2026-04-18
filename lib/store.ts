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
import { seededRng } from '@/lib/simulation/rng';
import { applyMeasureToState } from '@/lib/simulation/measures';
import { mkEvent } from '@/lib/audit/event-log';
import { createIncidentFromScenario } from '@/lib/simulation/scenarios';

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
  updateFilters: (patch: Partial<SimState['filters']>) => void;
  clearEvents: () => void;
  runShowcase: () => void;
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
    events: [],
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

// Engine mutiert state in-place (Performance). Damit Zustand/React
// Re-Renders ausloest, muessen wir vor dem Tick neue Refs fuer alle
// mutierten Sub-Objekte erzeugen.
function cloneForTick(s: SimState): SimState {
  return {
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
    patients: s.patients.map((p) => ({ ...p, needs: { ...p.needs } })),
    incidents: [...s.incidents],
    plannedIntakes: s.plannedIntakes.map((i) => ({ ...i })),
    alerts: [...s.alerts],
    recommendations: [...s.recommendations],
    occupancyHistory: [...s.occupancyHistory],
    events: [...s.events],
    routes: { ...s.routes },
    forkPreviewCache: { ...s.forkPreviewCache },
    filters: {
      ...s.filters,
      bedThresholds: { ...s.filters.bedThresholds },
      triage: { ...s.filters.triage },
    },
  };
}

export const useSimStore = create<Store>((set, get) => ({
  ...initialState(),

  tick: () => {
    const s = get();
    const clone = cloneForTick(s);
    tick(clone);
    set(clone);
  },

  pause: () => {
    clearTickLoop();
    const s = get();
    set({
      isRunning: false,
      events: [
        ...s.events,
        mkEvent({ simTime: s.simTime, kind: 'sim.paused', scope: 'system', triggeredBy: 'operator' }),
      ],
    });
  },

  resume: () => {
    if (get().isRunning) return;
    const s = get();
    set({
      isRunning: true,
      events: [
        ...s.events,
        mkEvent({ simTime: s.simTime, kind: 'sim.resumed', scope: 'system', triggeredBy: 'operator' }),
      ],
    });
    scheduleTickLoop(() => get().speed, () => get().tick());
  },

  setSpeed: (speed) => {
    const s = get();
    set({
      speed,
      events: [
        ...s.events,
        mkEvent({
          simTime: s.simTime,
          kind: 'sim.speed-changed',
          scope: 'system',
          payload: { speed },
          triggeredBy: 'operator',
        }),
      ],
    });
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
    const incident: Incident = {
      ...incidentPartial,
      startedAt: s.simTime,
    };
    // Patienten werden NICHT sofort gespawnt — die Engine verteilt sie pro
    // Tick gemaess ArrivalCurve (SIMULATION.md §3.2). Visuell: onScene-
    // Count steigt sichtbar an, Patienten fliessen gestaffelt.
    set({
      incidents: [...s.incidents, incident],
      events: [
        ...s.events,
        mkEvent({
          simTime: s.simTime,
          kind: 'incident.started',
          scope: 'incident',
          scopeRef: incident.id,
          payload: {
            type: incident.type,
            label: incident.label,
            location: incident.location,
            estimatedCasualties: incident.estimatedCasualties,
          },
          triggeredBy: 'operator',
        }),
      ],
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
    set((st) => ({
      plannedIntakes: [...st.plannedIntakes, intake],
      events: [
        ...st.events,
        mkEvent({
          simTime: st.simTime,
          kind: 'intake.announced',
          scope: 'intake',
          scopeRef: intake.id,
          payload: {
            label,
            totalPatients,
            flightCount,
            prepWindowMin,
            firstArrivalAt,
          },
          triggeredBy: 'operator',
        }),
      ],
    }));
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
      events: [
        ...s.events,
        mkEvent({
          simTime: s.simTime,
          kind: 'measure.applied',
          scope: 'system',
          scopeRef: rec.id,
          payload: {
            action: rec.action,
            targets: rec.targetHospitalIds,
            intakeRefId: rec.intakeRefId,
          },
          triggeredBy: 'operator',
        }),
        mkEvent({
          simTime: s.simTime,
          kind: 'recommendation.executed',
          scope: 'system',
          scopeRef: rec.id,
          payload: {
            action: rec.action,
            expectedImpact: rec.expectedImpact,
          },
          triggeredBy: 'operator',
        }),
      ],
    });
  },

  updateFilters: (patch) => {
    set((s) => ({ filters: { ...s.filters, ...patch } }));
  },

  clearEvents: () => {
    set({ events: [] });
  },

  runShowcase: () => {
    const SEED = 20260418;
    clearTickLoop();
    // Reset auf sauberen State mit fixem Seed.
    set({ ...initialState(SEED) });
    const startTime = get().simTime;
    set((s) => ({
      speed: 10,
      isRunning: true,
      events: [
        ...s.events,
        mkEvent({
          simTime: s.simTime,
          kind: 'user.showcase-started',
          scope: 'system',
          triggeredBy: 'operator',
          payload: { seed: SEED },
        }),
      ],
    }));
    scheduleTickLoop(() => get().speed, () => get().tick());

    // Showcase-Ablauf (SCENARIOS.md §5): T+30 Intake, T+720 S-Bahn, T+840 Allianz.
    const scheduleAction = (afterSimMin: number, fn: () => void) => {
      const interval = setInterval(() => {
        if (!get().isRunning) return;
        if (get().simTime - startTime >= afterSimMin) {
          clearInterval(interval);
          fn();
        }
      }, 100);
    };

    scheduleAction(30, () => {
      const api = get();
      api.announcePlannedIntake({
        label: 'Medizinische Evakuierung — Soldaten MUC',
        totalPatients: 750,
        flightCount: 3,
        flightIntervalMin: 45,
        prepWindowMin: 1440,
        bufferRatio: 0.15,
        arrivalPoint: [11.7861, 48.3538],
      });
    });

    scheduleAction(720, () => {
      const api = get();
      const inc = createIncidentFromScenario('sbahn-ostbahnhof', api.simTime, seededRng(SEED));
      if (inc) api.launchIncident(inc);
    });

    scheduleAction(840, () => {
      const api = get();
      const inc = createIncidentFromScenario(
        'allianz-arena-panik',
        api.simTime,
        seededRng(SEED + 1),
        { perturbLocation: true }
      );
      if (inc) api.launchIncident(inc);
    });
  },
}));

// Alter Store-interner applyMeasure-Helper entfernt — lib/simulation/measures.ts
// ist jetzt die einzige Quelle der Massnahmen-Anwendung (DRY).
