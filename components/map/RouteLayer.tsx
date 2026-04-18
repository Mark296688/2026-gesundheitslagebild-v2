'use client';

import { useEffect, useMemo } from 'react';
import type {
  Map as MaplibreMap,
  GeoJSONSource,
} from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { Incident, Patient } from '@/lib/types';
import { useSimStore } from '@/lib/store';
import { flowPath, flowPosition, flowDurationMin } from '@/lib/flow';
import type { LngLat } from '@/lib/geo';

interface LineProps {
  patientId: string;
  color: string;
}

interface DotProps {
  patientId: string;
  color: string;
}

const SRC_LINES = 'rl-routes-lines';
const SRC_DOTS = 'rl-routes-dots';
const LAYER_LINES = 'rl-routes-lines';
const LAYER_DOTS = 'rl-routes-dots';

const COLOR_MANV = '#007AFF';
const COLOR_TRANSFER = '#AF52DE';
const COLOR_PLANNED = '#34C759';

function colorForPatient(p: Patient): string {
  if (p.status === 'transferring') return COLOR_TRANSFER;
  if (p.source === 'planned-intake') return COLOR_PLANNED;
  return COLOR_MANV;
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
      if (!map.getLayer(LAYER_LINES)) {
        map.addLayer({
          id: LAYER_LINES,
          type: 'line',
          source: SRC_LINES,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 2,
            'line-opacity': 0.75,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
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
        if (targetId) to = hospitals[targetId]?.coords ?? null;
      } else {
        const srcId = p.assignedHospitalId;
        const tgtId = p.transferTargetHospitalId;
        if (srcId) from = hospitals[srcId]?.coords ?? null;
        if (tgtId) to = hospitals[tgtId]?.coords ?? null;
      }
      if (!from || !to || p.arrivedAt == null) continue;

      const poly = flowPath(from, to);
      const durMin = flowDurationMin(from, to);
      const startSim = p.arrivedAt - durMin;
      const progress =
        durMin <= 0 ? 1 : Math.max(0, Math.min(1, (simTime - startSim) / durMin));

      const color = colorForPatient(p);
      lines.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: poly },
        properties: { patientId: p.id, color },
      });
      dots.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: flowPosition(from, to, progress) },
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
  }, [patients, incidents, hospitals, simTime]);

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
