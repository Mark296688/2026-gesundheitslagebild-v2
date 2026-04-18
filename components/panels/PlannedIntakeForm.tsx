'use client';

import { useState } from 'react';
import { useSimStore } from '@/lib/store';
import { FLUGHAFEN_MUC_COORDS } from '@/lib/geo';

export function PlannedIntakeForm() {
  const announce = useSimStore((s) => s.announcePlannedIntake);
  const intakes = useSimStore((s) => s.plannedIntakes);

  const [label, setLabel] = useState('Medizinische Evakuierung — Soldaten MUC');
  const [totalPatients, setTotalPatients] = useState(750);
  const [flightCount, setFlightCount] = useState(3);
  const [flightIntervalMin, setFlightIntervalMin] = useState(45);
  const [prepWindowMin, setPrepWindowMin] = useState(1440);
  const [bufferRatio, setBufferRatio] = useState(0.15);

  const onAnnounce = () => {
    announce({
      label,
      totalPatients,
      flightCount,
      flightIntervalMin,
      prepWindowMin,
      bufferRatio,
      arrivalPoint: FLUGHAFEN_MUC_COORDS,
    });
  };

  return (
    <section data-testid="intake-form" className="flex flex-col gap-3">
      <div className="text-micro" style={{ color: 'var(--text-tertiary)' }}>
        Geplante Belegung
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-label" style={{ color: 'var(--text-secondary)' }}>Label</span>
        <input
          data-testid="intake-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-8 rounded-md px-2 text-sm"
          style={inputStyle}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Patienten"
          testId="intake-patients"
          value={totalPatients}
          min={50}
          max={2000}
          onChange={setTotalPatients}
        />
        <NumberField
          label="Fluege"
          testId="intake-flights"
          value={flightCount}
          min={1}
          max={10}
          onChange={setFlightCount}
        />
        <NumberField
          label="Intervall (Min)"
          testId="intake-interval"
          value={flightIntervalMin}
          min={15}
          max={180}
          onChange={setFlightIntervalMin}
        />
        <NumberField
          label="Vorlauf (Min)"
          testId="intake-prep"
          value={prepWindowMin}
          min={60}
          max={4320}
          onChange={setPrepWindowMin}
        />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-label" style={{ color: 'var(--text-secondary)' }}>
          Puffer {Math.round(bufferRatio * 100)} %
        </span>
        <input
          data-testid="intake-buffer"
          type="range"
          min={0.05}
          max={0.3}
          step={0.01}
          value={bufferRatio}
          onChange={(e) => setBufferRatio(Number(e.target.value))}
        />
      </label>

      <button
        type="button"
        data-testid="btn-announce-intake"
        onClick={onAnnounce}
        className="h-8 rounded-md text-sm font-medium"
        style={{
          background: 'var(--accent-blue)',
          color: 'var(--text-on-color)',
        }}
      >
        Ankuendigen
      </button>

      {intakes.length > 0 ? (
        <ul data-testid="intake-list" className="flex flex-col gap-1">
          {intakes.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between rounded-sm px-2 py-1 text-caption"
              style={{ background: 'var(--bg-subtle)', color: 'var(--text-primary)' }}
            >
              <span>{i.label}</span>
              <span className="font-mono" style={{ color: 'var(--text-tertiary)' }}>
                {i.status} · {i.totalPatients}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-elevated-2)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-2)',
};

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  testId?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-label" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <input
        type="number"
        data-testid={testId}
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 rounded-md px-2 text-sm"
        style={inputStyle}
      />
    </label>
  );
}
