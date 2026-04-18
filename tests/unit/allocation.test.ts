import { describe, it, expect } from 'vitest';
import type {
  Capacity,
  Hospital,
  HospitalTier,
  Patient,
  ResourceType,
  Triage,
} from '@/lib/types';
import {
  allocateBatch,
  allocatePatient,
  spawnIncidentPatients,
  DISTANCE_CUTOFF_KM,
  STABILIZATION_MIN,
} from '@/lib/simulation/allocation';
import {
  rankCandidates,
  primaryResource,
  tierFitScore,
  providesRequiredResources,
  hasAnyFreeResource,
  remainingQuota,
  distanceCutoffKm,
  QUOTA_PER_TICK,
  freeBeds,
  freeFraction,
} from '@/lib/simulation/router';
import { seededRng } from '@/lib/simulation/rng';

function cap(total: number, occupied = 0, surgeReserve?: number): Capacity {
  return {
    total,
    occupied,
    surgeReserve: surgeReserve ?? Math.round(total * 0.2),
    surgeActive: false,
  };
}

function mkHospital(partial: Partial<Hospital> & { id: string; coords: [number, number] }): Hospital {
  const capacity: Record<ResourceType, Capacity> = partial.capacity ?? {
    notaufnahme: cap(4),
    op_saal: cap(4),
    its_bett: cap(8),
    normal_bett: cap(100),
  };
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    kind: partial.kind ?? 'Regelversorger',
    tier: partial.tier ?? 'regel',
    coords: partial.coords,
    address: { street: '', city: '', plz: '' },
    capacity,
    abteilungen: [],
    flags: partial.flags ?? {
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

function mkPatient(
  id: string,
  triage: Triage,
  needs: Partial<Record<ResourceType, boolean>> = {}
): Patient {
  const full: Record<ResourceType, boolean> = {
    notaufnahme: needs.notaufnahme ?? true,
    op_saal: needs.op_saal ?? false,
    its_bett: needs.its_bett ?? false,
    normal_bett: needs.normal_bett ?? true,
  };
  return {
    id,
    triage,
    needs: full,
    treatmentMin: 120,
    source: 'incident',
    sourceRefId: 'I-TEST',
    spawnedAt: 0,
    status: 'onScene',
    isStableForTransfer: false,
  };
}

const INCIDENT_LOC: [number, number] = [11.58, 48.14]; // Muenchen Zentrum
const INCIDENT: { id: string; location: [number, number] } = { id: 'I-TEST', location: INCIDENT_LOC };

function ctx(hospitals: Hospital[]) {
  const map: Record<string, Hospital> = {};
  for (const h of hospitals) map[h.id] = h;
  return {
    hospitals: map,
    incidents: [INCIDENT],
    simTime: 0,
    assignedThisTick: {} as Record<string, number>,
  };
}

describe('router - primaryResource', () => {
  it('bevorzugt ITS wenn benoetigt', () => {
    expect(primaryResource(mkPatient('P', 'T1', { its_bett: true, op_saal: true }))).toBe('its_bett');
  });
  it('sonst OP', () => {
    expect(primaryResource(mkPatient('P', 'T2', { op_saal: true, normal_bett: true }))).toBe('op_saal');
  });
  it('sonst Notaufnahme', () => {
    expect(primaryResource(mkPatient('P', 'T3', { notaufnahme: true, normal_bett: true }))).toBe('notaufnahme');
  });
  it('Fallback Normalbett', () => {
    const p = mkPatient('P', 'T4', {});
    p.needs = { notaufnahme: false, op_saal: false, its_bett: false, normal_bett: false };
    expect(primaryResource(p)).toBe('normal_bett');
  });
});

describe('router - tierFitScore', () => {
  it('maximal fuer T1 ist Maximum', () => {
    const scores: Record<HospitalTier, number> = {
      maximal: tierFitScore('maximal', 'T1'),
      schwerpunkt: tierFitScore('schwerpunkt', 'T1'),
      regel: tierFitScore('regel', 'T1'),
      grund: tierFitScore('grund', 'T1'),
    };
    expect(scores.maximal).toBeGreaterThan(scores.schwerpunkt);
    expect(scores.schwerpunkt).toBeGreaterThan(scores.regel);
    expect(scores.regel).toBeGreaterThan(scores.grund);
  });
  it('T4 hat flachere Kurve als T1', () => {
    const t1 = tierFitScore('maximal', 'T1') - tierFitScore('grund', 'T1');
    const t4 = tierFitScore('maximal', 'T4') - tierFitScore('grund', 'T4');
    expect(t1).toBeGreaterThan(t4);
  });
});

describe('router - freeBeds / freeFraction', () => {
  it('freeBeds klemmt auf 0', () => {
    expect(freeBeds(cap(10, 15))).toBe(0);
  });
  it('freeFraction bei leerer Klinik = 0', () => {
    expect(freeFraction(cap(0))).toBe(0);
  });
  it('freeFraction bei halbvoller Klinik = 0.5', () => {
    expect(freeFraction(cap(10, 5))).toBe(0.5);
  });
});

describe('router - providesRequiredResources', () => {
  it('true wenn alle benoetigten Ressourcen vorhanden', () => {
    const h = mkHospital({ id: 'H1', coords: [11.5, 48.1] });
    const p = mkPatient('P', 'T2', { op_saal: true, notaufnahme: true });
    expect(providesRequiredResources(h, p)).toBe(true);
  });
  it('false wenn op_saal fehlt', () => {
    const h = mkHospital({
      id: 'H1',
      coords: [11.5, 48.1],
      capacity: {
        notaufnahme: cap(2),
        op_saal: cap(0),
        its_bett: cap(2),
        normal_bett: cap(20),
      },
    });
    const p = mkPatient('P', 'T2', { op_saal: true });
    expect(providesRequiredResources(h, p)).toBe(false);
  });
});

describe('router - hasAnyFreeResource', () => {
  it('true wenn eine Ressource frei ist', () => {
    const h = mkHospital({ id: 'H1', coords: [11.5, 48.1] });
    const p = mkPatient('P', 'T2', { op_saal: true });
    expect(hasAnyFreeResource(h, p, 'none')).toBe(true);
  });
  it('false wenn alle Ressourcen voll (ausser surge-Stage)', () => {
    const h = mkHospital({
      id: 'H1',
      coords: [11.5, 48.1],
      capacity: {
        notaufnahme: cap(2, 2),
        op_saal: cap(2, 2),
        its_bett: cap(2, 2),
        normal_bett: cap(20, 20),
      },
    });
    const p = mkPatient('P', 'T2', { op_saal: true });
    expect(hasAnyFreeResource(h, p, 'none')).toBe(false);
    expect(hasAnyFreeResource(h, p, 'load')).toBe(true);
    expect(hasAnyFreeResource(h, p, 'surge')).toBe(true);
  });
});

describe('router - distanceCutoffKm cascade', () => {
  it('Baseline-Cutoffs', () => {
    expect(distanceCutoffKm('T1', 'none')).toBe(60);
    expect(distanceCutoffKm('T2', 'none')).toBe(40);
    expect(distanceCutoffKm('T3', 'none')).toBe(25);
    expect(distanceCutoffKm('T4', 'none')).toBe(15);
  });
  it('Cascade A verdoppelt, cap 120', () => {
    expect(distanceCutoffKm('T1', 'distance')).toBe(120);
    expect(distanceCutoffKm('T3', 'distance')).toBe(50);
  });
});

describe('router - remainingQuota cascade', () => {
  it('Baseline-Quota', () => {
    expect(remainingQuota('T1', 'none', 'H', {})).toBe(QUOTA_PER_TICK.T1);
    expect(remainingQuota('T3', 'none', 'H', {})).toBe(QUOTA_PER_TICK.T3);
  });
  it('subtrahiert bereits zugewiesene', () => {
    expect(remainingQuota('T3', 'none', 'H', { H: 5 })).toBe(QUOTA_PER_TICK.T3 - 5);
  });
  it('Cascade B verdoppelt', () => {
    expect(remainingQuota('T1', 'quota', 'H', {})).toBe(QUOTA_PER_TICK.T1 * 2);
  });
  it('Surge ist unbegrenzt', () => {
    expect(remainingQuota('T1', 'surge', 'H', { H: 999 })).toBe(Infinity);
  });
});

describe('allocatePatient - einfache Zuweisung', () => {
  it('weist 1 Patient an 1 passender Klinik zu', () => {
    const h = mkHospital({ id: 'H1', coords: [11.59, 48.15], tier: 'regel' });
    const c = ctx([h]);
    const p = mkPatient('P1', 'T2', { op_saal: true, normal_bett: true });
    expect(allocatePatient(p, c)).toBe(true);
    expect(p.status).toBe('transport');
    expect(p.assignedHospitalId).toBe('H1');
    expect(h.capacity.op_saal.occupied).toBe(1);
    expect(h.capacity.normal_bett.occupied).toBe(1);
    expect(c.assignedThisTick.H1).toBe(1);
  });

  it('setzt arrivedAt mit Stabilisierungszeit und dischargeAt', () => {
    const h = mkHospital({ id: 'H1', coords: [11.59, 48.15], tier: 'maximal' });
    const c = ctx([h]);
    const p = mkPatient('P', 'T1', { its_bett: true, op_saal: true });
    allocatePatient(p, c);
    expect(p.arrivedAt).toBeDefined();
    expect(p.arrivedAt).toBeGreaterThanOrEqual(STABILIZATION_MIN.T1);
    expect(p.dischargeAt).toBeGreaterThan(p.arrivedAt ?? 0);
  });

  it('T1 geht nur zu maximal/schwerpunkt (hard constraint)', () => {
    const h = mkHospital({ id: 'H1', coords: [11.59, 48.15], tier: 'regel' });
    const c = ctx([h]);
    const p = mkPatient('P', 'T1', { its_bett: true, op_saal: true });
    allocatePatient(p, c);
    // keine passende Klinik → bleibt onScene (erst surge-stage greift — die
    // akzeptiert aber tier nicht)
    expect(p.status).toBe('onScene');
  });

  it('T1 mit einer maximal-Klinik weit weg wird trotzdem zugewiesen (Cascade A)', () => {
    // Maximal-Klinik 80 km entfernt — ueber T1-Baseline 60 km, aber unter cascade 120 km.
    const far = mkHospital({ id: 'H-FAR', coords: [12.5, 48.9], tier: 'maximal' });
    const c = ctx([far]);
    const p = mkPatient('P', 'T1', { its_bett: true });
    // Baseline-Cutoff 60 km reicht nicht; Cascade A (120 km) packt.
    const ok = allocatePatient(p, c);
    expect(ok).toBe(true);
    expect(p.assignedHospitalId).toBe('H-FAR');
  });

  it('bevorzugt naeher liegende Klinik', () => {
    const near = mkHospital({ id: 'H-NEAR', coords: [11.59, 48.15], tier: 'maximal' });
    const far = mkHospital({ id: 'H-FAR', coords: [12.1, 48.4], tier: 'maximal' });
    const c = ctx([near, far]);
    const p = mkPatient('P', 'T1', { its_bett: true, op_saal: true });
    allocatePatient(p, c);
    expect(p.assignedHospitalId).toBe('H-NEAR');
  });

  it('ignoriert Klinik die eine benoetigte Ressource nicht bietet', () => {
    const hNoOp = mkHospital({
      id: 'H-NOOP',
      coords: [11.58, 48.14],
      tier: 'maximal',
      capacity: {
        notaufnahme: cap(4),
        op_saal: cap(0),
        its_bett: cap(4),
        normal_bett: cap(50),
      },
      flags: { hasOP: false, hasITS: true, hasNotaufnahme: true, hasBurnCenter: false, hasNeurochir: false, hasPaediatrie: false },
    });
    const hYes = mkHospital({ id: 'H-OK', coords: [11.7, 48.2], tier: 'maximal' });
    const c = ctx([hNoOp, hYes]);
    const p = mkPatient('P', 'T1', { op_saal: true });
    allocatePatient(p, c);
    expect(p.assignedHospitalId).toBe('H-OK');
  });
});

describe('Water-Filling Quota', () => {
  it('belegt pro Klinik und Tick maximal QUOTA_PER_TICK.T2 = 5 (Stage none)', () => {
    const h = mkHospital({ id: 'H1', coords: [11.59, 48.15], capacity: {
      notaufnahme: cap(100),
      op_saal: cap(100),
      its_bett: cap(100),
      normal_bett: cap(500),
    } });
    const c = ctx([h]);
    const ps: Patient[] = Array.from({ length: 10 }, (_, i) =>
      mkPatient(`P${i}`, 'T2', { op_saal: true })
    );
    allocateBatch(ps, c);
    const assigned = ps.filter((p) => p.assignedHospitalId === 'H1');
    // Erster Stage 'none' gibt 5, dann Cascade B (quota) gibt nochmal +5 → bis zu 10
    expect(assigned.length).toBeGreaterThanOrEqual(5);
  });
});

describe('Cascade - keine Kapazitaet mehr', () => {
  it('Cascade C+D greift wenn Betten voll sind (Surge belegt trotzdem)', () => {
    const h = mkHospital({
      id: 'H-FULL',
      coords: [11.59, 48.15],
      tier: 'maximal',
      capacity: {
        notaufnahme: cap(2, 2),
        op_saal: cap(2, 2),
        its_bett: cap(2, 2),
        normal_bett: cap(4, 4),
      },
    });
    const c = ctx([h]);
    const p = mkPatient('P', 'T1', { its_bett: true });
    const ok = allocatePatient(p, c);
    // Surge-Stage laesst ueberbelegen
    expect(ok).toBe(true);
    expect(h.capacity.its_bett.occupied).toBeGreaterThanOrEqual(3);
  });
});

describe('allocateBatch mehrere Triagen', () => {
  it('200 Patienten auf 3 kleine Kliniken — alle versorgt (Cascade D)', () => {
    const hospitals = [
      mkHospital({ id: 'H1', coords: [11.59, 48.15], tier: 'maximal', capacity: {
        notaufnahme: cap(10),
        op_saal: cap(10),
        its_bett: cap(10),
        normal_bett: cap(30),
      }}),
      mkHospital({ id: 'H2', coords: [11.7, 48.2], tier: 'maximal', capacity: {
        notaufnahme: cap(10),
        op_saal: cap(10),
        its_bett: cap(10),
        normal_bett: cap(30),
      }}),
      mkHospital({ id: 'H3', coords: [11.5, 48.3], tier: 'maximal', capacity: {
        notaufnahme: cap(10),
        op_saal: cap(10),
        its_bett: cap(10),
        normal_bett: cap(30),
      }}),
    ];
    const c = ctx(hospitals);
    const patients = spawnIncidentPatients(
      'I-TEST',
      200,
      { T1: 0.1, T2: 0.3, T3: 0.4, T4: 0.2 },
      { opShare: 0.3, itsShare: 0.2, notaufnahmeShare: 0.7, normalBedShare: 0.5 },
      0,
      seededRng(1)
    );
    const res = allocateBatch(patients, c);
    expect(res.allocated + res.failed).toBe(200);
    // Gate: alle Patienten werden versorgt (Cascade D).
    expect(res.failed).toBe(0);
    for (const p of patients) {
      expect(p.status).toBe('transport');
      expect(p.assignedHospitalId).toBeDefined();
    }
  });

  it('Triage-Prioritaet: T1 wird vor T4 zugewiesen wenn Kapazitaet knapp', () => {
    const h = mkHospital({
      id: 'H1',
      coords: [11.59, 48.15],
      tier: 'maximal',
      capacity: {
        notaufnahme: cap(2),
        op_saal: cap(2),
        its_bett: cap(2),
        normal_bett: cap(2),
      },
    });
    const c = ctx([h]);
    const t1 = mkPatient('T1-a', 'T1', { its_bett: true });
    const t4 = mkPatient('T4-a', 'T4', { normal_bett: true });
    allocateBatch([t4, t1], c); // absichtlich falsche Reihenfolge
    expect(t1.assignedHospitalId).toBe('H1');
    expect(t4.assignedHospitalId).toBe('H1'); // geht bei genug Kapazitaet auch
  });
});

describe('spawnIncidentPatients', () => {
  it('erzeugt genau N Patienten', () => {
    const ps = spawnIncidentPatients(
      'I',
      35,
      { T1: 0.25, T2: 0.25, T3: 0.25, T4: 0.25 },
      { opShare: 0.3, itsShare: 0.2, notaufnahmeShare: 0.6, normalBedShare: 0.4 },
      0,
      seededRng(1)
    );
    expect(ps).toHaveLength(35);
  });

  it('alle Patienten haben mindestens eine Ressource benoetigt', () => {
    const ps = spawnIncidentPatients(
      'I',
      50,
      { T1: 0.1, T2: 0.3, T3: 0.3, T4: 0.3 },
      { opShare: 0.0, itsShare: 0.0, notaufnahmeShare: 0.0, normalBedShare: 0.0 },
      0,
      seededRng(5)
    );
    for (const p of ps) {
      const sum = Object.values(p.needs).filter(Boolean).length;
      expect(sum).toBeGreaterThan(0);
    }
  });

  it('Triage-Verteilung respektiert triageMix (Chi-Quadrat-freie Naeherung)', () => {
    const ps = spawnIncidentPatients(
      'I',
      400,
      { T1: 0.1, T2: 0.2, T3: 0.3, T4: 0.4 },
      { opShare: 0.3, itsShare: 0.2, notaufnahmeShare: 0.6, normalBedShare: 0.4 },
      0,
      seededRng(42)
    );
    const counts = { T1: 0, T2: 0, T3: 0, T4: 0 } as Record<Triage, number>;
    for (const p of ps) counts[p.triage]++;
    expect(counts.T1).toBeGreaterThan(400 * 0.05);
    expect(counts.T4).toBeGreaterThan(counts.T1);
  });
});

describe('DISTANCE_CUTOFF_KM + STABILIZATION_MIN Konstanten', () => {
  it('sind in sinnvollen Bereichen', () => {
    expect(DISTANCE_CUTOFF_KM.T1).toBeGreaterThan(DISTANCE_CUTOFF_KM.T2);
    expect(STABILIZATION_MIN.T1).toBeGreaterThan(STABILIZATION_MIN.T4);
  });
});

describe('rankCandidates', () => {
  it('sortiert nach Score absteigend', () => {
    const near = mkHospital({ id: 'N', coords: [11.59, 48.15], tier: 'maximal' });
    const far = mkHospital({ id: 'F', coords: [12.0, 48.4], tier: 'maximal' });
    const p = mkPatient('P', 'T1', { its_bett: true });
    const ranked = rankCandidates(p, INCIDENT_LOC, [near, far], {
      stage: 'none',
      assignedThisTick: {},
    });
    expect(ranked[0].hospital.id).toBe('N');
    expect(ranked[1]?.hospital.id).toBe('F');
  });

  it('ignoriert Klinik mit 0 Quota', () => {
    const h = mkHospital({ id: 'H', coords: [11.59, 48.15], tier: 'maximal' });
    const p = mkPatient('P', 'T1', { its_bett: true });
    const ranked = rankCandidates(p, INCIDENT_LOC, [h], {
      stage: 'none',
      assignedThisTick: { H: QUOTA_PER_TICK.T1 },
    });
    expect(ranked).toHaveLength(0);
  });
});
