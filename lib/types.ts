// Verbindliche Domain-Typen laut doc/DATA_MODEL.md.
// Aenderungen hier muessen mit DATA_MODEL.md synchron bleiben.

// ============================================================================
// §1 Grundtypen
// ============================================================================

export type Triage = 'T1' | 'T2' | 'T3' | 'T4';

export type ResourceType =
  | 'notaufnahme'
  | 'op_saal'
  | 'its_bett'
  | 'normal_bett';

export type PatientStatus =
  | 'onScene'
  | 'transport'
  | 'inTreatment'
  | 'transferring'
  | 'discharged'
  | 'deceased';

export type HospitalTier = 'maximal' | 'schwerpunkt' | 'regel' | 'grund';

// ============================================================================
// §2 Patient
// ============================================================================

export interface Patient {
  id: string;
  triage: Triage;
  needs: Record<ResourceType, boolean>;
  treatmentMin: number;
  source: 'baseline' | 'incident' | 'planned-intake';
  sourceRefId?: string;
  spawnedAt: number;
  status: PatientStatus;
  assignedHospitalId?: string;
  transferTargetHospitalId?: string;
  routeId?: string;
  arrivedAt?: number;
  dischargeAt?: number;
  isStableForTransfer: boolean;
}

// ============================================================================
// §3 Capacity
// ============================================================================

export interface Capacity {
  total: number;
  occupied: number;
  surgeReserve: number;
  surgeActive: boolean;
}

// ============================================================================
// §4 Hospital
// ============================================================================

export interface HospitalAddress {
  street: string;
  city: string;
  plz: string;
}

export interface HospitalFlags {
  hasOP: boolean;
  hasITS: boolean;
  hasNotaufnahme: boolean;
  hasBurnCenter: boolean;
  hasNeurochir: boolean;
  hasPaediatrie: boolean;
}

export interface HospitalStaff {
  onDuty: number;
  onCall: number;
}

export type HospitalEscalation =
  | 'normal'
  | 'erhoeht'
  | 'manv-1'
  | 'manv-2'
  | 'katastrophe';

export interface Hospital {
  id: string;
  name: string;
  kind: string;
  tier: HospitalTier;
  coords: [number, number];
  address: HospitalAddress;
  capacity: Record<ResourceType, Capacity>;
  abteilungen: string[];
  flags: HospitalFlags;
  staff: HospitalStaff;
  escalation: HospitalEscalation;
  electiveActive: boolean;
  divertActive: boolean;
}

// ============================================================================
// §5 Incident (MANV)
// ============================================================================

export type IncidentType =
  | 'verkehrsunfall'
  | 'amoklauf'
  | 'industriebrand'
  | 'naturkatastrophe'
  | 'panik';

export type ArrivalCurve = 'immediate' | 'gauss' | 'plateau';

export interface NeedsProfile {
  opShare: number;
  itsShare: number;
  notaufnahmeShare: number;
  normalBedShare: number;
}

export interface Incident {
  id: string;
  type: IncidentType;
  label: string;
  location: [number, number];
  startedAt: number;
  estimatedCasualties: number;
  arrivalCurve: ArrivalCurve;
  durationMin: number;
  triageMix: Record<Triage, number>;
  needsProfile: NeedsProfile;
}

// ============================================================================
// §6 PlannedIntake
// ============================================================================

export interface FlightArrival {
  idx: number;
  etaMin: number;
  patientCount: number;
  triageMix: Record<Triage, number>;
  needsProfile: NeedsProfile;
}

export type PlannedIntakeStatus =
  | 'announced'
  | 'preparing'
  | 'arriving'
  | 'complete'
  | 'cancelled';

export interface PlannedIntake {
  id: string;
  label: string;
  arrivalPoint: [number, number];
  announcedAt: number;
  firstArrivalAt: number;
  flights: FlightArrival[];
  totalPatients: number;
  prepWindowMin: number;
  status: PlannedIntakeStatus;
  bufferRatio: number;
}

// ============================================================================
// §7 Alert
// ============================================================================

export type AlertSeverity = 'info' | 'warn' | 'critical';

export type AlertScope =
  | 'hospital'
  | 'region'
  | 'system'
  | 'intake'
  | 'conflict';

export interface Alert {
  id: string;
  ruleName: string;
  severity: AlertSeverity;
  scope: AlertScope;
  scopeRef: string;
  firedAt: number;
  title: string;
  detail: string;
  resolvedAt?: number;
  linkedRecommendations: string[];
}

