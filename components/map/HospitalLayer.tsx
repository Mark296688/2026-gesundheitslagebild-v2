'use client';

import { useEffect } from 'react';
import type {
  Map as MaplibreMap,
  GeoJSONSource,
  MapLayerMouseEvent,
} from 'maplibre-gl';
import maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';
import type { Hospital, ResourceType } from '@/lib/types';
import { getHospitals } from '@/lib/data/hospitalsLoader';
import { useSimStore } from '@/lib/store';
import {
  RESOURCE_TYPES,
  RESOURCE_DISPLAY,
} from '@/lib/data/resources';
import {
  baselineCapacity,
  overallOccupancyRatio,
  tierRadiusPx,
} from '@/lib/simulation/baseline';
import type { Capacity } from '@/lib/types';

interface HospitalProps {
  id: string;
  name: string;
  tier: Hospital['tier'];
  color: string;
  radius: number;
  strokeColor: string;
  strokeWidth: number;
  ratio: number;
  // 4-Balken-Auslastung fuer Tooltip (0..1).
  ratios: Record<ResourceType, number>;
  // Betten-Absolutzahlen fuer Tooltip.
  capacity: Record<ResourceType, Capacity>;
}

const SOURCE_ID = 'hospitals-src';
const LAYER_ID = 'hospitals-circles';
const LAYER_ID_HALO = 'hospitals-halo';

// DESIGN.md §6: grün < 60 %, gelb 60–80 %, orange 80–95 %, rot ≥ 95 %.
// Hex-Werte aus DESIGN.md §1 (Apple System Colors) — der Marker-Layer kann
// keine CSS-Variablen ausrechnen, daher hier direkt eingefroren.
function ratioColorHex(ratio: number): string {
  if (ratio >= 0.95) return '#FF3B30';
  if (ratio >= 0.8) return '#FF9500';
  if (ratio >= 0.6) return '#FFCC00';
  return '#34C759';
}

function toFeatureCollection(
  hospitals: Hospital[],
  seed: number
): FeatureCollection<Point, HospitalProps> {
  const features: Feature<Point, HospitalProps>[] = hospitals.map((h) => {
    const cap = baselineCapacity(h, seed);
    const ratio = overallOccupancyRatio(cap);
    const ratios = {
      notaufnahme: cap.notaufnahme.total === 0 ? 0 : cap.notaufnahme.occupied / cap.notaufnahme.total,
      op_saal: cap.op_saal.total === 0 ? 0 : cap.op_saal.occupied / cap.op_saal.total,
      its_bett: cap.its_bett.total === 0 ? 0 : cap.its_bett.occupied / cap.its_bett.total,
      normal_bett: cap.normal_bett.total === 0 ? 0 : cap.normal_bett.occupied / cap.normal_bett.total,
    };
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: h.coords },
      properties: {
        id: h.id,
        name: h.name,
        tier: h.tier,
        color: ratioColorHex(ratio),
        radius: tierRadiusPx(h.tier),
        strokeColor: '#FFFFFF',
        strokeWidth: 2,
        ratio,
        ratios,
        capacity: cap,
      },
    };
  });
  return { type: 'FeatureCollection', features };
}

const TIER_LABEL: Record<Hospital['tier'], string> = {
  maximal: 'Maximalversorger',
  schwerpunkt: 'Schwerpunkt',
  regel: 'Regelversorger',
  grund: 'Grundversorger',
};

function tooltipHtml(p: HospitalProps): string {
  const bars = RESOURCE_TYPES.map((res) => {
    const r = p.ratios[res];
    const cap = p.capacity[res];
    const pct = Math.round(r * 100);
    const barColor = ratioColorHex(r);
    const label = RESOURCE_DISPLAY[res];
    const capText = cap.total === 0
      ? '—'
      : `${cap.occupied}/${cap.total}`;
    return `
      <div class="rl-bar-row">
        <div class="rl-bar-label">${label}</div>
        <div class="rl-bar-track">
          <div class="rl-bar-fill" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <div class="rl-bar-num">${capText}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="rl-tooltip">
      <div class="rl-tooltip-head">
        <div class="rl-tooltip-name">${escapeHtml(p.name)}</div>
        <div class="rl-tooltip-tier">${TIER_LABEL[p.tier]}</div>
      </div>
      <div class="rl-bar-grid">${bars}</div>
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

interface HospitalLayerProps {
  map: MaplibreMap;
  seed?: number;
}

export function HospitalLayer({ map, seed = 42 }: HospitalLayerProps) {
  useEffect(() => {
    const hospitals = getHospitals();
    const data = toFeatureCollection(hospitals, seed);

    const ensureSourceAndLayers = () => {
      const existingSrc = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      if (existingSrc) {
        existingSrc.setData(data);
      } else {
        map.addSource(SOURCE_ID, { type: 'geojson', data });
      }

      if (!map.getLayer(LAYER_ID_HALO)) {
        map.addLayer({
          id: LAYER_ID_HALO,
          type: 'circle',
          source: SOURCE_ID,
          paint: {
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.25,
            'circle-radius': ['+', ['get', 'radius'], 4],
            'circle-blur': 0.6,
          },
        });
      }

      if (!map.getLayer(LAYER_ID)) {
        map.addLayer({
          id: LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': ['get', 'radius'],
            'circle-stroke-color': ['get', 'strokeColor'],
            'circle-stroke-width': ['get', 'strokeWidth'],
            'circle-stroke-opacity': 0.9,
          },
        });
      }
    };

    if (map.isStyleLoaded()) {
      ensureSourceAndLayers();
    } else {
      map.once('load', ensureSourceAndLayers);
    }

    // Hover-Tooltip via MapLibre-Popup (HTML mit DESIGN-Tokens per CSS).
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14,
      className: 'rl-popup',
      maxWidth: '320px',
    });

    const onEnter = (e: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features?.[0];
      if (!f || f.geometry.type !== 'Point') return;
      popup
        .setLngLat(f.geometry.coordinates as [number, number])
        .setHTML(tooltipHtml(f.properties as unknown as HospitalProps))
        .addTo(map);
    };

    const onMove = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f || f.geometry.type !== 'Point') return;
      popup.setLngLat(f.geometry.coordinates as [number, number]);
    };

    const onLeave = () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    };

    const onClick = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const props = f.properties as unknown as HospitalProps;
      useSimStore.getState().selectHospital(props.id);
    };

    map.on('mouseenter', LAYER_ID, onEnter);
    map.on('mousemove', LAYER_ID, onMove);
    map.on('mouseleave', LAYER_ID, onLeave);
    map.on('click', LAYER_ID, onClick);

    return () => {
      map.off('mouseenter', LAYER_ID, onEnter);
      map.off('mousemove', LAYER_ID, onMove);
      map.off('mouseleave', LAYER_ID, onLeave);
      map.off('click', LAYER_ID, onClick);
      popup.remove();
      // Layer/source aufraeumen nur beim Unmount — bei map.remove() macht das der
      // Destroy automatisch. Hier defensiv entfernen, falls Layer-Stack neu gebaut wird.
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getLayer(LAYER_ID_HALO)) map.removeLayer(LAYER_ID_HALO);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map, seed]);

  return null;
}
