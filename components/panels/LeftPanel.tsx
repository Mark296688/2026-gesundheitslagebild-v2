'use client';

import type { ReactNode } from 'react';

export function LeftPanel({ children }: { children: ReactNode }) {
  return (
    <aside
      data-testid="left-panel"
      className="pointer-events-auto absolute left-4 top-[72px] z-panel flex w-[320px] flex-col gap-4 rounded-lg p-3"
      style={{
        background: 'var(--bg-elevated)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--border-1)',
        boxShadow: 'var(--shadow-panel)',
        maxHeight: 'calc(100vh - 96px)',
        overflow: 'auto',
      }}
    >
      {children}
    </aside>
  );
}
