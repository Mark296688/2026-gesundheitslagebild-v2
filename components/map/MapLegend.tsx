'use client';

// Kleine Legende am unteren linken Rand der Map — erklaert Flow-Farben und
// Klinik-Farben.
export function MapLegend() {
  return (
    <div
      data-testid="map-legend"
      className="pointer-events-none absolute z-panel rounded-md"
      style={{
        left: 344, // rechts vom Left-Panel (320 + 4 + 20)
        bottom: 184, // ueber der Timeline
        background: 'var(--bg-elevated-2)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--border-1)',
        padding: '6px 10px',
        fontSize: 11,
        lineHeight: '14px',
        color: 'var(--text-secondary)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div
        style={{
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontSize: 10,
        }}
      >
        Patientenfluesse
      </div>
      <LegendRow color="#007AFF" label="MANV-Transport zu Klinik" />
      <LegendRow color="#00C853" label="Soldaten vom Flughafen" />
      <LegendRow color="#AF52DE" label="Verlegung zwischen Kliniken" />
      <div
        style={{
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginTop: 8,
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontSize: 10,
        }}
      >
        Klinik-Auslastung
      </div>
      <LegendRow color="#34C759" label="unter 60 %" />
      <LegendRow color="#FFCC00" label="60 – 80 %" />
      <LegendRow color="#FF9500" label="80 – 95 %" />
      <LegendRow color="#FF3B30" label="ab 95 %" />
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 2 }}>
      <span
        style={{
          display: 'inline-block',
          width: 12,
          height: 12,
          borderRadius: 6,
          background: color,
          flexShrink: 0,
        }}
      />
      <span>{label}</span>
    </div>
  );
}
