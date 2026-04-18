// Kandidaten-Filter + Scoring fuer die Allocation-Engine.
// Rein funktional, keine Side-Effects. SIMULATION.md §4.1 + §4.2.

import type {
  Capacity,
  Hospital,
  HospitalTier,
  Patient,
  ResourceType,
  Triage,
} from '@/lib/types';
import { RESOURCE_TYPES } from '@/lib/data/resources';
import { haversine } from '@/lib/geo';

// Max. Distanz-Cutoff pro Triage (km) laut SIMULATION.md §4.1.
export const DISTANCE_CUTOFF_KM: Record<Triage, number> = {
  T1: 60,
  T2: 40,
  T3: 25,
  T4: 15,
};

// Cascade-Multiplikatoren / Caps.
export const CASCADE_DISTANCE_MULTIPLIER = 2;
export const CASCADE_DISTANCE_MAX_KM = 120;

// Wasser-Fuellgrenze pro Klinik pro Tick.
export const QUOTA_PER_TICK: Record<Triage, number> = {
  T1: 3,
  T2: 5,
  T3: 8,
  T4: 10,
};
export const CASCADE_QUOTA_MULTIPLIER = 2;

// Scoring-Gewichte laut §4.2.
export const W_DIST = 0.45;
export const W_FREE = 0.3;
export const W_TIER = 0.15;
export const W_LOAD = 0.1;

// Primaer-Ressource eines Patienten (fuer Scoring der freien Quote).
// Priority: ITS > OP > Notaufnahme > Normal.
const RESOURCE_PRIORITY: ResourceType[] = [
  'its_bett',
  'op_saal',
  'notaufnahme',
  'normal_bett',
];

export function primaryResource(patient: Patient): ResourceType {
  for (const r of RESOURCE_PRIORITY) {
    if (patient.needs[r]) return r;
  }
  // Fallback: normal_bett
  return 'normal_bett';
}

// Effektive Gesamt-Kapazitaet einer Ressource (mit Surge-Reserve falls aktiv).
export function effectiveTotal(cap: Capacity): number {
  return cap.total + (cap.surgeActive ? cap.surgeReserve : 0);
}

export function freeBeds(cap: Capacity): number {
  return Math.max(0, effectiveTotal(cap) - cap.occupied);
}

export function freeFraction(cap: Capacity): number {
  const eff = effectiveTotal(cap);
  if (eff === 0) return 0;
  return Math.max(0, eff - cap.occupied) / eff;
}

// TierFit-Score fuer einen Patienten. T1 bevorzugt Maximalversorger stark,
// T4 spielt kaum eine Rolle.
export function tierFitScore(tier: HospitalTier, triage: Triage): number {
  const base: Record<HospitalTier, number> = {
    maximal: 1,
    schwerpunkt: 0.7,
    regel: 0.4,
    grund: 0.15,
  };
  const weight: Record<Triage, number> = { T1: 1, T2: 0.8, T3: 0.5, T4: 0.3 };
  return base[tier] * weight[triage];
}

export function overallLoad(
  capacity: Record<ResourceType, Capacity>
): number {
  let tot = 0;
  let occ = 0;
  for (const r of RESOURCE_TYPES) {
    tot += effectiveTotal(capacity[r]);
    occ += capacity[r].occupied;
  }
  return tot === 0 ? 0 : Math.min(1, occ / tot);
}

// Cascade-Stufen laut SIMULATION.md §4.4.
export type CascadeStage = 'none' | 'distance' | 'quota' | 'load' | 'surge';

export interface CandidateFilterOptions {
  stage: CascadeStage;
  // Muss aktuell schon zugewiesene Patienten in diesem Tick kennen, um Quota
  // korrekt zu pruefen. Map hospitalId → zugewiesene Zahl.
  assignedThisTick: Record<string, number>;
}

// Prueft Hard-Constraints: bietet die Klinik die benoetigten Ressourcen
// ueberhaupt? (Flag + total > 0)
export function providesRequiredResources(
  hospital: Hospital,
  patient: Patient
): boolean {
  for (const r of RESOURCE_TYPES) {
    if (!patient.needs[r]) continue;
    const cap = hospital.capacity[r];
    if (!cap || cap.total <= 0) return false;
  }
  return true;
}

// Hat mindestens eine benoetigte Ressource noch freie Kapazitaet?
// In Cascade-Stage 'load' erlaubt bis eff-1, in 'surge' wird der Kandidat
// auch bei voller Ressource akzeptiert.
export function hasAnyFreeResource(
  hospital: Hospital,
  patient: Patient,
  stage: CascadeStage
): boolean {
  if (stage === 'surge') return true;
  for (const r of RESOURCE_TYPES) {
    if (!patient.needs[r]) continue;
    const cap = hospital.capacity[r];
    if (freeBeds(cap) > 0) return true;
  }
  return stage === 'load';
}

