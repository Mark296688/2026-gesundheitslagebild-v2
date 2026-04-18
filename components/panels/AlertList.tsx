'use client';

import { useMemo } from 'react';
import { useSimStore } from '@/lib/store';
import type { Alert, AlertSeverity } from '@/lib/types';

const SEV_COLOR: Record<AlertSeverity, string> = {
  info: 'var(--accent-blue)',
  warn: 'var(--accent-orange)',
  critical: 'var(--accent-red)',
};

const SEV_LABEL: Record<AlertSeverity, string> = {
  info: 'Info',
  warn: 'Warnung',
  critical: 'Kritisch',
};

const SEV_RANK: Record<AlertSeverity, number> = {
  critical: 0,
  warn: 1,
  info: 2,
};

export function AlertList() {
  const alerts = useSimStore((s) => s.alerts);
  const sorted = useMemo(() => {
    return [...alerts].sort((a, b) => {
      const resolvedDiff = (a.resolvedAt != null ? 1 : 0) - (b.resolvedAt != null ? 1 : 0);
      if (resolvedDiff !== 0) return resolvedDiff;
      const sev = SEV_RANK[a.severity] - SEV_RANK[b.severity];
      if (sev !== 0) return sev;
      return b.firedAt - a.firedAt;
    });
  }, [alerts]);

  if (sorted.length === 0) {
    return (
      <div className="text-caption" style={{ color: 'var(--text-tertiary)', padding: 12 }}>
        Keine Alarme.
      </div>
    );
  }

  return (
    <ul data-testid="alert-list" className="flex flex-col gap-2 pt-2">
      {sorted.map((a) => (
        <AlertCard key={a.id} alert={a} />
      ))}
    </ul>
  );
}

function AlertCard({ alert }: { alert: Alert }) {
  const resolved = alert.resolvedAt != null;
  return (
    <li
      className="flex items-start gap-2 rounded-md p-2"
      style={{
        background: resolved ? 'transparent' : 'var(--bg-elevated-2)',
        border: '1px solid var(--border-1)',
        opacity: resolved ? 0.55 : 1,
      }}
    >
      <div
        className="mt-1 flex-shrink-0 rounded-full"
        style={{
          width: 8,
          height: 8,
          background: SEV_COLOR[alert.severity],
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-label" style={{ color: 'var(--text-primary)' }}>
            {alert.title}
          </div>
          <div
            className="text-micro"
            style={{ color: SEV_COLOR[alert.severity] }}
          >
            {SEV_LABEL[alert.severity]}
          </div>
        </div>
        <div
          className="text-caption"
          style={{ color: 'var(--text-tertiary)', marginTop: 2 }}
        >
          {alert.detail}
        </div>
      </div>
    </li>
  );
}
