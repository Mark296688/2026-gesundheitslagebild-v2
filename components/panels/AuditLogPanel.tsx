'use client';

import { useSimStore } from '@/lib/store';

export function AuditLogPanel() {
  const recs = useSimStore((s) => s.recommendations);
  const executed = recs.filter((r) => r.executedAt != null);

  if (executed.length === 0) {
    return (
      <div
        className="text-caption"
        style={{ color: 'var(--text-tertiary)', padding: 12 }}
      >
        Keine Massnahmen ausgefuehrt. Das Audit-Log erhaelt in Phase 10 die
        volle Event-Historie (doc/AUDIT.md).
      </div>
    );
  }

  return (
    <ul data-testid="audit-log" className="flex flex-col gap-1 pt-2">
      {[...executed]
        .sort((a, b) => (b.executedAt ?? 0) - (a.executedAt ?? 0))
        .map((r) => (
          <li
            key={r.id}
            className="rounded-md p-2 text-caption"
            style={{
              background: 'var(--bg-elevated-2)',
              border: '1px solid var(--border-1)',
              color: 'var(--text-primary)',
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div>{r.title}</div>
              <div
                className="font-mono"
                style={{ color: 'var(--text-tertiary)' }}
              >
                T+{r.executedAt}
              </div>
            </div>
            <div
              className="text-caption"
              style={{ color: 'var(--text-tertiary)', marginTop: 2 }}
            >
              {r.action}
            </div>
          </li>
        ))}
    </ul>
  );
}
