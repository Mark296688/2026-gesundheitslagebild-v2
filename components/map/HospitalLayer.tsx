'use client';

import { useEffect, useRef } from 'react';
import type {
  Map as MaplibreMap,
  GeoJSONSource,
  MapLayerMouseEvent,
} from 'maplibre-gl';
import maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';
import type { Capacity, Hospital, ResourceType } from '@/lib/types';
import { useSimStore } from '@/lib/store';
import {
  RESOURCE_TYPES,
  RESOURCE_DISPLAY,
} from '@/lib/data/resources';
import {
  overallOccupancyRatio,
  tierRadiusPx,
} from '@/lib/simulation/baseline';
import { effectiveTotal } from '@/lib/simulation/router';

// MapLibre stringifyt verschachtelte Properties verlustbehaftet. Daher nur
// primitive Werte als Feature-Property; die komplexen Display-Daten liegen
// in einem separaten Lookup per Hospital-ID.
interface HospitalFeatureProps {
  id: string;
  color: string;
  radius: number;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
}

interface HospitalDisplay {
  id: string;
  name: string;
  tier: Hospital['tier'];
  ratio: number;
  ratios: Record<ResourceType, number>;
  capacity: Record<ResourceType, Capacity>;
}

const SOURCE_ID = 'hospitals-src';
const LAYER_ID = 'hospitals-circles';
const LAYER_ID_HALO = 'hospitals-halo';

function ratioColorHex(ratio: number): string {
  if (ratio >= 0.95) return '#FF3B30';
  if (ratio >= 0.8) return '#FF9500';
  if (ratio >= 0.6) return '#FFCC00';
  return '#34C759';
}

function ratioOf(c: Capacity): number {
  const eff = effectiveTotal(c);
  if (eff === 0) return 0;
  return Math.max(0, Math.min(1, c.occupied / eff));
}

function buildData(
  hospitals: Hospital[],
  thresholds: { min: number; max: number }
): { fc: FeatureCollection<Point, HospitalFeatureProps>; lookup: Map<string, HospitalDisplay> } {
  const features: Feature<Point, HospitalFeatureProps>[] = [];
  const lookup = new Map<string, HospitalDisplay>();
  for (const h of hospitals) {
    const cap = h.capacity;
    const ratio = overallOccupancyRatio(cap);
    const inRange = ratio >= thresholds.min && ratio <= thresholds.max;
    const ratios: Record<ResourceType, number> = {
      notaufnahme: ratioOf(cap.notaufnahme),
      op_saal: ratioOf(cap.op_saal),
      its_bett: ratioOf(cap.its_bett),
      normal_bett: ratioOf(cap.normal_bett),
    };
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: h.coords },
      properties: {
        id: h.id,
        color: ratioColorHex(ratio),
        radius: tierRadiusPx(h.tier),
        strokeColor: '#FFFFFF',
        strokeWidth: 2,
        opacity: inRange ? 1 : 0.18,
      },
    });
    lookup.set(h.id, { id: h.id, name: h.name, tier: h.tier, ratio, ratios, capacity: cap });
  }
  return { fc: { type: 'FeatureCollection', features }, lookup };
}

const TIER_LABEL: Record<Hospital['tier'], string> = {
  maximal: 'Maximalversorger',
  schwerpunkt: 'Schwerpunkt',
  regel: 'Regelversorger',
  grund: 'Grundversorger',
};

function tooltipHtml(d: HospitalDisplay): string {
  const bars = RESOURCE_TYPES.map((res) => {
    const r = d.ratios[res];
    const cap = d.capacity[res];
    const pct = Math.round(r * 100);
    const barColor = ratioColorHex(r);
    const label = RESOURCE_DISPLAY[res];
    const capText =
      !cap || cap.total === 0 ? '—' : `${cap.occupied}/${cap.total}`;
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
        <div class="rl-tooltip-name">${escapeHtml(d.name)}</div>
        <div class="rl-tooltip-tier">${TIER_LABEL[d.tier]}</div>
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
}

export function HospitalLayer({ map }: HospitalLayerProps) {
  const hospitalsRec = useSimStore((s) => s.hospitals);
  const thresholds = useSimStore((s) => s.filters.bedThresholds);
  const lookupRef = useRef<Map<string, HospitalDisplay>>(new Map());

  useEffect(() => {
    const { fc, lookup } = buildData(Object.values(hospitalsRec), thresholds);
    lookupRef.current = lookup;

    const ensureSourceAndLayers = () => {
      const existingSrc = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      if (existingSrc) {
        existingSrc.setData(fc);
      } else {
        map.addSource(SOURCE_ID, { type: 'geojson', data: fc });
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
            'circle-opacity': ['get', 'opacity'],
          },
        });
      }
    };

    if (map.isStyleLoaded()) {
      ensureSourceAndLayers();
    } else {
      map.once('load', ensureSourceAndLayers);
    }

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
      const id = (f.properties as HospitalFeatureProps | undefined)?.id;
      if (!id) return;
      const display = lookupRef.current.get(id);
      if (!display) return;
      popup
        .setLngLat(f.geometry.coordinates as [number, number])
        .setHTML(tooltipHtml(display))
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
      const id = (f.properties as HospitalFeatureProps | undefined)?.id;
      if (!id) return;
      useSimStore.getState().selectHospital(id);
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
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getLayer(LAYER_ID_HALO)) map.removeLayer(LAYER_ID_HALO);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map, hospitalsRec, thresholds]);

  return null;
}
