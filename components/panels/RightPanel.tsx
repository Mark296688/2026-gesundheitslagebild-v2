'use client';

import { useState, type ReactNode } from 'react';
import { useSimStore } from '@/lib/store';
import { AlertList } from './AlertList';
import { RecommendationList } from './RecommendationList';
import { HospitalDetailPanel } from './HospitalDetailPanel';
import { AuditLogPanel } from './AuditLogPanel';
import { HospitalLoadList } from './HospitalLoadList';

type Tab = 'load' | 'alerts' | 'recs' | 'hospital' | 'audit';

const TAB_LABEL: Record<Tab, string> = {
  load: 'Auslastung',
  alerts: 'Alarme',
  recs: 'Empfehlungen',
  hospital: 'Klinik',
  audit: 'Audit',
};

export function RightPanel() {
  const alerts = useSimStore((s) => s.alerts);
  const recommendations = useSimStore((s) => s.recommendations);
  const selectedHospitalId = useSimStore((s) => s.selectedHospitalId);
  const [tab, setTab] = useState<Tab>('load');

  // Auto-switch auf Klinik-Tab bei Klinik-Click.
  const effectiveTab =
    tab === 'hospital' && !selectedHospitalId ? 'alerts' : tab;

  const unresolvedAlertCount = alerts.filter((a) => a.resolvedAt == null).length;
  const openRecCount = recommendations.filter((r) => !r.executedAt).length;

  return (
    <aside
      data-testid="right-panel"
      className="pointer-events-auto absolute right-4 top-[72px] z-panel flex w-[380px] flex-col gap-3 rounded-lg"
      style={{
        background: 'var(--bg-elevated)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--border-1)',
        boxShadow: 'var(--shadow-panel)',
        maxHeight: 'calc(100vh - 96px)',
        overflow: 'hidden',
      }}
    >
      <div
        className="flex"
        style={{ borderBottom: '1px solid var(--border-1)' }}
      >
        <TabButton
          active={effectiveTab === 'load'}
          onClick={() => setTab('load')}
          testId="tab-load"
        >
          {TAB_LABEL.load}
        </TabButton>
        <TabButton
          active={effectiveTab === 'alerts'}
          onClick={() => setTab('alerts')}
          testId="tab-alerts"
        >
          {TAB_LABEL.alerts}
          {unresolvedAlertCount > 0 ? <Pill count={unresolvedAlertCount} /> : null}
        </TabButton>
        <TabButton
          active={effectiveTab === 'recs'}
          onClick={() => setTab('recs')}
          testId="tab-recs"
        >
          {TAB_LABEL.recs}
          {openRecCount > 0 ? <Pill count={openRecCount} /> : null}
        </TabButton>
        <TabButton
          active={effectiveTab === 'hospital'}
          onClick={() => setTab('hospital')}
          testId="tab-hospital"
          disabled={!selectedHospitalId}
        >
          {TAB_LABEL.hospital}
        </TabButton>
        <TabButton
          active={effectiveTab === 'audit'}
          onClick={() => setTab('audit')}
          testId="tab-audit"
        >
          {TAB_LABEL.audit}
        </TabButton>
      </div>

      <div className="flex-1 overflow-auto px-3 pb-3">
        {effectiveTab === 'load' ? <HospitalLoadList /> : null}
        {effectiveTab === 'alerts' ? <AlertList /> : null}
        {effectiveTab === 'recs' ? <RecommendationList /> : null}
        {effectiveTab === 'hospital' ? <HospitalDetailPanel /> : null}
        {effectiveTab === 'audit' ? <AuditLogPanel /> : null}
      </div>
    </aside>
  );
}

function TabButton({
  children,
  active,
  onClick,
  disabled,
  testId,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className="relative flex flex-1 items-center justify-center gap-1 px-2 py-2 text-label"
      style={{
        color: disabled
          ? 'var(--text-disabled)'
          : active
            ? 'var(--text-primary)'
            : 'var(--text-secondary)',
        borderBottom: active ? '2px solid var(--accent-blue)' : '2px solid transparent',
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function Pill({ count }: { count: number }) {
  return (
    <span
      className="inline-flex min-w-[18px] items-center justify-center rounded-full px-1 font-mono"
      style={{
        background: 'var(--accent-blue-soft)',
        color: 'var(--accent-blue)',
        fontSize: 10,
        height: 16,
      }}
    >
      {count}
    </span>
  );
}
