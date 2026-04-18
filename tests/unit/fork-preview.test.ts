import { describe, it, expect } from 'vitest';
import type { Capacity, Hospital, Recommendation, ResourceType, SimState } from '@/lib/types';
import { emptySimState } from '@/lib/simulation/engine';
import { computeForkPreview } from '@/lib/simulation/fork-preview';
import { applyMeasureToState } from '@/lib/simulation/measures';

function cap(total: number, occupied = 0, surgeReserve?: number): Capacity {
  return { total, occupied, surgeReserve: surgeReserve ?? Math.round(total * 0.2), surgeActive: false };
}

function mkHospital(id: string): Hospital {
  const capacity: Record<ResourceType, Capacity> = {
    notaufnahme: cap(10, 8),
    op_saal: cap(10, 8),
    its_bett: cap(10, 8),
    normal_bett: cap(200, 170),
  };
  return {
    id,
    name: id,
    kind: 'Regelversorger',
    tier: 'regel',
    coords: [11.58, 48.14],
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
    staff: { onDuty: 60, onCall: 20 },
    escalation: 'normal',
    electiveActive: true,
    divertActive: false,
  };
}

describe('applyMeasureToState', () => {
  it('activate-surge setzt surgeActive=true fuer alle Ressourcen der Zielklinik', () => {
    const s: SimState = emptySimState();
    s.hospitals['H1'] = mkHospital('H1');
    const rec: Recommendation = {
      id: 'R1',
      triggeredBy: [],
      action: 'activate-surge',
      targetHospitalIds: ['H1'],
      title: 'Surge',
      rationale: '',
      expectedImpact: {},
      effortLevel: 'low',
      executable: true,
    };
    applyMeasureToState(s, rec);
    expect(s.hospitals['H1'].capacity.its_bett.surgeActive).toBe(true);
    expect(s.hospitals['H1'].capacity.normal_bett.surgeActive).toBe(true);
  });

  it('cancel-elective setzt electiveActive=false + erhoeht op_saal.surgeReserve', () => {
    const s: SimState = emptySimState();
    s.hospitals['H1'] = mkHospital('H1');
    const baseSurge = s.hospitals['H1'].capacity.op_saal.surgeReserve;
    const rec: Recommendation = {
      id: 'R1',
      triggeredBy: [],
      action: 'cancel-elective',
      targetHospitalIds: ['H1'],
      title: 'X',
      rationale: '',
      expectedImpact: {},
      effortLevel: 'medium',
      executable: true,
    };
    applyMeasureToState(s, rec);
    expect(s.hospitals['H1'].electiveActive).toBe(false);
    expect(s.hospitals['H1'].capacity.op_saal.surgeReserve).toBeGreaterThan(baseSurge);
  });

  it('prepare-reception setzt Intake-Status auf preparing', () => {
    const s: SimState = emptySimState();
    s.plannedIntakes.push({
      id: 'PI-1',
      label: 'X',
      arrivalPoint: [11.78, 48.35],
      announcedAt: 0,
      firstArrivalAt: 1440,
      flights: [],
      totalPatients: 100,
      prepWindowMin: 1440,
      status: 'announced',
      bufferRatio: 0.15,
    });
    const rec: Recommendation = {
      id: 'R1',
      triggeredBy: [],
      action: 'prepare-reception',
      targetHospitalIds: [],
      intakeRefId: 'PI-1',
      title: 'X',
      rationale: '',
      expectedImpact: {},
      effortLevel: 'high',
      executable: true,
    };
    applyMeasureToState(s, rec);
    expect(s.plannedIntakes[0].status).toBe('preparing');
  });

  it('activate-reserve-hospital fuegt Reserveklinik hinzu', () => {
    const s: SimState = emptySimState();
    const rec: Recommendation = {
      id: 'R1',
      triggeredBy: [],
      action: 'activate-reserve-hospital',
      targetHospitalIds: [],
      title: 'X',
      rationale: '',
      expectedImpact: { bedsGained: 200 },
      effortLevel: 'high',
      executable: true,
    };
    applyMeasureToState(s, rec);
    expect(s.hospitals['H-RESERVE-FFB']).toBeDefined();
    expect(s.hospitals['H-RESERVE-FFB'].capacity.normal_bett.total).toBe(200);
  });
});

describe('computeForkPreview', () => {
  it('liefert gleiches Kurven-Length fuer curveWithout und curveWith', () => {
    const s: SimState = emptySimState();
    s.hospitals['H1'] = mkHospital('H1');
    const rec: Recommendation = {
      id: 'R1',
      triggeredBy: [],
      action: 'activate-surge',
      targetHospitalIds: ['H1'],
      title: 'Surge',
      rationale: '',
      expectedImpact: {},
      effortLevel: 'low',
      executable: true,
    };
    const r = computeForkPreview(s, rec, 60);
    expect(r.curveWithout.length).toBe(r.curveWith.length);
    expect(r.curveWithout.length).toBeGreaterThan(1);
    expect(r.horizonMin).toBe(60);
    expect(r.recommendationId).toBe('R1');
  });

  it('base-state bleibt unveraendert (immutable bzgl. Hospital.occupied)', () => {
    const s: SimState = emptySimState();
    s.hospitals['H1'] = mkHospital('H1');
    const occ = s.hospitals['H1'].capacity.normal_bett.occupied;
    const rec: Recommendation = {
      id: 'R1',
      triggeredBy: [],
      action: 'activate-surge',
      targetHospitalIds: ['H1'],
      title: 'X',
      rationale: '',
      expectedImpact: {},
      effortLevel: 'low',
      executable: true,
    };
    computeForkPreview(s, rec, 30);
    expect(s.hospitals['H1'].capacity.normal_bett.occupied).toBe(occ);
    expect(s.hospitals['H1'].capacity.normal_bett.surgeActive).toBe(false);
  });

  it('activate-surge reduziert peakLoad gegenueber ohne Massnahme', () => {
    const s: SimState = emptySimState();
    // Stark ausgelastetes Haus mit grossem Surge-Buffer.
    s.hospitals['H1'] = mkHospital('H1');
    s.hospitals['H1'].capacity.normal_bett = { total: 100, occupied: 90, surgeReserve: 40, surgeActive: false };
    const rec: Recommendation = {
      id: 'R1',
      triggeredBy: [],
      action: 'activate-surge',
      targetHospitalIds: ['H1'],
      title: 'X',
      rationale: '',
      expectedImpact: {},
      effortLevel: 'low',
      executable: true,
    };
    const r = computeForkPreview(s, rec, 30);
    expect(r.diff.peakLoadDelta).toBeLessThanOrEqual(0);
  });
});
