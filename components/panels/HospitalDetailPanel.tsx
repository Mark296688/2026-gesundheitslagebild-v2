'use client';

import { useMemo } from 'react';
import { useSimStore } from '@/lib/store';
import {
  RESOURCE_TYPES,
  RESOURCE_DISPLAY_LONG,
  RESOURCE_COLOR,
} from '@/lib/data/resources';
import {
  effectiveTotal,
  overallLoad,
} from '@/lib/simulation/router';
import type { ResourceType } from '@/lib/types';

const TIER_LABEL = {
  maximal: 'Maximalversorger',
  schwerpunkt: 'Schwerpunkt',
  regel: 'Regelversorger',
  grund: 'Grundversorger',
} as const;

export function HospitalDetailPanel() {
  const selectedId = useSimStore((s) => s.selectedHospitalId);
  const hospital = useSimStore((s) =>
    selectedId ? s.hospitals[selectedId] : undefined
  );
  const history = useSimStore((s) => s.occupancyHistory);
  const close = useSimStore((s) => s.selectHospital);

  const sparkline = useMemo(() => {
    // Gesamt-Auslastung aus occupancyHistory (Stride 5 min). Fuer MVP: global,
    // pro-Hospital-Historie kommt wenn noetig in einer spaeteren Phase.
    return history.slice(-48).map((h) => h.overall);
  }, [history]);

  if (!hospital) {
    return (
      <div className="text-caption" style={{ color: 'var(--text-tertiary)', padding: 12 }}>
        Keine Klinik ausgewaehlt. Klick einen Kreis auf der Karte.
      </div>
    );
  }

  const load = overallLoad(hospital.capacity);

  return (
    <div data-testid="hospital-detail" className="flex flex-col gap-3 pt-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-h3" style={{ color: 'var(--text-primary)' }}>
            {hospital.name}
          </div>
          <div className="text-caption" style={{ color: 'var(--text-tertiary)' }}>
            {TIER_LABEL[hospital.tier]} · {hospital.address.city}
          </div>
        </div>
        <button
          type="button"
          onClick={() => close(undefined)}
          className="text-caption"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Schliessen
        </button>
      </div>

      <div
        className="rounded-md p-2"
        style={{ background: 'var(--bg-elevated-2)', border: '1px solid var(--border-1)' }}
      >
        <div className="flex items-center justify-between">
          <div className="text-label" style={{ color: 'var(--text-secondary)' }}>
            Gesamt-Auslastung
          </div>
          <div
            className="font-mono"
            style={{
              color:
                load >= 0.95
                  ? 'var(--accent-red)'
                  : load >= 0.8
                    ? 'var(--accent-orange)'
                    : load >= 0.6
                      ? 'var(--accent-yellow)'
                      : 'var(--accent-green)',
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            {Math.round(load * 100)} %
          </div>
        </div>
        {sparkline.length > 1 ? <Sparkline values={sparkline} /> : null}
      </div>

      <ul className="flex flex-col gap-2" data-testid="hospital-capacity">
        {RESOURCE_TYPES.map((r) => (
          <CapacityRow key={r} resource={r} capacity={hospital.capacity[r]} />
        ))}
      </ul>

      <div className="text-caption" style={{ color: 'var(--text-tertiary)' }}>
        Personal: <span className="font-mono">{hospital.staff.onDuty}</span> im Dienst ·{' '}
        <span className="font-mono">{hospital.staff.onCall}</span> auf Abruf
      </div>
      <div className="text-caption" style={{ color: 'var(--text-tertiary)' }}>
        Eskalation: {hospital.escalation} · Elektiv {hospital.electiveActive ? 'laeuft' : 'gestoppt'}
      </div>
    </div>
  );
}

function CapacityRow({
  resource,
  capacity,
}: {
  resource: ResourceType;
  capacity: { total: number; occupied: number; surgeReserve: number; surgeActive: boolean };
}) {
  const eff = effectiveTotal(capacity);
  const pct = eff === 0 ? 0 : Math.min(1, capacity.occupied / eff);
  return (
    <li className="text-caption">
      <div className="flex items-center justify-between gap-2">
        <div style={{ color: 'var(--text-secondary)' }}>{RESOURCE_DISPLAY_LONG[resource]}</div>
        <div className="font-mono" style={{ color: 'var(--text-primary)' }}>
          {capacity.occupied} / {eff}
          {capacity.surgeActive ? (
            <span
              style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent-blue)' }}
            >
              Surge
            </span>
          ) : null}
        </div>
      </div>
      <div
        className="mt-1 h-[6px] rounded-full"
        style={{ background: 'var(--bg-subtle)', overflow: 'hidden' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct * 100}%`,
            background: RESOURCE_COLOR[resource],
          }}
        />
      </div>
    </li>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const width = 320;
  const height = 36;
  const min = 0;
  const max = 1;
  const xStep = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * xStep;
      const y = height - ((v - min) / (max - min)) * height;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg
      data-testid="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ marginTop: 6, width: '100%', height }}
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth={1.5}
        points={points}
      />
    </svg>
  );
}
