// Allocation-Engine: Triage-First Water-Filling mit Cascade.
// Gemaess SIMULATION.md §4. Pure Funktionen, state wird in-place mutiert.

import type { Hospital, Patient, ResourceType, Triage } from '@/lib/types';
import { RESOURCE_TYPES } from '@/lib/data/resources';
import { haversine } from '@/lib/geo';
import {
  DISTANCE_CUTOFF_KM,
  rankCandidates,
  primaryResource,
  freeBeds,
  type CascadeStage,
} from './router';

// Stabilisierungszeit pro Triage (Minuten) laut SIMULATION.md §4.5.
export const STABILIZATION_MIN: Record<Triage, number> = {
  T1: 8,
  T2: 5,
  T3: 2,
  T4: 1,
};
export const TRANSPORT_AVG_SPEED_KMH = 55;

const TRIAGE_ORDER: Triage[] = ['T1', 'T2', 'T3', 'T4'];
const STAGE_ORDER: CascadeStage[] = ['none', 'distance', 'quota', 'load', 'surge'];

export interface AllocationContext {
  hospitals: Record<string, Hospital>;
  incidents: Array<{ id: string; location: [number, number] }>;
  simTime: number;
  // Assign-Counter pro Tick (verhindert Quota-Ueberschreitung).
  assignedThisTick: Record<string, number>;
}

function patientLocation(
  patient: Patient,
  ctx: AllocationContext
): [number, number] | null {
  if (patient.source === 'incident' && patient.sourceRefId) {
    const inc = ctx.incidents.find((i) => i.id === patient.sourceRefId);
    if (inc) return inc.location;
  }
  // Baseline / planned-intake: ggf. extern gesetzt
  return null;
}

// Belegt ein Bett der benoetigten Ressourcen an der Klinik.
// Primary-Ressource wird zuerst belegt, danach weitere benoetigte (falls frei).
function occupyBeds(
  hospital: Hospital,
  patient: Patient
): { primary: ResourceType; occupied: ResourceType[] } {
  const pr = primaryResource(patient);
  const capPr = hospital.capacity[pr];
  capPr.occupied += 1; // auch > total im Surge-Fall erlaubt
  const occupied: ResourceType[] = [pr];
  for (const r of RESOURCE_TYPES) {
    if (r === pr) continue;
    if (!patient.needs[r]) continue;
    const cap = hospital.capacity[r];
    if (freeBeds(cap) > 0) {
      cap.occupied += 1;
      occupied.push(r);
    }
  }
  return { primary: pr, occupied };
}

// Weist einen einzelnen Patienten einer Klinik zu. Mutiert sowohl Patient als
// auch Klinik-Kapazitaet. Liefert true bei Erfolg.
export function allocatePatient(
  patient: Patient,
  ctx: AllocationContext
): boolean {
  if (patient.status !== 'onScene' || patient.assignedHospitalId) return false;
  const loc = patientLocation(patient, ctx);
  if (!loc) return false;

  const hospitals = Object.values(ctx.hospitals);
  for (const stage of STAGE_ORDER) {
    const ranked = rankCandidates(patient, loc, hospitals, {
      stage,
      assignedThisTick: ctx.assignedThisTick,
    });
    if (ranked.length === 0) continue;
    const best = ranked[0];
    // Zuweisen
    const dist = best.distanceKm;
    const eta = dist / TRANSPORT_AVG_SPEED_KMH * 60 + STABILIZATION_MIN[patient.triage];
    patient.assignedHospitalId = best.hospital.id;
    patient.status = 'transport';
    patient.arrivedAt = ctx.simTime + eta;
    patient.dischargeAt = patient.arrivedAt + patient.treatmentMin;
    occupyBeds(best.hospital, patient);
    ctx.assignedThisTick[best.hospital.id] =
      (ctx.assignedThisTick[best.hospital.id] ?? 0) + 1;
    return true;
  }
  return false;
}

// Verteilt alle unzugewiesenen onScene-Patienten in einem Tick nach
// Triage-Prioritaet. T1 zuerst.
export function allocateBatch(
  patients: Patient[],
  ctx: AllocationContext
): { allocated: number; failed: number } {
  let allocated = 0;
  let failed = 0;
  for (const triage of TRIAGE_ORDER) {
    for (const p of patients) {
      if (p.status !== 'onScene' || p.assignedHospitalId) continue;
      if (p.triage !== triage) continue;
      const ok = allocatePatient(p, ctx);
      if (ok) allocated++;
      else failed++;
    }
  }
  return { allocated, failed };
}

// Helper fuer Test-Setups / manuelle Sim-Steuerung: baut aus einem Incident
// und Triage-Mix einen Patientenstapel.
export function spawnIncidentPatients(
  incidentId: string,
  casualties: number,
  triageMix: Record<Triage, number>,
  needsProfile: {
    opShare: number;
    itsShare: number;
    notaufnahmeShare: number;
    normalBedShare: number;
  },
  simTime: number,
  rng: () => number
): Patient[] {
  const patients: Patient[] = [];
  for (let i = 0; i < casualties; i++) {
    const triage = pickWeighted(triageMix, rng);
    const needs: Record<ResourceType, boolean> = {
      notaufnahme: rng() < needsProfile.notaufnahmeShare,
      op_saal: rng() < needsProfile.opShare,
      its_bett: rng() < needsProfile.itsShare,
      normal_bett: rng() < needsProfile.normalBedShare,
    };
    // Mindestens eine Ressource muss gebraucht werden.
    if (!needs.notaufnahme && !needs.op_saal && !needs.its_bett && !needs.normal_bett) {
      needs.normal_bett = true;
    }
    const treatmentMin =
      triage === 'T1'
        ? 360 + rng() * 180
        : triage === 'T2'
          ? 180 + rng() * 120
          : triage === 'T3'
            ? 90 + rng() * 60
            : 30 + rng() * 30;
    patients.push({
      id: `P-${incidentId}-${String(i + 1).padStart(4, '0')}`,
      triage,
      needs,
      treatmentMin: Math.round(treatmentMin),
      source: 'incident',
      sourceRefId: incidentId,
      spawnedAt: simTime,
      status: 'onScene',
      isStableForTransfer: false,
    });
  }
  return patients;
}

function pickWeighted<K extends string>(
  weights: Record<K, number>,
  rng: () => number
): K {
  const entries = Object.entries(weights) as Array<[K, number]>;
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  const r = rng() * sum;
  let acc = 0;
  for (const [key, w] of entries) {
    acc += w;
    if (r <= acc) return key;
  }
  return entries[entries.length - 1][0];
}

// Re-Export fuer Tests.
export { DISTANCE_CUTOFF_KM, haversine };
