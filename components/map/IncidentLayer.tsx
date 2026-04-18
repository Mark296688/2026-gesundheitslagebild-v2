'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MaplibreMap, type Marker } from 'maplibre-gl';
import { useSimStore } from '@/lib/store';
import {
  INCIDENT_TYPE_COLOR,
  INCIDENT_TYPE_LABEL,
  markerDiameterPx,
} from '@/lib/simulation/scenarios';
import type { Incident } from '@/lib/types';

function createMarkerElement(incident: Incident): HTMLDivElement {
  const size = markerDiameterPx(incident.estimatedCasualties);
  const color = INCIDENT_TYPE_COLOR[incident.type];
  const wrap = document.createElement('div');
  wrap.className = 'rl-incident-marker';
  wrap.style.width = `${size}px`;
  wrap.style.height = `${size}px`;
  wrap.style.background = color;
  wrap.innerText = String(incident.estimatedCasualties);
  wrap.title = `${incident.label} — ${incident.estimatedCasualties} Verletzte`;
  wrap.setAttribute('data-testid', 'incident-marker');
  wrap.setAttribute('data-incident-id', incident.id);
  wrap.setAttribute('data-incident-type', incident.type);
  return wrap;
}

function createTooltip(incident: Incident, assignedCount: number): string {
  const casualties = incident.estimatedCasualties;
  const pct = casualties === 0 ? 0 : Math.round((assignedCount / casualties) * 100);
  const typeLabel = INCIDENT_TYPE_LABEL[incident.type];
  return `
    <div class="rl-tooltip">
      <div class="rl-tooltip-head">
        <div class="rl-tooltip-name">${escapeHtml(incident.label)}</div>
        <div class="rl-tooltip-tier">${typeLabel}</div>
      </div>
      <div class="rl-incident-stats">
        <div><span class="rl-num">${casualties}</span> Verletzte</div>
        <div>ca. <span class="rl-num">${pct} %</span> versorgt</div>
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
    // Removes
    for (const [id, marker] of markersRef.current) {
      if (!active.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
        popupsRef.current.get(id)?.remove();
        popupsRef.current.delete(id);
      }
    }
    // Adds / Updates
    for (const inc of incidents) {
      let marker = markersRef.current.get(inc.id);
      if (!marker) {
        const el = createMarkerElement(inc);
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
          const assigned = patients.filter(
            (p) => p.sourceRefId === inc.id && p.assignedHospitalId
          ).length;
          popup.setLngLat(inc.location).setHTML(createTooltip(inc, assigned)).addTo(map);
        });
        el.addEventListener('mouseleave', () => {
          popup.remove();
        });
      } else {
        marker.setLngLat(inc.location);
      }
    }

    return undefined;
  }, [map, incidents, patients]);

  useEffect(() => {
    const snapshot = markersRef.current;
    const snapshotPopups = popupsRef.current;
    return () => {
      for (const m of snapshot.values()) m.remove();
      snapshot.clear();
      for (const p of snapshotPopups.values()) p.remove();
      snapshotPopups.clear();
    };
  }, []);

  return null;
}
