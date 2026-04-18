import { describe, it, expect } from 'vitest';
import type {
  Capacity,
  Hospital,
  Incident,
  Patient,
  PlannedIntake,
  ResourceType,
  SimState,
} from '@/lib/types';
import {
  ruleHospitalSaturation,
  ruleUnassignedPatients,
  ruleRegionalLoad,
  rulePlannedIntakeShortfall,
  ruleEscalationOpportunity,
  ruleCapacityTrend,
  runAllRules,
  mergeAlertsWithDedup,
  resolveStaleAlerts,
  alertKeys,
} from '@/lib/simulation/detection';
import { emptySimState } from '@/lib/simulation/engine';

function cap(total: number, occupied = 0, surgeReserve?: number, surgeActive = false): Capacity {
  return { total, occupied, surgeReserve: surgeReserve ?? Math.round(total * 0.2), surgeActive };
}

function mkHospital(id: string, overrides: Partial<Hospital> = {}): Hospital {
  const capacity: Record<ResourceType, Capacity> = overrides.capacity ?? {
    notaufnahme: cap(10),
    op_saal: cap(10),
    its_bett: cap(10),
    normal_bett: cap(100),
  };
  return {
    id,
    name: id,
    kind: 'Regelversorger',
    tier: overrides.tier ?? 'regel',
    coords: overrides.coords ?? [11.5, 48.1],
    address: { street: '', city: '', plz: '' },
    capacity,
    abteilungen: [],
    flags: overrides.flags ?? {
      hasOP: true,
      hasITS: true,
      hasNotaufnahme: true,
      hasBurnCenter: false,
      hasNeurochir: false,
      hasPaediatrie: false,
    },
    staff: { onDuty: 50, onCall: 20 },
    escalation: overrides.escalation ?? 'normal',
    electiveActive: true,
    divertActive: false,
  };
}

describe('HospitalSaturation', () => {
  it('keine Alerts bei normaler Auslastung', () => {
    const h = mkHospital('H', { capacity: {
      notaufnahme: cap(10, 5),
      op_saal: cap(10, 5),
      its_bett: cap(10, 5),
      normal_bett: cap(100, 50),
    }});
    expect(ruleHospitalSaturation([h], 0)).toEqual([]);
  });

  it('warn bei 85 %', () => {
    const h = mkHospital('H', { capacity: {
      notaufnahme: cap(10, 9),
      op_saal: cap(10, 5),
      its_bett: cap(10, 5),
      normal_bett: cap(100, 50),
    }});
    const alerts = ruleHospitalSaturation([h], 0);
    expect(alerts.some((a) => a.severity === 'warn' && a.ruleName === 'HospitalSaturation')).toBe(true);
  });

  it('critical bei 95 %', () => {
    const h = mkHospital('H', { capacity: {
      notaufnahme: cap(10, 10),
      op_saal: cap(10, 5),
      its_bett: cap(10, 5),
      normal_bett: cap(100, 50),
    }});
    const alerts = ruleHospitalSaturation([h], 0);
    expect(alerts.some((a) => a.severity === 'critical')).toBe(true);
  });
});

describe('UnassignedPatients', () => {
  it('kein Alert wenn Patient < 20 Sim-Min wartet', () => {
    const p: Patient = {
      id: 'P', triage: 'T1', needs: { notaufnahme: true, op_saal: false, its_bett: false, normal_bett: false },
      treatmentMin: 120, source: 'incident', spawnedAt: 0, status: 'onScene', isStableForTransfer: false,
    };
    expect(ruleUnassignedPatients([p], 10)).toEqual([]);
  });

  it('critical-Alert wenn > 20 Sim-Min', () => {
    const p: Patient = {
      id: 'P', triage: 'T1', needs: { notaufnahme: true, op_saal: false, its_bett: false, normal_bett: false },
      treatmentMin: 120, source: 'incident', spawnedAt: 0, status: 'onScene', isStableForTransfer: false,
    };
    const alerts = ruleUnassignedPatients([p], 25);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('critical');
  });
});

describe('RegionalLoad', () => {
  it('warn ab 80 % Gesamt-Auslastung im Umkreis', () => {
    const inc: Incident = {
      id: 'I', type: 'amoklauf', label: 'Test', location: [11.58, 48.14],
      startedAt: 0, estimatedCasualties: 30, arrivalCurve: 'immediate',
      durationMin: 15, triageMix: { T1: 0.2, T2: 0.3, T3: 0.3, T4: 0.2 },
      needsProfile: { opShare: 0.3, itsShare: 0.2, notaufnahmeShare: 0.7, normalBedShare: 0.5 },
    };
    const h1 = mkHospital('H1', { coords: [11.59, 48.15], capacity: {
      notaufnahme: cap(10, 8),
      op_saal: cap(10, 8),
      its_bett: cap(10, 8),
      normal_bett: cap(100, 84),
    }});
    const alerts = ruleRegionalLoad([inc], [h1], 0);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].scope).toBe('region');
  });

  it('ignoriert Kliniken ausserhalb des Radius', () => {
    const inc: Incident = {
      id: 'I', type: 'amoklauf', label: 'Test', location: [11.58, 48.14],
      startedAt: 0, estimatedCasualties: 30, arrivalCurve: 'immediate',
      durationMin: 15, triageMix: { T1: 0.2, T2: 0.3, T3: 0.3, T4: 0.2 },
      needsProfile: { opShare: 0.3, itsShare: 0.2, notaufnahmeShare: 0.7, normalBedShare: 0.5 },
    };
    const far = mkHospital('H-FAR', { coords: [13.5, 49.5], capacity: {
      notaufnahme: cap(10, 10),
      op_saal: cap(10, 10),
      its_bett: cap(10, 10),
      normal_bett: cap(100, 100),
    }});
    expect(ruleRegionalLoad([inc], [far], 0, 50)).toEqual([]);
  });
});

