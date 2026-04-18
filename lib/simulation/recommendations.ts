// Recommendations: aus Alerts werden Massnahmen-Vorschlaege abgeleitet.
// MVP-Generator laut SPEC §7 / MEASURES.md. Phase 4 liefert Skelett + 10 Aktions-Typen.

import type {
  Alert,
  Hospital,
  MeasureAction,
  Recommendation,
  SimState,
} from '@/lib/types';
import { RESOURCE_TYPES } from '@/lib/data/resources';
import { effectiveTotal } from './router';

const RATIONALE: Record<MeasureAction, string> = {
  'activate-surge':
    'Die Surge-Reserve der Klinik kann ohne externe Hilfe sofort aktiviert werden.',
  'reroute-manv':
    'Naechste MANV-Patienten werden auf Ausweich-Haus umgeleitet, um die Spitzenlast zu glaetten.',
  'relocate-stable-batch':
    'Stabile T2/T3-Patienten in entfernte Haeuser verlegen und Betten freiraeumen.',
  'prepare-reception':
    'Vorbereitungsmodus aktivieren und proaktiv Betten fuer angekuendigte Grossbelegung schaffen.',
  'staff-callup':
    'Zusatzpersonal aus Bereitschaft (onCall) einberufen, um Betreuungsrate zu erhoehen.',
  'cancel-elective':
    'Elektiv-OPs stoppen, um OP-Kapazitaet kurzfristig freizugeben.',
  'divert-normal-admissions':
    'Plan-Einweisungen in der Region pausieren, um Kapazitaet fuer Einsatzlage zu halten.',
  'activate-reserve-hospital':
    'Reserveklinik als zusaetzlichen Knoten aktivieren (+200 Betten baseline).',
  'alert-adjacent':
    'Nachbarkliniken vorab auf Stufe "erhoeht" setzen, damit Aufnahme vorbereitet ist.',
  'request-cross-region':
    'Ueberregionale Unterstuetzung anfordern. Informationeller Eskalations-Schritt.',
};

const TITLE: Record<MeasureAction, string> = {
  'activate-surge': 'Surge-Reserve aktivieren',
  'reroute-manv': 'MANV-Zustrom umleiten',
  'relocate-stable-batch': 'Stabile Patienten verlegen',
  'prepare-reception': 'Intake vorbereiten',
  'staff-callup': 'Personal nachalarmieren',
  'cancel-elective': 'Elektiv stoppen',
  'divert-normal-admissions': 'Normal-Aufnahmen umleiten',
  'activate-reserve-hospital': 'Reserveklinik aktivieren',
  'alert-adjacent': 'Nachbarn vorwarnen',
  'request-cross-region': 'Ueberregionale Hilfe',
};

const EFFORT: Record<MeasureAction, 'low' | 'medium' | 'high'> = {
  'activate-surge': 'low',
  'reroute-manv': 'low',
  'relocate-stable-batch': 'medium',
  'prepare-reception': 'low',
  'staff-callup': 'medium',
  'cancel-elective': 'medium',
  'divert-normal-admissions': 'low',
  'activate-reserve-hospital': 'high',
  'alert-adjacent': 'low',
  'request-cross-region': 'high',
};

function recId(action: MeasureAction, scopeRef: string, simTime: number): string {
  return `R-${simTime}-${action}-${scopeRef}`;
}

function hospitalSurgeImpact(h: Hospital): number {
  let gained = 0;
  for (const r of RESOURCE_TYPES) {
    const cap = h.capacity[r];
    if (!cap.surgeActive) gained += cap.surgeReserve;
  }
  return gained;
}

