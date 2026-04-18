'use client';

import { useSimStore } from '@/lib/store';

const SPEEDS = [0.5, 1, 2, 5, 10] as const;

function formatSimClock(minutes: number): string {
  const d = Math.floor(minutes / (24 * 60));
  const h = Math.floor((minutes % (24 * 60)) / 60);
  const m = minutes % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}` : `${pad(h)}:${pad(m)}`;
}

export function Header() {
  const simTime = useSimStore((s) => s.simTime);
  const speed = useSimStore((s) => s.speed);
  const isRunning = useSimStore((s) => s.isRunning);
  const resume = useSimStore((s) => s.resume);
  const pause = useSimStore((s) => s.pause);
  const reset = useSimStore((s) => s.reset);
  const setSpeed = useSimStore((s) => s.setSpeed);

  return (
    <header
      data-testid="app-header"
      className="pointer-events-auto absolute inset-x-0 top-0 z-panel flex h-14 items-center justify-between px-4"
      style={{
        background: 'var(--bg-elevated)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        borderBottom: '1px solid var(--border-1)',
      }}
    >
      <div className="flex items-center gap-4">
        <div className="text-h3" style={{ fontWeight: 600 }}>
          Rettungsleitstelle
        </div>
        <div
          data-testid="sim-clock"
          className="font-mono"
          style={{
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
          }}
        >
          T+{formatSimClock(simTime)}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isRunning ? (
          <button
            type="button"
            data-testid="btn-pause"
            onClick={() => pause()}
            className="h-8 rounded-md px-3 text-sm font-medium"
            style={{
              background: 'var(--accent-blue)',
              color: 'var(--text-on-color)',
            }}
          >
            Pause
          </button>
        ) : (
          <button
            type="button"
            data-testid="btn-play"
            onClick={() => resume()}
            className="h-8 rounded-md px-3 text-sm font-medium"
            style={{
              background: 'var(--accent-blue)',
              color: 'var(--text-on-color)',
            }}
          >
            Play
          </button>
        )}

        <label className="flex items-center gap-1 text-caption" style={{ color: 'var(--text-tertiary)' }}>
          <span>Speed</span>
          <select
            data-testid="speed-select"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="h-8 rounded-md border px-2 text-sm"
            style={{
              background: 'var(--bg-elevated-2)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-2)',
            }}
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          data-testid="btn-reset"
          onClick={() => reset()}
          className="h-8 rounded-md px-3 text-sm"
          style={{
            background: 'var(--bg-elevated-2)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-2)',
          }}
        >
          Reset
        </button>
      </div>
    </header>
  );
}
