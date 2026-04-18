// Detection-Regeln gemaess SIMULATION.md §7 / SPEC §6.
// Erzeugt Alerts; Dedup via scope|scopeRef|ruleName passiert im Engine-Tick.

import type {
  Alert,
  AlertSeverity,
  Hospital,
  Incident,
  OccupancyHistoryEntry,
  Patient,
  PlannedIntake,
  ResourceType,
  SimState,
} from '@/lib/types';
import { RESOURCE_TYPES, RESOURCE_DISPLAY_LONG } from '@/lib/data/resources';
import { haversine } from '@/lib/geo';
import { effectiveTotal, overallLoad } from './router';

function mkAlertId(
  simTime: number,
  rule: string,
  scopeRef: string,
  nonce = ''
): string {
  return `A-${simTime}-${rule}-${scopeRef}${nonce ? `-${nonce}` : ''}`;
}

function pushAlert(
  out: Alert[],
  partial: Omit<Alert, 'id' | 'linkedRecommendations'> & Partial<Pick<Alert, 'id' | 'linkedRecommendations'>>
): void {
  out.push({
    id: partial.id ?? mkAlertId(partial.firedAt, partial.ruleName, partial.scopeRef),
    linkedRecommendations: partial.linkedRecommendations ?? [],
    ...partial,
  });
}

// §7.1 HospitalSaturation: pro Klinik pro Ressource.
export function ruleHospitalSaturation(
  hospitals: Hospital[],
  simTime: number
): Alert[] {
  const alerts: Alert[] = [];
  for (const h of hospitals) {
    for (const r of RESOURCE_TYPES) {
      const cap = h.capacity[r];
      const eff = effectiveTotal(cap);
      if (eff === 0) continue;
      const ratio = cap.occupied / eff;
      let severity: AlertSeverity | null = null;
      if (ratio >= 0.95) severity = 'critical';
      else if (ratio >= 0.85) severity = 'warn';
      if (!severity) continue;
      pushAlert(alerts, {
        ruleName: 'HospitalSaturation',
        severity,
        scope: 'hospital',
        scopeRef: h.id,
        firedAt: simTime,
        title: `${h.name}: ${RESOURCE_DISPLAY_LONG[r]} ${Math.round(ratio * 100)} %`,
        detail: `Belegt ${cap.occupied} von ${eff} (${r})`,
      });
    }
  }
  return alerts;
}

// §7.2 CapacityTrend: Anstieg um >=15 pp in 30 Sim-min.
export function ruleCapacityTrend(
  hospitals: Hospital[],
  history: OccupancyHistoryEntry[],
  simTime: number
): Alert[] {
  const alerts: Alert[] = [];
  if (history.length === 0) return alerts;
  // Letzter Snapshot vor 30 Min.
  const past = history.find((h) => simTime - h.simTime <= 30 && simTime - h.simTime >= 25);
  if (!past) return alerts;
  const nowOverall = history[history.length - 1]?.overall ?? null;
  if (nowOverall == null) return alerts;
  const delta = nowOverall - past.overall;
  if (delta < 0.15) return alerts;
  const remaining = Math.max(0, 1 - nowOverall);
  const ratePerMin = delta / 30;
  const etaToFullMin = ratePerMin > 0 ? Math.round(remaining / ratePerMin) : 9999;
  pushAlert(alerts, {
    ruleName: 'CapacityTrend',
    severity: 'warn',
    scope: 'system',
    scopeRef: 'global',
    firedAt: simTime,
    title: `Gesamt-Auslastung steigt (+${Math.round(delta * 100)} pp in 30 Min)`,
    detail: `Bei aktueller Rate ca. ${etaToFullMin} Min bis 100 %`,
  });
  return alerts;
}

// §7.3 UnassignedPatients: onScene > 20 Sim-min.
export function ruleUnassignedPatients(
  patients: Patient[],
  simTime: number
): Alert[] {
  const unassigned = patients.filter(
    (p) => p.status === 'onScene' && !p.assignedHospitalId && simTime - p.spawnedAt > 20
  );
  if (unassigned.length === 0) return [];
  return [
    {
      id: mkAlertId(simTime, 'UnassignedPatients', 'global'),
      ruleName: 'UnassignedPatients',
      severity: 'critical',
      scope: 'system',
      scopeRef: 'global',
      firedAt: simTime,
      title: `${unassigned.length} Patienten ohne Zuweisung (> 20 Min)`,
      detail: `T1:${unassigned.filter((p) => p.triage === 'T1').length} T2:${unassigned.filter((p) => p.triage === 'T2').length} T3:${unassigned.filter((p) => p.triage === 'T3').length}`,
      linkedRecommendations: [],
    },
  ];
}

// §7.4 RegionalLoad: pro Incident 50 km Radius.
export function ruleRegionalLoad(
  incidents: Incident[],
  hospitals: Hospital[],
  simTime: number,
  radiusKm = 50
): Alert[] {
  const alerts: Alert[] = [];
  for (const inc of incidents) {
    const within = hospitals.filter((h) => haversine(inc.location, h.coords) <= radiusKm);
    if (within.length === 0) continue;
    let tot = 0;
    let occ = 0;
    for (const h of within) {
      for (const r of RESOURCE_TYPES) {
        tot += effectiveTotal(h.capacity[r]);
        occ += h.capacity[r].occupied;
      }
    }
    if (tot === 0) continue;
    const ratio = occ / tot;
    let severity: AlertSeverity | null = null;
    if (ratio >= 0.9) severity = 'critical';
    else if (ratio >= 0.8) severity = 'warn';
    if (!severity) continue;
    pushAlert(alerts, {
      ruleName: 'RegionalLoad',
      severity,
      scope: 'region',
      scopeRef: inc.id,
      firedAt: simTime,
      title: `Regionale Auslastung um ${inc.label}: ${Math.round(ratio * 100)} %`,
      detail: `${within.length} Kliniken in ${radiusKm} km Umkreis`,
    });
  }
  return alerts;
}

