'use client';

import { useMemo } from 'react';
import { useSimStore } from '@/lib/store';
import { RESOURCE_TYPES, RESOURCE_DISPLAY } from '@/lib/data/resources';
import { effectiveTotal } from '@/lib/simulation/router';
import { RESOURCE_THRESHOLDS } from '@/lib/simulation/detection';
import type { Capacity, Hospital, ResourceType } from '@/lib/types';

function ratioOf(c: Capacity): number {
  const eff = effectiveTotal(c);
  return eff === 0 ? 0 : Math.max(0, Math.min(1, c.occupied / eff));
}

function barColor(ratio: number, resource: ResourceType): string {
  const t = RESOURCE_THRESHOLDS[resource];
  if (ratio >= t.critical) return 'var(--accent-red)';
  if (ratio >= t.warn) return 'var(--accent-orange)';
  if (ratio >= 0.6) return 'var(--accent-yellow)';
  return 'var(--accent-green)';
}

// "Kritisch" gewichtet — Notaufnahme/OP staerker.
function criticalityScore(h: Hospital): number {
  const notaufnahme = ratioOf(h.capacity.notaufnahme) * 1.4;
  const op = ratioOf(h.capacity.op_saal) * 1.3;
  const its = ratioOf(h.capacity.its_bett) * 1.2;
  const normal = ratioOf(h.capacity.normal_bett) * 0.8;
  return Math.max(notaufnahme, op, its, normal);
}

export function HospitalLoadList() {
  const hospitals = useSimStore((s) => s.hospitals);
  const selectHospital = useSimStore((s) => s.selectHospital);

  const sorted = useMemo(() => {
    return Object.values(hospitals)
      .map((h) => ({ h, score: criticalityScore(h) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((x) => x.h);
  }, [hospitals]);

  if (sorted.length === 0) {
    return (
      <div
        className="text-caption"
        style={{ color: 'var(--text-tertiary)', padding: 12 }}
      >
        Keine Kliniken im Store.
      </div>
    );
  }

  return (
    <ul data-testid="hospital-load-list" className="flex flex-col gap-2 pt-2">
      {sorted.map((h) => (
        <HospitalLoadRow key={h.id} hospital={h} onSelect={() => selectHospital(h.id)} />
      ))}
    </ul>
  );
}

function HospitalLoadRow({
  hospital,
  onSelect,
}: {
  hospital: Hospital;
  onSelect: () => void;
}) {
  return (
    <li
      className="rounded-md p-2 cursor-pointer"
      onClick={onSelect}
      style={{
        background: 'var(--bg-elevated-2)',
        border: '1px solid var(--border-1)',
      }}
    >
      <div className="text-label" style={{ color: 'var(--text-primary)', marginBottom: 4 }}>
        {hospital.name}
      </div>
      <div className="grid" style={{ gridTemplateColumns: '56px 1fr 44px', rowGap: 3, columnGap: 6 }}>
        {RESOURCE_TYPES.map((r) => {
          const cap = hospital.capacity[r];
          const eff = effectiveTotal(cap);
          const ratio = ratioOf(cap);
          const pct = Math.round(ratio * 100);
          return (
            <FragmentRow
              key={r}
              label={RESOURCE_DISPLAY[r]}
              ratio={ratio}
              color={barColor(ratio, r)}
              numText={eff === 0 ? '—' : `${cap.occupied}/${eff}`}
              pct={pct}
            />
          );
        })}
      </div>
    </li>
  );
}

function FragmentRow({
  label,
  ratio,
  color,
  numText,
}: {
  label: string;
  ratio: number;
  color: string;
  numText: string;
  pct: number;
}) {
  return (
    <>
      <div
        className="text-caption"
        style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: '14px' }}
      >
        {label}
      </div>
      <div
        style={{
          height: 6,
          background: 'var(--bg-subtle)',
          borderRadius: 3,
          overflow: 'hidden',
          alignSelf: 'center',
        }}
      >
        <div
          style={{
            width: `${Math.min(100, ratio * 100)}%`,
            height: '100%',
            background: color,
            transition: 'width 180ms cubic-bezier(0.2, 0.7, 0.2, 1)',
          }}
        />
      </div>
      <div
        className="font-mono text-caption"
        style={{ color: 'var(--text-primary)', fontSize: 11, textAlign: 'right' }}
      >
        {numText}
      </div>
    </>
  );
}
