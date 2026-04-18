// Reine Funktion: wendet eine Recommendation/MeasureAction auf einen
// SimState an (in-place). Wird sowohl vom Store (Live-Ausfuehrung) als auch
// von der Fork-Preview-Engine benutzt.
// Implementierung deckt MEASURES.md §1-§6 + §9 pragmatisch ab.

import type { PlannedIntake, Recommendation, SimState } from '@/lib/types';
import { RESOURCE_TYPES } from '@/lib/data/resources';

export function applyMeasureToState(
  state: SimState,
  rec: Recommendation
): void {
  switch (rec.action) {
    case 'activate-surge': {
      for (const id of rec.targetHospitalIds) {
        const h = state.hospitals[id];
        if (!h) continue;
        for (const r of RESOURCE_TYPES) {
          if (h.capacity[r].surgeReserve > 0) {
            h.capacity[r] = { ...h.capacity[r], surgeActive: true };
          }
        }
      }
      return;
    }
    case 'cancel-elective': {
      for (const id of rec.targetHospitalIds) {
        const h = state.hospitals[id];
        if (!h) continue;
        h.electiveActive = false;
        const op = h.capacity.op_saal;
        const extra = Math.round(op.total * 0.25);
        h.capacity.op_saal = {
          ...op,
          surgeReserve: op.surgeReserve + extra,
          surgeActive: true,
        };
      }
      return;
    }
    case 'staff-callup': {
      for (const id of rec.targetHospitalIds) {
        const h = state.hospitals[id];
        if (!h) continue;
        const addedOnCall = h.staff.onCall;
        h.staff = { onDuty: h.staff.onDuty + h.staff.onCall, onCall: 0 };
        // §5 SPEC: proxy — erhoehe normal_bett.total um ceil(added/4).
        const nb = h.capacity.normal_bett;
        h.capacity.normal_bett = {
          ...nb,
          total: nb.total + Math.ceil(addedOnCall / 4),
        };
      }
      return;
    }
    case 'alert-adjacent': {
      for (const id of rec.targetHospitalIds) {
        const h = state.hospitals[id];
        if (!h) continue;
        if (h.escalation === 'normal') h.escalation = 'erhoeht';
        // +10 % onCall → onDuty
        const shift = Math.round(h.staff.onCall * 0.1);
        h.staff = {
          onDuty: h.staff.onDuty + shift,
          onCall: h.staff.onCall - shift,
        };
      }
      return;
    }
    case 'divert-normal-admissions': {
      for (const id of rec.targetHospitalIds) {
        const h = state.hospitals[id];
        if (!h) continue;
        h.divertActive = true;
      }
      return;
    }
    case 'prepare-reception': {
      if (!rec.intakeRefId) return;
      const idx = state.plannedIntakes.findIndex((i) => i.id === rec.intakeRefId);
      if (idx === -1) return;
      const updated: PlannedIntake = {
        ...state.plannedIntakes[idx],
        status: 'preparing',
      };
      state.plannedIntakes[idx] = updated;
      return;
    }
    case 'activate-reserve-hospital': {
      // Reserveklinik als synthetisches Haus einhaengen. Koordinaten und
      // Kapazitaet laut MEASURES.md §8.
      const id = 'H-RESERVE-FFB';
      if (state.hospitals[id]) return;
      state.hospitals[id] = {
        id,
        name: 'Sanitaetszentrum Fuerstenfeldbruck',
        kind: 'Reserve',
        tier: 'regel',
        coords: [11.249, 48.1787],
        address: { street: '', city: 'Fuerstenfeldbruck', plz: '82256' },
        capacity: {
          notaufnahme: { total: 5, occupied: 0, surgeReserve: 2, surgeActive: false },
          op_saal: { total: 6, occupied: 0, surgeReserve: 2, surgeActive: false },
          its_bett: { total: 20, occupied: 0, surgeReserve: 4, surgeActive: false },
          normal_bett: { total: 200, occupied: 0, surgeReserve: 40, surgeActive: false },
        },
        abteilungen: ['Notaufnahme', 'OP', 'Intensivstation'],
        flags: {
          hasOP: true,
          hasITS: true,
          hasNotaufnahme: true,
          hasBurnCenter: false,
          hasNeurochir: false,
          hasPaediatrie: false,
        },
        staff: { onDuty: 60, onCall: 20 },
        escalation: 'erhoeht',
        electiveActive: false,
        divertActive: false,
      };
      return;
    }
    case 'reroute-manv':
    case 'relocate-stable-batch':
    case 'request-cross-region':
    default:
      // Wirksame MVP-Seiteneffekte: none (Simulationsanker, Audit bleibt).
      return;
  }
}
