'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MaplibreMap, type Marker } from 'maplibre-gl';
import { useSimStore } from '@/lib/store';
import {
  INCIDENT_TYPE_COLOR,
  INCIDENT_TYPE_LABEL,
  markerDiameterPx,
} from '@/lib/simulation/scenarios';
import type { Incident, Patient } from '@/lib/types';

interface IncidentCounts {
  total: number;
  onScene: number;
  transport: number;
  inTreatment: number;
  discharged: number;
  spawned: number; // bislang ueberhaupt gespawnte Patienten (0 wenn noch kein Tick lief)
}

function countsFor(incident: Incident, patients: Patient[]): IncidentCounts {
  let onScene = 0,
    transport = 0,
    inTreatment = 0,
    discharged = 0,
    spawned = 0;
  for (const p of patients) {
    if (p.sourceRefId !== incident.id) continue;
    spawned++;
    switch (p.status) {
      case 'onScene':
        onScene++;
        break;
      case 'transport':
        transport++;
        break;
      case 'inTreatment':
      case 'transferring':
        inTreatment++;
        break;
      case 'discharged':
      case 'deceased':
        discharged++;
        break;
    }
  }
  return {
    total: incident.estimatedCasualties,
    onScene,
    transport,
    inTreatment,
    discharged,
    spawned,
  };
}

// Anzeige-Semantik:
// - Solange noch kein Tick lief (spawned = 0): Marker zeigt Gesamt-Zahl.
// - Sonst: Noch nicht in einer Klinik versorgt = onScene + transport +
//   (total - spawned)  (die sind noch nicht ueberhaupt gespawnt).
// - Alle in Behandlung oder discharged → ✓.
function applyMarkerState(el: HTMLDivElement, incident: Incident, counts: IncidentCounts): void {
  const color = INCIDENT_TYPE_COLOR[incident.type];
  const notYetSpawned = Math.max(0, counts.total - counts.spawned);
  const remaining = counts.onScene + counts.transport + notYetSpawned;
  const resolved = remaining === 0 && counts.total > 0;
  const displaySize = Math.max(6, remaining || 6);
  const size = markerDiameterPx(displaySize);
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.background = resolved ? 'var(--accent-green)' : color;
  el.style.opacity = resolved ? '0.55' : '1';
  el.textContent = resolved ? '✓' : String(remaining);
  el.title = `${incident.label} — ${remaining}/${counts.total} noch nicht versorgt`;
}

function createMarkerElement(incident: Incident, counts: IncidentCounts): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'rl-incident-marker';
  wrap.setAttribute('data-testid', 'incident-marker');
  wrap.setAttribute('data-incident-id', incident.id);
  wrap.setAttribute('data-incident-type', incident.type);
  applyMarkerState(wrap, incident, counts);
  return wrap;
}

function createTooltipHtml(incident: Incident, counts: IncidentCounts): string {
  const notYet = Math.max(0, counts.total - counts.spawned);
  const versorgt = counts.inTreatment + counts.discharged;
  const pct = counts.total === 0 ? 0 : Math.round((versorgt / counts.total) * 100);
  const typeLabel = INCIDENT_TYPE_LABEL[incident.type];
  return `
    <div class="rl-tooltip">
      <div class="rl-tooltip-head">
        <div class="rl-tooltip-name">${escapeHtml(incident.label)}</div>
        <div class="rl-tooltip-tier">${typeLabel}</div>
      </div>
      <div class="rl-incident-stats">
        <div>Gesamt erwartet: <span class="rl-num">${counts.total}</span></div>
        <div>Noch nicht gespawnt: <span class="rl-num">${notYet}</span></div>
        <div>Vor Ort: <span class="rl-num">${counts.onScene}</span></div>
        <div>Im Transport: <span class="rl-num">${counts.transport}</span></div>
        <div>In Behandlung: <span class="rl-num">${counts.inTreatment}</span></div>
        <div>Abgeschlossen: <span class="rl-num">${counts.discharged}</span></div>
        <div>Versorgungsgrad: <span class="rl-num">${pct} %</span></div>
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface IncidentLayerProps {
  map: MaplibreMap;
}

export function IncidentLayer({ map }: IncidentLayerProps) {
  const incidents = useSimStore((s) => s.incidents);
  const patients = useSimStore((s) => s.patients);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const popupsRef = useRef<Map<string, maplibregl.Popup>>(new Map());

  useEffect(() => {
    const active = new Set(incidents.map((i) => i.id));
    for (const [id, marker] of markersRef.current) {
      if (!active.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
        popupsRef.current.get(id)?.remove();
        popupsRef.current.delete(id);
      }
    }

    for (const inc of incidents) {
      const counts = countsFor(inc, patients);
      let marker = markersRef.current.get(inc.id);
      if (!marker) {
        const el = createMarkerElement(inc, counts);
        marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(inc.location)
          .addTo(map);

        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 16,
          className: 'rl-popup',
          maxWidth: '280px',
        });
        popupsRef.current.set(inc.id, popup);
        markersRef.current.set(inc.id, marker);

        el.addEventListener('mouseenter', () => {
          const cur = useSimStore.getState();
          const c = countsFor(inc, cur.patients);
          popup.setLngLat(inc.location).setHTML(createTooltipHtml(inc, c)).addTo(map);
        });
        el.addEventListener('mouseleave', () => {
          popup.remove();
        });
      } else {
        marker.setLngLat(inc.location);
        applyMarkerState(marker.getElement() as HTMLDivElement, inc, counts);
      }
    }

    return undefined;
  }, [map, incidents, patients]);

  useEffect(() => {
    const snap = markersRef.current;
    const snapPops = popupsRef.current;
    return () => {
      for (const m of snap.values()) m.remove();
      snap.clear();
      for (const p of snapPops.values()) p.remove();
      snapPops.clear();
    };
  }, []);

  return null;
}