// ============================================================================
// §8 Recommendation
// ============================================================================

export type MeasureAction =
  | 'activate-surge'
  | 'reroute-manv'
  | 'relocate-stable-batch'
  | 'prepare-reception'
  | 'staff-callup'
  | 'cancel-elective'
  | 'divert-normal-admissions'
  | 'activate-reserve-hospital'
  | 'alert-adjacent'
  | 'request-cross-region';

export interface ExpectedImpact {
  bedsGained?: number;
  timeBoughtMin?: number;
  patientsRerouted?: number;
  patientsRelocated?: number;
  occupancyDeltaPp?: number;
}

export interface Recommendation {
  id: string;
  triggeredBy: string[];
  action: MeasureAction;
  targetHospitalIds: string[];
  intakeRefId?: string;
  title: string;
  rationale: string;
  expectedImpact: ExpectedImpact;
  effortLevel: 'low' | 'medium' | 'high';
  executable: boolean;
  executedAt?: number;
}

// ============================================================================
// §9 Event (Audit)
// ============================================================================

export type EventKind =
  | 'sim.tick'
  | 'sim.paused'
  | 'sim.resumed'
  | 'sim.speed-changed'
  | 'incident.started'
  | 'incident.ended'
  | 'intake.announced'
  | 'intake.flight-landed'
  | 'intake.completed'
  | 'patient.spawned'
  | 'patient.assigned'
  | 'patient.arrived'
  | 'patient.treated'
  | 'patient.discharged'
  | 'patient.deceased'
  | 'relocation.planned'
  | 'relocation.executed'
  | 'relocation.cancelled'
  | 'recommendation.generated'
  | 'recommendation.executed'
  | 'measure.applied'
  | 'hospital.escalated'
  | 'hospital.surge-activated'
  | 'forkPreview.computed'
  | 'user.showcase-started';

export type EventScope =
  | 'system'
  | 'hospital'
  | 'patient'
  | 'incident'
  | 'intake';

export interface Event {
  id: string;
  t: number;
  wallClockISO: string;
  kind: EventKind;
  scope: EventScope;
  scopeRef?: string;
  payload: Record<string, unknown>;
  causedBy?: string;
  triggeredBy?: 'operator' | 'simulation' | 'rule';
}

// ============================================================================
// §10 Route
// ============================================================================

export interface Route {
  id: string;
  from: [number, number];
  to: [number, number];
  polyline: Array<[number, number]>;
  durationSec: number;
  distanceM: number;
  computedAt: string;
  source: 'osrm' | 'haversine-fallback';
}

// ============================================================================
// §11 Simulation-State (Store)
// ============================================================================

// ForkPreviewResult laut doc/SIMULATION.md §8 — konkret ausimplementiert
// in Phase 9 (lib/simulation/fork-preview.ts).
export interface TimelinePoint {
  simTime: number;
  overall: number;
  notaufnahme: number;
  op_saal: number;
  its_bett: number;
  normal_bett: number;
}

export interface ForkPreviewResult {
  recommendationId: string;
  computedAt: number;
  horizonMin: number;
  curveWithout: TimelinePoint[];
  curveWith: TimelinePoint[];
  diff: {
    peakLoadDelta: number;
    critCountDelta: number;
    bedsFreedDelta: number;
  };
}

export interface OccupancyHistoryEntry {
  simTime: number;
  totals: Record<ResourceType, { total: number; occupied: number }>;
  overall: number;
  critCount: number;
}

export interface SimFilters {
  bedThresholds: { min: number; max: number };
  triage: Record<Triage, boolean>;
}

export interface SimState {
  simTime: number;
  speed: number;
  isRunning: boolean;
  seed: number;

  hospitals: Record<string, Hospital>;
  patients: Patient[];
  incidents: Incident[];
  plannedIntakes: PlannedIntake[];

  routes: Record<string, Route>;

  alerts: Alert[];
  recommendations: Recommendation[];

  occupancyHistory: OccupancyHistoryEntry[];

  forkPreviewCache: Record<string, ForkPreviewResult>;

  filters: SimFilters;

  // UI-State (non-sim, aber im Store fuer globalen Zugriff).
  selectedHospitalId?: string;
  hoveredRecommendationId?: string;
}