describe('PlannedIntakeShortfall', () => {
  it('greift nicht wenn Restvorlauf > 50 %', () => {
    const intake: PlannedIntake = {
      id: 'PI', label: 'Evacuation',
      arrivalPoint: [11.78, 48.35],
      announcedAt: 0, firstArrivalAt: 1440,
      flights: [], totalPatients: 100, prepWindowMin: 1440,
      status: 'preparing', bufferRatio: 0.15,
    };
    const h = mkHospital('H', { coords: [11.78, 48.35] });
    const alerts = rulePlannedIntakeShortfall([intake], [h], 100);
    expect(alerts).toEqual([]);
  });

  it('warn wenn bei Rest<50% Vorlauf freier Puffer nicht reicht', () => {
    const intake: PlannedIntake = {
      id: 'PI', label: 'Evacuation',
      arrivalPoint: [11.78, 48.35],
      announcedAt: 0, firstArrivalAt: 1440,
      flights: [], totalPatients: 300, prepWindowMin: 1440,
      status: 'preparing', bufferRatio: 0.15,
    };
    const h = mkHospital('H', {
      coords: [11.78, 48.35],
      capacity: {
        notaufnahme: cap(5, 5),
        op_saal: cap(5, 5),
        its_bett: cap(5, 5),
        normal_bett: cap(50, 50),
      },
    });
    const alerts = rulePlannedIntakeShortfall([intake], [h], 1000);
    expect(alerts.length).toBeGreaterThan(0);
  });
});

describe('EscalationOpportunity', () => {
  it('info wenn Haus >= 80 % mit ungenutzter Surge-Reserve', () => {
    const h = mkHospital('H', {
      capacity: {
        notaufnahme: cap(10, 9),
        op_saal: cap(10, 9),
        its_bett: cap(10, 9),
        normal_bett: cap(100, 85),
      },
    });
    const alerts = ruleEscalationOpportunity([h], 0);
    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe('info');
  });

  it('kein Alert wenn Surge bereits aktiv (alle Ressourcen)', () => {
    const h = mkHospital('H', {
      capacity: {
        notaufnahme: cap(10, 9, 2, true),
        op_saal: cap(10, 9, 2, true),
        its_bett: cap(10, 9, 2, true),
        normal_bett: cap(100, 85, 20, true),
      },
    });
    expect(ruleEscalationOpportunity([h], 0)).toEqual([]);
  });
});

describe('CapacityTrend', () => {
  it('warn wenn Auslastung in 30 Min um >=15 pp steigt', () => {
    const hist: SimState['occupancyHistory'] = [
      { simTime: 5, totals: {} as any, overall: 0.6, critCount: 0 },
      { simTime: 10, totals: {} as any, overall: 0.62, critCount: 0 },
      { simTime: 35, totals: {} as any, overall: 0.62, critCount: 0 },
      { simTime: 40, totals: {} as any, overall: 0.78, critCount: 0 },
    ];
    const alerts = ruleCapacityTrend([], hist, 40);
    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe('warn');
  });
});

describe('Dedup + Resolve', () => {
  it('dedup verhindert Doppel-Alert innerhalb 10 Sim-Min', () => {
    const a1 = ruleHospitalSaturation([mkHospital('H', {
      capacity: {
        notaufnahme: cap(10, 10),
        op_saal: cap(10, 5),
        its_bett: cap(10, 5),
        normal_bett: cap(100, 50),
      }
    })], 0);
    const merged1 = mergeAlertsWithDedup([], a1, 0);
    expect(merged1.length).toBe(a1.length);

    const a2 = ruleHospitalSaturation([mkHospital('H', {
      capacity: {
        notaufnahme: cap(10, 10),
        op_saal: cap(10, 5),
        its_bett: cap(10, 5),
        normal_bett: cap(100, 50),
      }
    })], 5);
    const merged2 = mergeAlertsWithDedup(merged1, a2, 5);
    expect(merged2.length).toBe(merged1.length); // Dedup greift
  });

  it('resolveStaleAlerts setzt resolvedAt fuer nicht mehr aktive Alerts', () => {
    const a1 = ruleHospitalSaturation([mkHospital('H', {
      capacity: {
        notaufnahme: cap(10, 10),
        op_saal: cap(10, 5),
        its_bett: cap(10, 5),
        normal_bett: cap(100, 50),
      }
    })], 0);
    const merged = mergeAlertsWithDedup([], a1, 0);
    // Keine aktiven Keys mehr
    const resolved = resolveStaleAlerts(merged, alertKeys([]), 20);
    expect(resolved.every((r) => r.resolvedAt === 20)).toBe(true);
  });
});

describe('runAllRules + SimState integration', () => {
  it('liefert gemischte Alerts aus allen Quellen', () => {
    const s = emptySimState();
    s.hospitals['H-BUSY'] = mkHospital('H-BUSY', {
      capacity: {
        notaufnahme: cap(10, 10),
        op_saal: cap(10, 9),
        its_bett: cap(10, 9),
        normal_bett: cap(100, 95),
      },
    });
    s.patients.push({
      id: 'P', triage: 'T1', needs: { notaufnahme: true, op_saal: false, its_bett: false, normal_bett: false },
      treatmentMin: 60, source: 'incident', spawnedAt: 0, status: 'onScene', isStableForTransfer: false,
    });
    s.simTime = 30;
    const alerts = runAllRules(s);
    expect(alerts.some((a) => a.ruleName === 'HospitalSaturation')).toBe(true);
    expect(alerts.some((a) => a.ruleName === 'UnassignedPatients')).toBe(true);
  });
});
