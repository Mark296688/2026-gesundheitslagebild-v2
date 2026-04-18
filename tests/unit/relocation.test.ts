import { describe, it, expect } from 'vitest';
import type {
  Capacity,
  Hospital,
  Patient,
  PlannedIntake,
  ResourceType,
  SimState,
} from '@/lib/types';
import {
  aggregateNeedsProfile,
  computeTargetFreeBeds,
  hospitalsNear,
  hospitalsFar,
  runRelocationWave,
  relocationStep,
  CLUSTER_RADIUS_KM,
  RELOCATIONS_PER_SOURCE_PER_TICK,
} from '@/lib/simulation/relocation';
import { emptySimState } from '@/lib/simulation/engine';
import { FLUGHAFEN_MUC_COORDS } from '@/lib/geo';

const FLUGHAFEN: [number, number] = FLUGHAFEN_MUC_COORDS;

function cap(total: number, occupied = 0): Capacity {
  return { total, occupied, surgeReserve: Math.round(total * 0.2), surgeActive: false };
}

function mkHospital(id: string, coords: [number, number], overrides: Partial<Hospital> = {}): Hospital {
  const capacity: Record<ResourceType, Capacity> = overrides.capacity ?? {
    notaufnahme: cap(10, 5),
    op_saal: cap(10, 5),
    its_bett: cap(10, 5),
    normal_bett: cap(200, 120),
  };
  return {
    id,
    name: id,
    kind: 'Regelversorger',
    tier: overrides.tier ?? 'regel',
    coords,
    address: { street: '', city: '', plz: '' },
    capacity,
    abteilungen: [],
    flags: {
      hasOP: true,
      hasITS: true,
      hasNotaufnahme: true,
      hasBurnCenter: false,
      hasNeurochir: false,
      hasPaediatrie: false,
    },
    staff: { onDuty: 50, onCall: 20 },
    escalation: 'normal',
    electiveActive: true,
    divertActive: false,
  };
}

function mkIntake(overrides: Partial<PlannedIntake> = {}): PlannedIntake {
  return {
    id: 'PI-1',
    label: 'Test Intake',
    arrivalPoint: FLUGHAFEN,
    announcedAt: 0,
    firstArrivalAt: 1440,
    flights: [
      {
        idx: 1,
        etaMin: 1440,
        patientCount: 100,
        triageMix: { T1: 0.2, T2: 0.5, T3: 0.25, T4: 0.05 },
        needsProfile: { opShare: 0.5, itsShare: 0.3, notaufnahmeShare: 0.1, normalBedShare: 0.1 },
      },
    ],
    totalPatients: 100,
    prepWindowMin: 1440,
    status: 'preparing',
    bufferRatio: 0.15,
    ...overrides,
  };
}

describe('aggregateNeedsProfile', () => {
  it('Gewichtetes Mittel aus mehreren Fluegen', () => {
    const intake = mkIntake({
      totalPatients: 200,
      flights: [
        {
          idx: 1,
          etaMin: 1440,
          patientCount: 100,
          triageMix: { T1: 0.2, T2: 0.5, T3: 0.25, T4: 0.05 },
          needsProfile: { opShare: 0.6, itsShare: 0.2, notaufnahmeShare: 0.1, normalBedShare: 0.1 },
        },
        {
          idx: 2,
          etaMin: 1485,
          patientCount: 100,
          triageMix: { T1: 0.2, T2: 0.5, T3: 0.25, T4: 0.05 },
          needsProfile: { opShare: 0.2, itsShare: 0.4, notaufnahmeShare: 0.2, normalBedShare: 0.2 },
        },
      ],
    });
    const p = aggregateNeedsProfile(intake);
    expect(p.opShare).toBeCloseTo(0.4, 5);
    expect(p.itsShare).toBeCloseTo(0.3, 5);
  });
});

describe('computeTargetFreeBeds', () => {
  it('erhoeht Bedarf um bufferRatio', () => {
    const intake = mkIntake({ totalPatients: 100, bufferRatio: 0.2 });
    const t = computeTargetFreeBeds(intake);
    const sum = t.op_saal + t.its_bett + t.notaufnahme + t.normal_bett;
    expect(sum).toBeGreaterThanOrEqual(120);
  });
});

describe('hospitalsNear / hospitalsFar', () => {
  it('trennt innerhalb vs. ausserhalb Radius', () => {
    const a = mkHospital('A', [FLUGHAFEN[0] + 0.05, FLUGHAFEN[1] + 0.05]); // nah
    const b = mkHospital('B', [FLUGHAFEN[0] - 1.5, FLUGHAFEN[1] - 1.5]); // weit
    const near = hospitalsNear(FLUGHAFEN, [a, b], CLUSTER_RADIUS_KM);
    const far = hospitalsFar(FLUGHAFEN, [a, b], CLUSTER_RADIUS_KM);
    expect(near).toContain(a);
    expect(far).toContain(b);
  });
});

