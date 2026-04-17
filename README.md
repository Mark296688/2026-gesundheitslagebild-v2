# Rettungsleitstelle

Map-zentriertes Leitstand-Dashboard für die Einsatzleitung im Raum München. Simuliert in Echtzeit, wie drei Belastungsquellen die Kliniklandschaft gegeneinander verschieben — **Normalbetrieb**, **MANV-Fälle** und **geplante Grossbelegungen** — und macht die gegenseitige Interferenz sichtbar.

Alles client-only, keine Backend-Abhängigkeiten, deterministisch bei gleichem Seed.

## Tech-Stack

Next.js 14 (App Router) · TypeScript strict · Tailwind CSS · shadcn/ui · MapLibre GL JS · OSRM · Zustand · Recharts · IndexedDB (`idb`) · Vitest · Playwright · pnpm.

## Voraussetzungen

- Node.js ≥ 20
- pnpm ≥ 10

## Schnellstart

```bash
pnpm install
pnpm tsx scripts/gen-hospitals.ts   # einmalig: Excel → lib/data/hospitals.json
pnpm dev                             # → http://localhost:3000
```

## Scripts

| Script | Zweck |
|---|---|
| `pnpm dev` | Next-Dev-Server auf Port 3000 |
| `pnpm build` | Produktions-Build |
| `pnpm start` | Produktions-Server nach Build |
| `pnpm lint` | `next lint` (ESLint + Core-Web-Vitals) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest (unit + integration) |
| `pnpm test:watch` | Vitest Watch-Modus |
| `pnpm test:e2e` | Playwright (e2e) |
| `pnpm format` | Prettier über das ganze Repo |

## Projekt-Dokumentation

Verbindliche Spezifikation in `doc/`:

1. `doc/START_HERE.md` — autonomer Einstiegspunkt
2. `doc/SPEC.md` — Produktvertrag
3. `doc/BOOTSTRAP.md` — Phasen-Gates, Anti-Patterns, Autonomie-Regeln
4. `doc/PHASES.md` — schrittweise Arbeitsanleitung
5. `doc/DATA_MODEL.md`, `doc/DATA_GENERATION.md`
6. `doc/SIMULATION.md`, `doc/ROUTING.md`, `doc/SCENARIOS.md`, `doc/MEASURES.md`
7. `doc/DESIGN.md`, `doc/UI.md`, `doc/TIMELINE.md`
8. `doc/AUDIT.md`, `doc/TESTING.md`

Laufender Projektstand in `STATUS.md`, Claude-Kontext in `CLAUDE.md`.

## Datenquelle

`doc/Krankenhäuser_München.xlsx` — 49 Kliniken im Grossraum München mit Koordinaten, Abteilungen, Betten und Intensivbetten. Einmalige Konvertierung per `scripts/gen-hospitals.ts` nach `lib/data/hospitals.json`.

## Architektur-Leitplanken

- **Kein Backend.** Keine DB auf dem Server. Keine API-Keys. Kein Auth.
- **Deterministisch** bei gleichem Seed + gleicher Aktionsfolge.
- **Phasen-Gating** strikt gemäss `doc/PHASES.md` — erst Gate grün (`build/typecheck/lint/test`), dann nächste Phase.
- **Liquid-Glass-Ästhetik** laut `doc/DESIGN.md`. Kein Dark-Mode-Erbe.

## Lizenz

UNLICENSED (intern).
