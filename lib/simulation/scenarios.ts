// MANV-Szenarien als Factory-Funktionen laut doc/SCENARIOS.md §1.
// Reine Daten — keine Seiteneffekte. Aktivierung erzeugt einen Incident.

import type { Incident, IncidentType, Triage } from '@/lib/types';

export interface ScenarioTemplate {
  id: string;
  label: string;
  type: IncidentType;
  location: [number, number];
  durationMin: number;
  arrivalCurve: Incident['arrivalCurve'];
  estimatedCasualties: number;
  triageMix: Record<Triage, number>;
  needsProfile: Incident['needsProfile'];
}

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: 'amok-innenstadt',
    label: 'Amoklauf Innenstadt',
    type: 'amoklauf',
    location: [11.5755, 48.1374],
    durationMin: 15,
    arrivalCurve: 'immediate',
    estimatedCasualties: 35,
    triageMix: { T1: 0.4, T2: 0.35, T3: 0.2, T4: 0.05 },
    needsProfile: {
      opShare: 0.5,
      itsShare: 0.25,
      notaufnahmeShare: 0.2,
      normalBedShare: 0.05,
    },
  },
  {
    id: 'bus-a9-ingolstadt',
    label: 'Busunglueck A9 Ingolstadt',
    type: 'verkehrsunfall',
    location: [11.4218, 48.7665],
    durationMin: 90,
    arrivalCurve: 'gauss',
    estimatedCasualties: 60,
    triageMix: { T1: 0.15, T2: 0.35, T3: 0.45, T4: 0.05 },
    needsProfile: {
      opShare: 0.3,
      itsShare: 0.1,
      notaufnahmeShare: 0.35,
      normalBedShare: 0.25,
    },
  },
  {
    id: 'sbahn-ostbahnhof',
    label: 'S-Bahn-Auffahrunfall Ostbahnhof',
    type: 'verkehrsunfall',
    location: [11.6043, 48.1269],
    durationMin: 20,
    arrivalCurve: 'immediate',
    estimatedCasualties: 180,
    triageMix: { T1: 0.1, T2: 0.3, T3: 0.55, T4: 0.05 },
    needsProfile: {
      opShare: 0.2,
      itsShare: 0.1,
      notaufnahmeShare: 0.5,
      normalBedShare: 0.2,
    },
  },
  {
    id: 'bmw-milbertshofen',
    label: 'Explosion BMW-Werk Milbertshofen',
    type: 'industriebrand',
    location: [11.557, 48.1758],
    durationMin: 180,
    arrivalCurve: 'plateau',
    estimatedCasualties: 70,
    triageMix: { T1: 0.25, T2: 0.4, T3: 0.3, T4: 0.05 },
    needsProfile: {
      opShare: 0.35,
      itsShare: 0.3,
      notaufnahmeShare: 0.25,
      normalBedShare: 0.1,
    },
  },
  {
    id: 'allianz-arena-panik',
    label: 'Massenpanik Allianz Arena',
    type: 'panik',
    location: [11.6247, 48.2188],
    durationMin: 60,
    arrivalCurve: 'gauss',
    estimatedCasualties: 220,
    triageMix: { T1: 0.05, T2: 0.2, T3: 0.7, T4: 0.05 },
    needsProfile: {
      opShare: 0.1,
      itsShare: 0.05,
      notaufnahmeShare: 0.6,
      normalBedShare: 0.25,
    },
  },
];

export interface PlaceHint {
  name: string;
  coords: [number, number];
}

// Kuratierte Orte fuer "Zufall"-Button (SCENARIOS.md §3.2).
export const RANDOM_PLACES_MUC: PlaceHint[] = [
  { name: 'Hauptbahnhof', coords: [11.5583, 48.1402] },
  { name: 'Messe Riem', coords: [11.6905, 48.1376] },
  { name: 'Olympiapark', coords: [11.5519, 48.1732] },
  { name: 'Stachus', coords: [11.5664, 48.1395] },
  { name: 'Donnersbergerbruecke', coords: [11.5349, 48.1419] },
  { name: 'Therese-Wiese', coords: [11.55, 48.1317] },
  { name: 'Flughafen-Zufahrt A92', coords: [11.7012, 48.292] },
  { name: 'Ostbahnhof', coords: [11.6043, 48.1269] },
  { name: 'Nordfriedhof', coords: [11.5988, 48.182] },
];

export function perturb(
  loc: [number, number],
  rng: () => number
): [number, number] {
  const angle = rng() * Math.PI * 2;
  const distKm = 0.5 + rng() * 2.5;
  const dLat = (distKm / 111) * Math.sin(angle);
  const dLng =
    (distKm / (111 * Math.cos((loc[1] * Math.PI) / 180))) * Math.cos(angle);
  return [loc[0] + dLng, loc[1] + dLat];
}

// Farb-Mapping fuer die Karten-Marker laut SCENARIOS.md §4.
export const INCIDENT_TYPE_COLOR: Record<IncidentType, string> = {
  amoklauf: '#FF3B30',
  verkehrsunfall: '#FF9500',
  industriebrand: '#FF2D55',
  panik: '#AF52DE',
  naturkatastrophe: '#007AFF',
};

export const INCIDENT_TYPE_LABEL: Record<IncidentType, string> = {
  amoklauf: 'Amoklauf',
  verkehrsunfall: 'Verkehrsunfall',
  industriebrand: 'Industrieunfall',
  panik: 'Massenpanik',
  naturkatastrophe: 'Naturkatastrophe',
};

export function getScenarioById(id: string): ScenarioTemplate | undefined {
  return SCENARIO_TEMPLATES.find((s) => s.id === id);
}

// Baut einen Incident aus einem Template. Optionale Ort-Variation per `perturbLocation`.
export function createIncidentFromScenario(
  scenarioId: string,
  simTime: number,
  rng: () => number,
  opts: { perturbLocation?: boolean } = {}
): Incident | null {
  const tpl = getScenarioById(scenarioId);
  if (!tpl) return null;
  const location = opts.perturbLocation ? perturb(tpl.location, rng) : tpl.location;
  return {
    id: `${tpl.id}-${simTime}`,
    type: tpl.type,
    label: tpl.label,
    location,
    startedAt: simTime,
    estimatedCasualties: tpl.estimatedCasualties,
    arrivalCurve: tpl.arrivalCurve,
    durationMin: tpl.durationMin,
    triageMix: tpl.triageMix,
    needsProfile: tpl.needsProfile,
  };
}

// Marker-Durchmesser aus SCENARIOS.md §4.
export function markerDiameterPx(casualties: number): number {
  return Math.round(8 + Math.sqrt(Math.max(0, casualties)) * 3);
}