function mkStablePatient(id: string, hospitalId: string, arrivedAt = 0): Patient {
  return {
    id,
    triage: 'T3',
    needs: { notaufnahme: false, op_saal: false, its_bett: false, normal_bett: true },
    treatmentMin: 600,
    source: 'baseline',
    spawnedAt: -100,
    status: 'inTreatment',
    assignedHospitalId: hospitalId,
    arrivedAt,
    dischargeAt: 9999,
    isStableForTransfer: true,
  };
}

describe('runRelocationWave', () => {
  it('keine Wave fuer Intake != preparing', () => {
    const state: SimState = emptySimState();
    const intake = mkIntake({ status: 'announced' });
    state.plannedIntakes.push(intake);
    const n = runRelocationWave(state, intake);
    expect(n).toBe(0);
  });

  it('verlegt stabile Patienten aus flughafennahen Kliniken in weite', () => {
    const state: SimState = emptySimState();
    // Nahe Klinik 3 km vom Flughafen.
    const near = mkHospital('N', [FLUGHAFEN[0] - 0.03, FLUGHAFEN[1] - 0.03], {
      capacity: {
        notaufnahme: cap(10, 0),
        op_saal: cap(10, 0),
        its_bett: cap(10, 0),
        normal_bett: cap(200, 150), // stark belegt
      },
    });
    const far = mkHospital('F', [10.9, 47.8], {
      capacity: {
        notaufnahme: cap(10, 0),
        op_saal: cap(10, 0),
        its_bett: cap(10, 0),
        normal_bett: cap(500, 100), // viel Platz
      },
    });
    state.hospitals = { N: near, F: far };
    state.patients = Array.from({ length: 8 }, (_, i) => mkStablePatient(`P${i}`, 'N', -120));
    state.simTime = 100;
    const intake = mkIntake();
    state.plannedIntakes.push(intake);

    const n = runRelocationWave(state, intake);
    // Per-Source-Cap = RELOCATIONS_PER_SOURCE_PER_TICK (4).
    expect(n).toBeLessThanOrEqual(RELOCATIONS_PER_SOURCE_PER_TICK);
    expect(n).toBeGreaterThan(0);

    const relocating = state.patients.filter((p) => p.status === 'transferring');
    expect(relocating.length).toBe(n);
    for (const p of relocating) {
      expect(p.transferTargetHospitalId).toBe('F');
    }
    // Source hat Betten freigegeben.
    expect(near.capacity.normal_bett.occupied).toBeLessThanOrEqual(150 - n);
  });

  it('respektiert Per-Source-Cap auch bei vielen Kandidaten', () => {
    const state: SimState = emptySimState();
    const near = mkHospital('N', [FLUGHAFEN[0], FLUGHAFEN[1]], {
      capacity: {
        notaufnahme: cap(10, 0),
        op_saal: cap(10, 0),
        its_bett: cap(10, 0),
        normal_bett: cap(500, 400),
      },
    });
    const far = mkHospital('F', [10.8, 47.7], {
      capacity: {
        notaufnahme: cap(10, 0),
        op_saal: cap(10, 0),
        its_bett: cap(10, 0),
        normal_bett: cap(1000, 100),
      },
    });
    state.hospitals = { N: near, F: far };
    state.patients = Array.from({ length: 30 }, (_, i) => mkStablePatient(`P${i}`, 'N', -120));
    state.simTime = 100;
    const intake = mkIntake();
    state.plannedIntakes.push(intake);

    const n = runRelocationWave(state, intake);
    expect(n).toBe(RELOCATIONS_PER_SOURCE_PER_TICK);
  });
});

describe('relocationStep multi-intake', () => {
  it('summiert ueber alle "preparing" Intakes', () => {
    const state: SimState = emptySimState();
    const near = mkHospital('N', FLUGHAFEN, {
      capacity: {
        notaufnahme: cap(10, 0),
        op_saal: cap(10, 0),
        its_bett: cap(10, 0),
        normal_bett: cap(500, 400),
      },
    });
    const far = mkHospital('F', [10.8, 47.7], {
      capacity: {
        notaufnahme: cap(10, 0),
        op_saal: cap(10, 0),
        its_bett: cap(10, 0),
        normal_bett: cap(1000, 100),
      },
    });
    state.hospitals = { N: near, F: far };
    state.patients = Array.from({ length: 12 }, (_, i) => mkStablePatient(`P${i}`, 'N', -120));
    state.simTime = 100;
    state.plannedIntakes = [mkIntake({ id: 'I1' }), mkIntake({ id: 'I2' })];
    const n = relocationStep(state, 20);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(20);
  });
});
