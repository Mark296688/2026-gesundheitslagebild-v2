'use client';

import { useMemo } from 'react';
import { useSimStore } from '@/lib/store';
import type { Recommendation, ExpectedImpact } from '@/lib/types';

const EFFORT_LABEL: Record<Recommendation['effortLevel'], string> = {
  low: 'Einfach',
  medium: 'Mittel',
  high: 'Aufwendig',
};

const EFFORT_COLOR: Record<Recommendation['effortLevel'], string> = {
  low: 'var(--accent-green)',
  medium: 'var(--accent-yellow)',
  high: 'var(--accent-orange)',
};

export function RecommendationList() {
  const recs = useSimStore((s) => s.recommendations);
  const execute = useSimStore((s) => s.executeRecommendation);

  const { open, done } = useMemo(() => {
    const o: Recommendation[] = [];
    const d: Recommendation[] = [];
    for (const r of recs) {
      if (r.executedAt != null) d.push(r);
      else o.push(r);
    }
    return { open: o, done: d };
  }, [recs]);

  if (recs.length === 0) {
    return (
      <div
        className="text-caption"
        style={{ color: 'var(--text-tertiary)', padding: 12 }}
      >
        Keine Empfehlungen.
      </div>
    );
  }

  return (
    <div data-testid="recommendation-list" className="flex flex-col gap-3 pt-2">
      {open.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {open.map((r) => (
            <RecommendationCard key={r.id} rec={r} onExecute={() => execute(r.id)} />
          ))}
        </ul>
      ) : null}
      {done.length > 0 ? (
        <div>
          <div
            className="text-micro"
            style={{ color: 'var(--text-tertiary)', padding: '4px 4px' }}
          >
            Ausgefuehrt ({done.length})
          </div>
          <ul className="flex flex-col gap-1">
            {done.map((r) => (
              <li
                key={r.id}
                className="rounded-md p-2 text-caption"
                style={{
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-tertiary)',
                }}
              >
                {r.title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function RecommendationCard({
  rec,
  onExecute,
}: {
  rec: Recommendation;
  onExecute: () => void;
}) {
  return (
    <li
      data-testid="recommendation-card"
      data-rec-id={rec.id}
      className="flex flex-col gap-2 rounded-md p-3"
      style={{
        background: 'var(--bg-elevated-2)',
        border: '1px solid var(--border-1)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-h3" style={{ color: 'var(--text-primary)' }}>
          {rec.title}
        </div>
        <div
          className="text-micro"
          style={{ color: EFFORT_COLOR[rec.effortLevel] }}
        >
          {EFFORT_LABEL[rec.effortLevel]}
        </div>
      </div>
      <div className="text-caption" style={{ color: 'var(--text-secondary)' }}>
        {rec.rationale}
      </div>
      <ImpactChips impact={rec.expectedImpact} />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          data-testid="btn-execute-rec"
          disabled={!rec.executable}
          onClick={onExecute}
          className="h-7 rounded-md px-3 text-sm font-medium"
          style={{
            background: rec.executable ? 'var(--accent-blue)' : 'var(--bg-subtle)',
            color: rec.executable ? 'var(--text-on-color)' : 'var(--text-disabled)',
            cursor: rec.executable ? 'pointer' : 'not-allowed',
          }}
        >
          Aktivieren
        </button>
      </div>
    </li>
  );
}

function ImpactChips({ impact }: { impact: ExpectedImpact }) {
  const chips: string[] = [];
  if (impact.bedsGained != null) chips.push(`+${impact.bedsGained} Betten`);
  if (impact.timeBoughtMin != null) chips.push(`+${impact.timeBoughtMin} min`);
  if (impact.patientsRerouted != null) chips.push(`${impact.patientsRerouted} Pat. umgeleitet`);
  if (impact.patientsRelocated != null) chips.push(`${impact.patientsRelocated} Pat. verlegt`);
  if (impact.occupancyDeltaPp != null) {
    const v = impact.occupancyDeltaPp;
    chips.push(`${v > 0 ? '+' : ''}${v} pp`);
  }
  if (chips.length === 0) return null;
  return (
    <div data-testid="impact-chips" className="flex flex-wrap gap-1">
      {chips.map((c, i) => (
        <span
          key={i}
          className="rounded-full px-2 py-[2px] font-mono"
          style={{
            background: 'var(--accent-blue-soft)',
            color: 'var(--accent-blue)',
            fontSize: 11,
          }}
        >
          {c}
        </span>
      ))}
    </div>
  );
}
