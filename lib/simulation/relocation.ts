// Relocation-Engine: bei PlannedIntake.status === 'preparing' plant sie
// pro Tick eine Verlegungs-Welle aus flughafennahen Kliniken in entferntere
// Häuser. SIMULATION.md §5.

import type {
  Hospital,
  Patient,
  PlannedIntake,
  ResourceType,
  SimState,
} from '@/lib/types';
import { RESOURCE_TYPES } from '@/lib/data/resources';
import { haversine, type LngLat } from '@/lib/geo';
import { freeBeds, primaryResource } from './router';

export const CLUSTER_RADIUS_KM = 30;
export const RELOCATIONS_PER_SOURCE_PER_TICK = 4;

// Gewichtetes Mittel der Needs-Profile aller Fluege.
export function aggregateNeedsProfile(
  intake: PlannedIntake
): { opShare: number; itsShare: number; notaufnahmeShare: number; normalBedShare: number } {
  if (intake.flights.length === 0) {
    return { opShare: 0, itsShare: 0, notaufnahmeShare: 0, normalBedShare: 1 };
  }
  let op = 0,
    its = 0,
    na = 0,
    nb = 0,
    tot = 0;
  for (const f of intake.flights) {
    op += f.needsProfile.opShare * f.patientCount;
    its += f.needsProfile.itsShare * f.patientCount;
    na += f.needsProfile.notaufnahmeShare * f.patientCount;
    nb += f.needsProfile.normalBedShare * f.patientCount;
    tot += f.patientCount;
  }
  if (tot === 0) return { opShare: 0, itsShare: 0, notaufnahmeShare: 0, normalBedShare: 1 };
  return {
    opShare: op / tot,
    itsShare: its / tot,
    notaufnahmeShare: na / tot,
    normalBedShare: nb / tot,
  };
}

// SIMULATION.md §5.2
export function computeTargetFreeBeds(
  intake: PlannedIntake
): Record<ResourceType, number> {
  const total = intake.totalPatients * (1 + intake.bufferRatio);
  const p = aggregateNeedsProfile(intake);
  return {
    op_saal: Math.ceil(total * p.opShare),
    its_bett: Math.ceil(total * p.itsShare),
    notaufnahme: Math.ceil(total * p.notaufnahmeShare),
    normal_bett: Math.ceil(total * p.normalBedShare),
  };
}

export function hospitalsNear(
  point: LngLat,
  hospitals: Hospital[],
  radiusKm: number
): Hospital[] {
  return hospitals.filter((h) => haversine(point, h.coords) <= radiusKm);
}

export function hospitalsFar(
  point: LngLat,
  hospitals: Hospital[],
  radiusKm: number
): Hospital[] {
  return hospitals.filter((h) => haversine(point, h.coords) > radiusKm);
}

interface RelocationPlan {
  patient: Patient;
  source: Hospital;
  target: Hospital;
  distanceKm: number;
}

// Findet einen geeigneten Ziel-Kandidaten ausserhalb des Clusters fuer einen
// stabilen Patienten. Scoring: naehester Kandidat mit ausreichend freier
// Kapazitaet in der Primary-Ressource.
function findTarget(
  patient: Patient,
  source: Hospital,
  far: Hospital[],
  usedByThisTick: Record<string, number>
): Hospital | null {
  const pr = primaryResource(patient);
  const candidates = far.filter((h) => {
    if (h.id === source.id) return false;
    if (!h.flags.hasNotaufnahme && patient.needs.notaufnahme) return false;
    const cap = h.capacity[pr];
    if (!cap || freeBeds(cap) <= (usedByThisTick[h.id] ?? 0)) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const da = haversine(source.coords, a.coords);
    const db = haversine(source.coords, b.coords);
    return da - db;
  });
  return candidates[0];
}

// Plant fuer eine einzelne Intake eine Welle. Gibt zurueck wie viele
// Verlegungen gestartet wurden.
export function runRelocationWave(
  state: SimState,
  intake: PlannedIntake,
  maxTotalThisTick = 20
): number {
  if (intake.status !== 'preparing') return 0;
  const hospitals = Object.values(state.hospitals);
  const near = hospitalsNear(intake.arrivalPoint, hospitals, CLUSTER_RADIUS_KM);
  const far = hospitalsFar(intake.arrivalPoint, hospitals, CLUSTER_RADIUS_KM);
  if (near.length === 0 || far.length === 0) return 0;

  const perSourceCount: Record<string, number> = {};
  const targetUsedByThisTick: Record<string, number> = {};
  let started = 0;

  // Fuer jede Source im Cluster die besten Kandidaten nehmen.
  const stableBySource = new Map<string, Patient[]>();
  for (const p of state.patients) {
    if (p.status !== 'inTreatment') continue;
    if (!p.isStableForTransfer) continue;
    if (p.needs.op_saal) continue; // kein Transfer bei aktivem OP-Bedarf
    const src = p.assignedHospitalId ? state.hospitals[p.assignedHospitalId] : undefined;
    if (!src) continue;
    const inCluster = near.some((h) => h.id === src.id);
    if (!inCluster) continue;
    const list = stableBySource.get(src.id) ?? [];
    list.push(p);
    stableBySource.set(src.id, list);
  }

  // T3 vor T2, lange Behandlungszeit zuerst.
  for (const list of stableBySource.values()) {
    list.sort((a, b) => {
      if (a.triage !== b.triage) return a.triage === 'T3' ? -1 : 1;
      return (a.arrivedAt ?? 0) - (b.arrivedAt ?? 0);
    });
  }

  for (const source of near) {
    if (started >= maxTotalThisTick) break;
    const candidates = stableBySource.get(source.id) ?? [];
    for (const p of candidates) {
      if (started >= maxTotalThisTick) break;
      if ((perSourceCount[source.id] ?? 0) >= RELOCATIONS_PER_SOURCE_PER_TICK) break;
      const target = findTarget(p, source, far, targetUsedByThisTick);
      if (!target) continue;
      // Transferring starten: Source-Bett sofort freigeben (Patient verlaesst Haus).
      for (const r of RESOURCE_TYPES) {
        if (p.needs[r] && source.capacity[r].occupied > 0) {
          source.capacity[r].occupied -= 1;
        }
      }
      const distKm = haversine(source.coords, target.coords);
      const durMin = (distKm / 55) * 60 + 2; // 55 km/h + 2 min Handover
      p.status = 'transferring';
      p.transferTargetHospitalId = target.id;
      p.arrivedAt = state.simTime + durMin;
      // dischargeAt wird bei Ankunft neu gesetzt (Engine §5.6).
      perSourceCount[source.id] = (perSourceCount[source.id] ?? 0) + 1;
      targetUsedByThisTick[target.id] = (targetUsedByThisTick[target.id] ?? 0) + 1;
      started++;
    }
  }
  return started;
}

// Haupt-Einstiegspunkt fuer die Engine: laeuft ueber alle Intakes mit Status
// 'preparing' und fuehrt pro Tick max. maxTotalThisTick Verlegungen aus.
export function relocationStep(state: SimState, maxTotalThisTick = 20): number {
  let total = 0;
  for (const intake of state.plannedIntakes) {
    if (intake.status !== 'preparing') continue;
    total += runRelocationWave(state, intake, maxTotalThisTick - total);
    if (total >= maxTotalThisTick) break;
  }
  return total;
}

// Hilfs-Export fuer Tests/Code.
export type { RelocationPlan };
