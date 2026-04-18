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

// Severity-Ranking fuer Alert-Sortierung.
const SEV_WEIGHT = { critical: 3, warn: 2, info: 1 } as const;

// Max. Alerts auf die wir neue Recommendations generieren (die brenzligsten).
const REC_TRIGGER_TOPK_HOSPITAL_SATURATION = 3;
const REC_TRIGGER_TOPK_REGIONAL_LOAD = 2;

// Max. offene Recommendations insgesamt — alles darueber wird gestutzt.
export const MAX_OPEN_RECOMMENDATIONS = 8;

// Key fuer natuerliche Dedup: gleiche Massnahme auf gleiches Ziel → nur einmal.
function recKey(action: Recommendation['action'], targets: string[], intakeRefId?: string): string {
  const sortedTargets = [...targets].sort().join('|');
  return `${action}::${sortedTargets}::${intakeRefId ?? ''}`;
}

export function generateRecommendations(
  state: SimState,
  newAlerts: Alert[]
): Recommendation[] {
  const out = new Map<string, Recommendation>();

  const push = (rec: Recommendation) => {
    const k = recKey(rec.action, rec.targetHospitalIds, rec.intakeRefId);
    if (out.has(k)) return;
    out.set(k, rec);
  };

  // Alerts nach Severity sortieren.
  const sorted = [...newAlerts].sort(
    (a, b) => SEV_WEIGHT[b.severity] - SEV_WEIGHT[a.severity]
  );

  // Nur die Top-K HospitalSaturation / EscalationOpportunity verarbeiten.
  const satAlerts = sorted
    .filter((a) => a.ruleName === 'HospitalSaturation' || a.ruleName === 'EscalationOpportunity')
    .slice(0, REC_TRIGGER_TOPK_HOSPITAL_SATURATION);
  for (const a of satAlerts) {
    const h = state.hospitals[a.scopeRef];
    if (!h) continue;
    const gained = hospitalSurgeImpact(h);
    if (gained > 0) {
      push({
        id: recId('activate-surge', h.id, state.simTime),
        triggeredBy: [a.id],
        action: 'activate-surge',
        targetHospitalIds: [h.id],
        title: `${TITLE['activate-surge']}: ${h.name}`,
        rationale: RATIONALE['activate-surge'],
        expectedImpact: { bedsGained: gained, occupancyDeltaPp: -8 },
        effortLevel: EFFORT['activate-surge'],
        executable: true,
      });
    }
    if (h.staff.onCall > 0) {
      push({
        id: recId('staff-callup', h.id, state.simTime),
        triggeredBy: [a.id],
        action: 'staff-callup',
        targetHospitalIds: [h.id],
        title: `${TITLE['staff-callup']}: ${h.name}`,
        rationale: RATIONALE['staff-callup'],
        expectedImpact: { occupancyDeltaPp: -3 },
        effortLevel: EFFORT['staff-callup'],
        executable: true,
      });
    }
  }

  // Top-K RegionalLoad + UnassignedPatients.
  const loadAlerts = sorted
    .filter((a) => a.ruleName === 'UnassignedPatients' || a.ruleName === 'RegionalLoad')
    .slice(0, REC_TRIGGER_TOPK_REGIONAL_LOAD);
  for (const a of loadAlerts) {
    const hs = Object.values(state.hospitals);
    const candidate = hs
      .filter((h) => hospitalSurgeImpact(h) > 0)
      .sort(
        (a1, b1) =>
          effectiveTotal(b1.capacity.normal_bett) - effectiveTotal(a1.capacity.normal_bett)
      )[0];
    if (candidate) {
      push({
        id: recId('reroute-manv', candidate.id, state.simTime),
        triggeredBy: [a.id],
        action: 'reroute-manv',
        targetHospitalIds: [candidate.id],
        title: `${TITLE['reroute-manv']}: ${candidate.name}`,
        rationale: RATIONALE['reroute-manv'],
        expectedImpact: { patientsRerouted: 20, occupancyDeltaPp: -5 },
        effortLevel: EFFORT['reroute-manv'],
        executable: true,
      });
    }
  }

  for (const a of newAlerts.filter((x) => x.ruleName === 'PlannedIntakeShortfall')) {
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

  return Array.from(out.values());
}

// Merge-Helper: bestehende Recommendations + neue. Natuerliche Dedup ueber
// (action, targets, intakeRefId). Cap auf MAX_OPEN_RECOMMENDATIONS offene
// (executedAt == null) — ausgefuehrte bleiben fuer Audit-Sicht erhalten.
export function mergeRecommendations(
  existing: Recommendation[],
  incoming: Recommendation[]
): Recommendation[] {
  const byKey = new Map<string, Recommendation>();
  for (const r of existing) byKey.set(recKey(r.action, r.targetHospitalIds, r.intakeRefId), r);
  for (const r of incoming) {
    const k = recKey(r.action, r.targetHospitalIds, r.intakeRefId);
    if (!byKey.has(k)) byKey.set(k, r);
  }
  const all = Array.from(byKey.values());
  const open = all.filter((r) => r.executedAt == null);
  const done = all.filter((r) => r.executedAt != null);
  // Bei Ueberlauf: die aeltesten offenen Recommendations droppen (deren
  // Alerts wahrscheinlich auch schon resolvt sind oder Dedup durch neue
  // ersetzt wird).
  const cappedOpen = open.slice(-MAX_OPEN_RECOMMENDATIONS);
  return [...cappedOpen, ...done];
}

export { TITLE as RECOMMENDATION_TITLE, RATIONALE as RECOMMENDATION_RATIONALE };