export function generateRecommendations(
  state: SimState,
  newAlerts: Alert[]
): Recommendation[] {
  const out: Recommendation[] = [];
  const seen = new Set<string>();

  const push = (rec: Recommendation) => {
    if (seen.has(rec.id)) return;
    seen.add(rec.id);
    out.push(rec);
  };

  for (const a of newAlerts) {
    if (a.ruleName === 'HospitalSaturation' || a.ruleName === 'EscalationOpportunity') {
      const h = state.hospitals[a.scopeRef];
      if (!h) continue;
      const gained = hospitalSurgeImpact(h);
      if (gained > 0) {
        push({
          id: recId('activate-surge', h.id, state.simTime),
          triggeredBy: [a.id],
          action: 'activate-surge',
          targetHospitalIds: [h.id],
          title: TITLE['activate-surge'],
          rationale: RATIONALE['activate-surge'],
          expectedImpact: { bedsGained: gained, occupancyDeltaPp: -8 },
          effortLevel: EFFORT['activate-surge'],
          executable: true,
        });
      }
      push({
        id: recId('staff-callup', h.id, state.simTime),
        triggeredBy: [a.id],
        action: 'staff-callup',
        targetHospitalIds: [h.id],
        title: TITLE['staff-callup'],
        rationale: RATIONALE['staff-callup'],
        expectedImpact: { occupancyDeltaPp: -3 },
        effortLevel: EFFORT['staff-callup'],
        executable: h.staff.onCall > 0,
      });
    }

    if (a.ruleName === 'UnassignedPatients' || a.ruleName === 'RegionalLoad') {
      // Naechstgelegene Klinik mit Surge-Reserve als reroute-Ziel.
      const hs = Object.values(state.hospitals);
      const candidate = hs
        .filter((h) => hospitalSurgeImpact(h) > 0)
        .sort((a1, b1) => effectiveTotal(b1.capacity.normal_bett) - effectiveTotal(a1.capacity.normal_bett))[0];
      if (candidate) {
        push({
          id: recId('reroute-manv', candidate.id, state.simTime),
          triggeredBy: [a.id],
          action: 'reroute-manv',
          targetHospitalIds: [candidate.id],
          title: TITLE['reroute-manv'],
          rationale: RATIONALE['reroute-manv'],
          expectedImpact: { patientsRerouted: 20, occupancyDeltaPp: -5 },
          effortLevel: EFFORT['reroute-manv'],
          executable: true,
        });
      }
      push({
        id: recId('alert-adjacent', a.scopeRef, state.simTime),
        triggeredBy: [a.id],
        action: 'alert-adjacent',
        targetHospitalIds: [],
        title: TITLE['alert-adjacent'],
        rationale: RATIONALE['alert-adjacent'],
        expectedImpact: {},
        effortLevel: EFFORT['alert-adjacent'],
        executable: true,
      });
    }

    if (a.ruleName === 'PlannedIntakeShortfall') {
      push({
        id: recId('prepare-reception', a.scopeRef, state.simTime),
        triggeredBy: [a.id],
        action: 'prepare-reception',
        targetHospitalIds: [],
        intakeRefId: a.scopeRef,
        title: TITLE['prepare-reception'],
        rationale: RATIONALE['prepare-reception'],
        expectedImpact: { bedsGained: 60, timeBoughtMin: 120 },
        effortLevel: EFFORT['prepare-reception'],
        executable: true,
      });
      push({
        id: recId('relocate-stable-batch', a.scopeRef, state.simTime),
        triggeredBy: [a.id],
        action: 'relocate-stable-batch',
        targetHospitalIds: [],
        intakeRefId: a.scopeRef,
        title: TITLE['relocate-stable-batch'],
        rationale: RATIONALE['relocate-stable-batch'],
        expectedImpact: { patientsRelocated: 20, bedsGained: 20 },
        effortLevel: EFFORT['relocate-stable-batch'],
        executable: true,
      });
    }
  }
  return out;
}

// Merge-Helper: bestehende Recommendations + neue, ohne Duplikate (gleiche id).
export function mergeRecommendations(
  existing: Recommendation[],
  incoming: Recommendation[]
): Recommendation[] {
  const byId = new Map<string, Recommendation>();
  for (const r of existing) byId.set(r.id, r);
  for (const r of incoming) if (!byId.has(r.id)) byId.set(r.id, r);
  return Array.from(byId.values());
}

export { TITLE as RECOMMENDATION_TITLE, RATIONALE as RECOMMENDATION_RATIONALE };
