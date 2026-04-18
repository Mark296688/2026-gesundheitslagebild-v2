'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSimStore } from '@/lib/store';
import {
  computeForkPreview,
  type ForkPreviewResult,
  type TimelinePoint,
} from '@/lib/simulation/fork-preview';

type CurveKey = 'overall' | 'its_bett' | 'op_saal' | 'notaufnahme';

const CURVE_COLOR: Record<CurveKey, string> = {
  overall: 'var(--chart-1)',
  its_bett: 'var(--chart-2)',
  op_saal: 'var(--chart-3)',
  notaufnahme: 'var(--chart-4)',
};

const CURVE_LABEL: Record<CurveKey, string> = {
  overall: 'Gesamt',
  its_bett: 'ITS',
  op_saal: 'OP',
  notaufnahme: 'Notaufnahme',
};

const PREVIEW_DEBOUNCE_MS = 150;
const HORIZON_MIN = 240;
const PADDING_X = 16;
const PADDING_Y = 14;

export function TimelineStrip() {
  const simTime = useSimStore((s) => s.simTime);
  const history = useSimStore((s) => s.occupancyHistory);
  const hoveredRecId = useSimStore((s) => s.hoveredRecommendationId);
  const [highlighted, setHighlighted] = useState<CurveKey | null>(null);
  const [preview, setPreview] = useState<ForkPreviewResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced Fork-Preview on Rec-Hover.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!hoveredRecId) {
      setPreview(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      const state = useSimStore.getState();
      const rec = state.recommendations.find((r) => r.id === hoveredRecId);
      if (!rec) return;
      const cached = state.forkPreviewCache[rec.id];
      if (cached && (cached as ForkPreviewResult).computedAt === state.simTime) {
        setPreview(cached as ForkPreviewResult);
        return;
      }
      const result = computeForkPreview(state, rec, HORIZON_MIN);
      useSimStore.setState({
        forkPreviewCache: { ...state.forkPreviewCache, [rec.id]: result },
      });
      setPreview(result);
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [hoveredRecId, simTime]);

  const { width, height, curves, tsStart, tsEnd } = useTimelineGeom(history, preview);

  return (
    <footer
      data-testid="timeline-strip"
      className="pointer-events-auto absolute inset-x-4 bottom-4 z-panel rounded-lg"
      style={{
        height: 160,
        background: 'var(--bg-elevated)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--border-1)',
        boxShadow: 'var(--shadow-panel)',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-1 text-caption"
        style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-1)' }}
      >
        <div className="flex gap-3">
          {(Object.keys(CURVE_LABEL) as CurveKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onMouseEnter={() => setHighlighted(k)}
              onMouseLeave={() => setHighlighted(null)}
              className="flex items-center gap-1"
              data-testid={`timeline-legend-${k}`}
              style={{ color: 'var(--text-secondary)' }}
            >
              <span
                className="inline-block rounded-full"
                style={{ width: 8, height: 8, background: CURVE_COLOR[k] }}
              />
              {CURVE_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="font-mono">
          T+{simTime} · Prognose {HORIZON_MIN} min
        </div>
      </div>

      <svg
        data-testid="timeline-svg"
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        {/* Kritisch-Zonen (>= 95 %) als Hintergrund-Band */}
        <rect
          x={0}
          y={PADDING_Y}
          width={width}
          height={((1 - 0.95) * (height - PADDING_Y * 2)) + 0.5}
          fill="var(--accent-red)"
          fillOpacity={0.06}
        />
        {/* Scrubber bei Jetzt */}
        {curves.nowX != null ? (
          <line
            x1={curves.nowX}
            x2={curves.nowX}
            y1={PADDING_Y}
            y2={height - PADDING_Y}
            stroke="var(--accent-blue)"
            strokeWidth={1}
            strokeDasharray="2,3"
            opacity={0.6}
          />
        ) : null}

        {/* Historie-Kurven */}
        {(Object.keys(CURVE_LABEL) as CurveKey[]).map((k) => (
          <polyline
            key={`hist-${k}`}
            fill="none"
            stroke={CURVE_COLOR[k]}
            strokeWidth={highlighted === null || highlighted === k ? 2 : 1}
            opacity={highlighted === null || highlighted === k ? 0.9 : 0.25}
            points={curves.history[k]}
          />
        ))}

        {/* Fork-Preview-Overlay (gestrichelt) */}
        {preview ? (
          <>
            <polyline
              data-testid="fork-preview-overlay"
              fill="none"
              stroke={
                preview.diff.peakLoadDelta < -2
                  ? 'var(--accent-green)'
                  : preview.diff.peakLoadDelta > 2
                    ? 'var(--accent-red)'
                    : 'var(--accent-blue)'
              }
              strokeWidth={2}
              strokeDasharray="4,4"
              points={curves.previewWith}
            />
            <polyline
              fill="none"
              stroke="var(--text-tertiary)"
              strokeWidth={1}
              strokeDasharray="2,4"
              points={curves.previewWithout}
              opacity={0.4}
            />
          </>
        ) : null}

        {/* X-Achsen-Labels (min) */}
        <text
          x={PADDING_X}
          y={height - 2}
          fontSize={10}
          fill="var(--text-tertiary)"
        >
          T+{tsStart}
        </text>
        <text
          x={width - PADDING_X - 24}
          y={height - 2}
          fontSize={10}
          fill="var(--text-tertiary)"
          textAnchor="end"
        >
          T+{tsEnd}
        </text>
      </svg>
    </footer>
  );
}

function useTimelineGeom(
  history: TimelinePoint[] | Array<{ simTime: number; overall: number; totals: Record<string, { total: number; occupied: number }> }>,
  preview: ForkPreviewResult | null
) {
  return useMemo(() => {
    const width = 1200;
    const height = 140;
    const plotH = height - PADDING_Y * 2;
    // Zeitfenster: letzte 120 Sim-min + HORIZON_MIN Prognose.
    const now = preview?.computedAt ?? (history.length ? history[history.length - 1].simTime : 0);
    const tsStart = Math.max(0, now - 120);
    const tsEnd = now + HORIZON_MIN;
    const span = Math.max(1, tsEnd - tsStart);
    const xFor = (t: number) =>
      PADDING_X + ((t - tsStart) / span) * (width - PADDING_X * 2);
    const yFor = (v: number) => PADDING_Y + (1 - Math.max(0, Math.min(1, v))) * plotH;

    const buildPoints = (pts: Array<{ simTime: number } & Record<string, number>>, key: string) =>
      pts
        .filter((p) => p.simTime >= tsStart && p.simTime <= tsEnd)
        .map((p) => `${xFor(p.simTime).toFixed(1)},${yFor((p as Record<string, number>)[key]).toFixed(1)}`)
        .join(' ');

    // Fuer die Historie haben wir occupancyHistory (global) — pro-Ressource
    // Auslastung rechnen wir aus totals.
    const historyAsPoints = (history as Array<{ simTime: number; overall: number; totals?: Record<string, { total: number; occupied: number }> }>).map((p) => {
      const t = p.totals;
      const r = (key: 'its_bett' | 'op_saal' | 'notaufnahme') => {
        const c = t?.[key];
        return c && c.total > 0 ? c.occupied / c.total : 0;
      };
      return {
        simTime: p.simTime,
        overall: p.overall,
        its_bett: r('its_bett'),
        op_saal: r('op_saal'),
        notaufnahme: r('notaufnahme'),
      };
    });

    const historyPolylines = {
      overall: buildPoints(historyAsPoints, 'overall'),
      its_bett: buildPoints(historyAsPoints, 'its_bett'),
      op_saal: buildPoints(historyAsPoints, 'op_saal'),
      notaufnahme: buildPoints(historyAsPoints, 'notaufnahme'),
    };

    const previewWith = preview
      ? preview.curveWith
          .map(
            (p) => `${xFor(p.simTime).toFixed(1)},${yFor(p.overall).toFixed(1)}`
          )
          .join(' ')
      : '';
    const previewWithout = preview
      ? preview.curveWithout
          .map(
            (p) => `${xFor(p.simTime).toFixed(1)},${yFor(p.overall).toFixed(1)}`
          )
          .join(' ')
      : '';

    return {
      width,
      height,
      tsStart,
      tsEnd,
      curves: {
        history: historyPolylines,
        previewWith,
        previewWithout,
        nowX: xFor(now),
      },
    };
  }, [history, preview]);
}