// Distanz-Cutoff mit Cascade-Stage.
export function distanceCutoffKm(triage: Triage, stage: CascadeStage): number {
  const base = DISTANCE_CUTOFF_KM[triage];
  if (stage === 'none') return base;
  // Ab 'distance' (und weiter) gilt der erweiterte Cutoff.
  return Math.min(base * CASCADE_DISTANCE_MULTIPLIER, CASCADE_DISTANCE_MAX_KM);
}

// Max. zusaetzliche Patienten die dieser Klinik in diesem Tick noch zugewiesen
// werden koennen.
export function remainingQuota(
  triage: Triage,
  stage: CascadeStage,
  hospitalId: string,
  assignedThisTick: Record<string, number>
): number {
  if (stage === 'surge') return Number.POSITIVE_INFINITY;
  const base = QUOTA_PER_TICK[triage];
  const cap =
    stage === 'quota' || stage === 'load'
      ? base * CASCADE_QUOTA_MULTIPLIER
      : base;
  const used = assignedThisTick[hospitalId] ?? 0;
  return Math.max(0, cap - used);
}

// Hard-Constraint: T1 nur zu maximal/schwerpunkt.
export function tierAllowedForTriage(
  tier: HospitalTier,
  triage: Triage
): boolean {
  if (triage === 'T1') return tier === 'maximal' || tier === 'schwerpunkt';
  return true;
}

export interface CandidateResult {
  hospital: Hospital;
  distanceKm: number;
  score: number;
}

export function scoreCandidate(
  hospital: Hospital,
  patient: Patient,
  distanceKm: number,
  maxDist: number,
  opts?: {
    // Cluster-Malus: Kliniken innerhalb `clusterMalusKm` um `clusterCenter`
    // werden beim Scoring abgewertet. Wird bei planned-intake-Allocation
    // verwendet, damit Soldaten nicht alle zu den naechsten Flughafen-
    // Kliniken gehen, sondern breit in die Muenchner Klinik-Landschaft
    // verteilt werden.
    clusterCenter?: [number, number];
    clusterMalusKm?: number;
    clusterMalusWeight?: number;
  }
): number {
  const pr = primaryResource(patient);
  const free = freeFraction(hospital.capacity[pr]);
  const load = overallLoad(hospital.capacity);
  const tier = tierFitScore(hospital.tier, patient.triage);
  const distTerm = maxDist > 0 ? 1 - distanceKm / maxDist : 1;
  let score =
    W_DIST * distTerm + W_FREE * free + W_TIER * tier - W_LOAD * load * load;

  if (opts?.clusterCenter && opts.clusterMalusKm) {
    const distFromCenter = haversine(opts.clusterCenter, hospital.coords);
    if (distFromCenter < opts.clusterMalusKm) {
      const malus = opts.clusterMalusWeight ?? 0.35;
      // Lineare Staerke: direkt am Flughafen = voller Malus, am Rand = 0.
      const strength = 1 - distFromCenter / opts.clusterMalusKm;
      score -= malus * strength;
    }
  }

  return score;
}

export interface ScoreOptions {
  clusterCenter?: [number, number];
  clusterMalusKm?: number;
  clusterMalusWeight?: number;
}

// Liefert eine nach Score absteigend sortierte Kandidatenliste.
export function rankCandidates(
  patient: Patient,
  patientLocation: [number, number],
  hospitals: Hospital[],
  opts: CandidateFilterOptions & ScoreOptions
): CandidateResult[] {
  const cutoff = distanceCutoffKm(patient.triage, opts.stage);
  const out: CandidateResult[] = [];
  for (const h of hospitals) {
    if (!tierAllowedForTriage(h.tier, patient.triage)) continue;
    if (!providesRequiredResources(h, patient)) continue;
    if (!hasAnyFreeResource(h, patient, opts.stage)) continue;
    const dist = haversine(patientLocation, h.coords);
    if (dist > cutoff) continue;
    if (remainingQuota(patient.triage, opts.stage, h.id, opts.assignedThisTick) <= 0) continue;
    out.push({
      hospital: h,
      distanceKm: dist,
      score: scoreCandidate(h, patient, dist, cutoff, {
        clusterCenter: opts.clusterCenter,
        clusterMalusKm: opts.clusterMalusKm,
        clusterMalusWeight: opts.clusterMalusWeight,
      }),
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
