'use client';

import { useEffect, useMemo, useRef } from 'react';
import type {
  Map as MaplibreMap,
  GeoJSONSource,
} from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { Incident, Patient } from '@/lib/types';
import { useSimStore } from '@/lib/store';
import { getRouteSync } from '@/lib/routing';
import type { LngLat } from '@/lib/geo';
import type { Route } from '@/lib/types';

interface LineProps {
  patientId: string;
  color: string;
  dashed: number; // 1 = gestrichelt, 0 = durchgezogen
}

interface DotProps {
  patientId: string;
  color: string;
}

const SRC_LINES = 'rl-routes-lines';
const SRC_DOTS = 'rl-routes-dots';
const LAYER_LINES_SOLID = 'rl-routes-lines-solid';
const LAYER_LINES_DASH = 'rl-routes-lines-dash';
const LAYER_DOTS = 'rl-routes-dots';

const COLOR_MANV = '#007AFF';
const COLOR_TRANSFER = '#AF52DE';
const COLOR_PLANNED = '#34C759';

function colorForPatient(p: Patient): string {
  if (p.status === 'transferring') return COLOR_TRANSFER;
  if (p.source === 'planned-intake') return COLOR_PLANNED;
  return COLOR_MANV;
}

function positionAlong(polyline: LngLat[], fraction: number): LngLat {
  if (polyline.length === 0) return [0, 0];
  if (polyline.length === 1) return polyline[0];
  const f = Math.max(0, Math.min(1, fraction));
  // Gesamt-Laenge in Grad (nicht km — fuer gleichmaessige Interpolation reicht
  // euklidisch zwischen den Stuetzpunkten der Polyline).
  let total = 0;
  const segLens: number[] = [];
  for (let i = 1; i < polyline.length; i++) {
    const dx = polyline[i][0] - polyline[i - 1][0];
    const dy = polyline[i][1] - polyline[i - 1][1];
    const d = Math.hypot(dx, dy);
    segLens.push(d);
    total += d;
  }
  if (total === 0) return polyline[0];
  let target = f * total;
  for (let i = 0; i < segLens.length; i++) {
    if (target <= segLens[i]) {
      const t = segLens[i] === 0 ? 0 : target / segLens[i];
      return [
        polyline[i][0] + (polyline[i + 1][0] - polyline[i][0]) * t,
        polyline[i][1] + (polyline[i + 1][1] - polyline[i][1]) * t,
      ];
    }
    target -= segLens[i];
  }
  return polyline[polyline.length - 1];
}

function incidentLoc(patient: Patient, incidents: Incident[]): LngLat | null {
  if (patient.source === 'incident' && patient.sourceRefId) {
    const inc = incidents.find((i) => i.id === patient.sourceRefId);
    if (inc) return inc.location;
  }
  return null;
}

interface RouteLayerProps {
  map: MaplibreMap;
}

export function RouteLayer({ map }: RouteLayerProps) {
  const simTime = useSimStore((s) => s.simTime);
  const patients = useSimStore((s) => s.patients);
  const hospitals = useSimStore((s) => s.hospitals);
  const incidents = useSimStore((s) => s.incidents);

  // Stabile Referenzen fuer lookup.
  const hospitalsRef = useRef(hospitals);
  hospitalsRef.current = hospitals;

  // Ein-maliges Layer-Setup.
  useEffect(() => {
    const ensure = () => {
      if (!map.getSource(SRC_LINES)) {
        map.addSource(SRC_LINES, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }
      if (!map.getSource(SRC_DOTS)) {
        map.addSource(SRC_DOTS, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }
      if (!map.getLayer(LAYER_LINES_SOLID)) {
        map.addLayer({
          id: LAYER_LINES_SOLID,
          type: 'line',
          source: SRC_LINES,
          filter: ['==', ['get', 'dashed'], 0],
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 2,
            'line-opacity': 0.8,
          },
        });
      }
      if (!map.getLayer(LAYER_LINES_DASH)) {
        map.addLayer({
          id: LAYER_LINES_DASH,
          type: 'line',
          source: SRC_LINES,
          filter: ['==', ['get', 'dashed'], 1],
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 2,
            'line-opacity': 0.7,
            'line-dasharray': [3, 3],
          },
        });
      }
      if (!map.getLayer(LAYER_DOTS)) {
        map.addLayer({
          id: LAYER_DOTS,
          type: 'circle',
          source: SRC_DOTS,
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': 5,
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 2,
            'circle-opacity': 0.95,
          },
        });
      }
    };
    if (map.isStyleLoaded()) ensure();
    else map.once('load', ensure);
  }, [map]);

  // Snapshots fuer Lines und Dots jedes Ticks.
  const { lineFC, dotFC } = useMemo(() => {
    const lines: Array<Feature<LineString, LineProps>> = [];
    const dots: Array<Feature<Point, DotProps>> = [];

    for (const p of patients) {
      if (p.status !== 'transport' && p.status !== 'transferring') continue;

      let from: LngLat | null = null;
      let to: LngLat | null = null;

      if (p.status === 'transport') {
        from = incidentLoc(p, incidents);
        const targetId = p.assignedHospitalId;
        if (targetId) to = hospitalsRef.current[targetId]?.coords ?? null;
      } else {
        const srcId = p.assignedHospitalId;
        const tgtId = p.transferTargetHospitalId;
        if (srcId) from = hospitalsRef.current[srcId]?.coords ?? null;
        if (tgtId) to = hospitalsRef.current[tgtId]?.coords ?? null;
      }
      if (!from || !to || !p.arrivedAt) continue;

      const route: Route = getRouteSync(from, to);
      const poly = route.polyline.length > 1 ? route.polyline : [from, to];

      // Progress aus arrivedAt + durationSec ableiten.
      const durMin = route.durationSec / 60;
      const startSim = p.arrivedAt - durMin;
      const progress =
        durMin <= 0 ? 1 : Math.max(0, Math.min(1, (simTime - startSim) / durMin));

      const color = colorForPatient(p);
      lines.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: poly },
        properties: {
          patientId: p.id,
          color,
          dashed: route.source === 'haversine-fallback' ? 1 : 0,
        },
      });
      dots.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: positionAlong(poly, progress) },
        properties: { patientId: p.id, color },
      });
    }

    const lineFC: FeatureCollection<LineString, LineProps> = {
      type: 'FeatureCollection',
      features: lines,
    };
    const dotFC: FeatureCollection<Point, DotProps> = {
      type: 'FeatureCollection',
      features: dots,
    };
    return { lineFC, dotFC };
  }, [patients, incidents, simTime]);

  useEffect(() => {
    const apply = () => {
      const srcLines = map.getSource(SRC_LINES) as GeoJSONSource | undefined;
      const srcDots = map.getSource(SRC_DOTS) as GeoJSONSource | undefined;
      if (srcLines) srcLines.setData(lineFC);
      if (srcDots) srcDots.setData(dotFC);
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [map, lineFC, dotFC]);

  return null;
}
