'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MaplibreMap, type Marker } from 'maplibre-gl';
import { useSimStore } from '@/lib/store';
import type { PlannedIntake } from '@/lib/types';

function createIntakeElement(intake: PlannedIntake): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'rl-intake-marker';
  wrap.setAttribute('data-testid', 'intake-marker');
  wrap.setAttribute('data-intake-id', intake.id);
  wrap.setAttribute('data-intake-status', intake.status);
  wrap.innerHTML = `
    <div class="rl-intake-plane">&#9992;</div>
    <div class="rl-intake-count">${intake.totalPatients}</div>
  `;
  return wrap;
}

interface PlannedIntakeLayerProps {
  map: MaplibreMap;
}

export function PlannedIntakeLayer({ map }: PlannedIntakeLayerProps) {
  const intakes = useSimStore((s) => s.plannedIntakes);
  const markersRef = useRef<Map<string, Marker>>(new Map());

  useEffect(() => {
    const active = new Set(intakes.map((i) => i.id));
    for (const [id, m] of markersRef.current) {
      if (!active.has(id)) {
        m.remove();
        markersRef.current.delete(id);
      }
    }
    for (const intake of intakes) {
      let m = markersRef.current.get(intake.id);
      if (!m) {
        const el = createIntakeElement(intake);
        m = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(intake.arrivalPoint)
          .addTo(map);
        markersRef.current.set(intake.id, m);
      } else {
        const el = m.getElement();
        el.setAttribute('data-intake-status', intake.status);
        const countEl = el.querySelector('.rl-intake-count');
        if (countEl) countEl.textContent = String(intake.totalPatients);
      }
    }
    return undefined;
  }, [map, intakes]);

  useEffect(() => {
    const snap = markersRef.current;
    return () => {
      for (const m of snap.values()) m.remove();
      snap.clear();
    };
  }, []);

  return null;
}
