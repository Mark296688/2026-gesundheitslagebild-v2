'use client';

import { useState } from 'react';
import { useSimStore } from '@/lib/store';
import {
  SCENARIO_TEMPLATES,
  createIncidentFromScenario,
} from '@/lib/simulation/scenarios';
import { seededRng } from '@/lib/simulation/rng';

export function IncidentLauncher() {
  const simTime = useSimStore((s) => s.simTime);
  const seed = useSimStore((s) => s.seed);
  const incidents = useSimStore((s) => s.incidents);
  const launchIncident = useSimStore((s) => s.launchIncident);

  const [selected, setSelected] = useState<string>(SCENARIO_TEMPLATES[0].id);
  const [perturbLocation, setPerturbLocation] = useState(false);

  const active = incidents.filter((i) => i.id.startsWith(selected));

  const onStart = () => {
    const rng = seededRng((seed ^ simTime) + active.length);
    const incident = createIncidentFromScenario(selected, simTime, rng, {
      perturbLocation: perturbLocation || active.length > 0,
    });
    if (!incident) return;
    launchIncident(incident);
  };

  return (
    <section
      data-testid="incident-launcher"
      className="flex flex-col gap-3"
    >
      <div className="text-micro" style={{ color: 'var(--text-tertiary)' }}>
        Einsaetze
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-label" style={{ color: 'var(--text-secondary)' }}>
          Szenario
        </span>
        <select
          data-testid="scenario-select"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-8 rounded-md px-2 text-sm"
          style={{
            background: 'var(--bg-elevated-2)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-2)',
          }}
        >
          {SCENARIO_TEMPLATES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} ({s.estimatedCasualties})
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-caption" style={{ color: 'var(--text-secondary)' }}>
        <input
          data-testid="perturb-checkbox"
          type="checkbox"
          checked={perturbLocation}
          onChange={(e) => setPerturbLocation(e.target.checked)}
        />
        <span>Ort leicht variieren (parallel starten)</span>
      </label>

      <button
        type="button"
        data-testid="btn-launch-incident"
        onClick={onStart}
        className="h-8 rounded-md text-sm font-medium"
        style={{
          background: 'var(--accent-blue)',
          color: 'var(--text-on-color)',
        }}
      >
        Einsatz starten
      </button>

      {incidents.length > 0 ? (
        <div className="rl-incident-list" data-testid="active-incidents">
          <div className="text-micro" style={{ color: 'var(--text-tertiary)' }}>
            Aktiv ({incidents.length})
          </div>
          <ul className="flex flex-col gap-1">
            {incidents.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between rounded-sm px-2 py-1 text-caption"
                style={{ background: 'var(--bg-subtle)', color: 'var(--text-primary)' }}
              >
                <span>{i.label}</span>
                <span
                  className="font-mono"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {i.estimatedCasualties}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