// §7.5 PlannedIntakeShortfall (vereinfacht).
export function rulePlannedIntakeShortfall(
  intakes: PlannedIntake[],
  hospitals: Hospital[],
  simTime: number,
  clusterRadiusKm = 30
): Alert[] {
  const alerts: Alert[] = [];
  for (const intake of intakes) {
    if (intake.status !== 'preparing' && intake.status !== 'announced') continue;
    const restTime = intake.firstArrivalAt - simTime;
    if (restTime < 0) continue;
    const prep = Math.max(1, intake.prepWindowMin);
    const restFrac = restTime / prep;
    if (restFrac >= 0.5) continue;
    const desired = intake.totalPatients * (1 + intake.bufferRatio);
    const cluster = hospitals.filter(
      (h) => haversine(intake.arrivalPoint, h.coords) <= clusterRadiusKm
    );
    let totFree = 0;
    for (const h of cluster) {
      for (const r of RESOURCE_TYPES) {
        totFree += Math.max(0, effectiveTotal(h.capacity[r]) - h.capacity[r].occupied);
      }
    }
    const shortfall = Math.max(0, Math.round(desired - totFree));
    if (shortfall <= 0) continue;
    const severity: AlertSeverity = restFrac < 0.2 ? 'critical' : 'warn';
    pushAlert(alerts, {
      ruleName: 'PlannedIntakeShortfall',
      severity,
      scope: 'intake',
      scopeRef: intake.id,
      firedAt: simTime,
      title: `Intake ${intake.label}: ${shortfall} Betten fehlen`,
      detail: `Rest-Vorlauf ${Math.round(restTime)} Min · ${cluster.length} Kliniken im 30-km-Cluster`,
    });
  }
  return alerts;
}

// §7.8 EscalationOpportunity.
export function ruleEscalationOpportunity(
  hospitals: Hospital[],
  simTime: number
): Alert[] {
  const alerts: Alert[] = [];
  for (const h of hospitals) {
    const load = overallLoad(h.capacity);
    if (load < 0.8) continue;
    // Hat mindestens eine Ressource eine surge-Reserve, die noch nicht aktiv ist?
    const hasSurge = RESOURCE_TYPES.some(
      (r) => h.capacity[r].surgeReserve > 0 && !h.capacity[r].surgeActive
    );
    if (!hasSurge) continue;
    pushAlert(alerts, {
      ruleName: 'EscalationOpportunity',
      severity: 'info',
      scope: 'hospital',
      scopeRef: h.id,
      firedAt: simTime,
      title: `${h.name}: Surge-Reserve aktivierbar`,
      detail: `Auslastung ${Math.round(load * 100)} %; Surge-Betten verfuegbar.`,
    });
  }
  return alerts;
}

// Zentraler Aufruf aller Regeln. Dedup (scope|scopeRef|ruleName innerhalb 10 Sim-min)
// wird im Engine-Tick ueber den bestehenden alerts-Store erledigt — hier werden
// rohe Alerts erzeugt.
export function runAllRules(state: SimState): Alert[] {
  const hs = Object.values(state.hospitals);
  return [
    ...ruleHospitalSaturation(hs, state.simTime),
    ...ruleCapacityTrend(hs, state.occupancyHistory, state.simTime),
    ...ruleUnassignedPatients(state.patients, state.simTime),
    ...ruleRegionalLoad(state.incidents, hs, state.simTime),
    ...rulePlannedIntakeShortfall(state.plannedIntakes, hs, state.simTime),
    ...ruleEscalationOpportunity(hs, state.simTime),
  ];
}

// Dedup-Merge: merged rohe Alerts mit bestehenden, respektiert 10-Min-Fenster.
export function mergeAlertsWithDedup(
  existing: Alert[],
  incoming: Alert[],
  simTime: number,
  windowMin = 10
): Alert[] {
  const merged = [...existing];
  for (const a of incoming) {
    const key = `${a.scope}|${a.scopeRef}|${a.ruleName}`;
    const recent = merged.find(
      (e) =>
        `${e.scope}|${e.scopeRef}|${e.ruleName}` === key &&
        e.resolvedAt == null &&
        simTime - e.firedAt <= windowMin
    );
    if (recent) continue;
    merged.push(a);
  }
  return merged;
}

export function resolveStaleAlerts(
  existing: Alert[],
  activeKeys: Set<string>,
  simTime: number
): Alert[] {
  return existing.map((a) => {
    if (a.resolvedAt != null) return a;
    const key = `${a.scope}|${a.scopeRef}|${a.ruleName}`;
    if (activeKeys.has(key)) return a;
    return { ...a, resolvedAt: simTime };
  });
}

// Unit-Helper fuer Tests: Set aus Alert-Array.
export function alertKeys(alerts: Alert[]): Set<string> {
  return new Set(alerts.map((a) => `${a.scope}|${a.scopeRef}|${a.ruleName}`));
}

// Re-exports damit die Engine nicht router.ts direkt braucht.
export { effectiveTotal, overallLoad };
