# Status — Rettungsleitstelle

## Aktueller Stand

| Feld | Wert |
|------|------|
| Aktive Phase | Phase 0 — Repo-Bootstrap |
| Aktueller Schritt | Schritt 0.1 erledigt (pnpm init + SPEC §2 Dependencies installiert, Peer-Pins gesetzt). Als naechstes Schritt 0.2: tsconfig + next.config + postcss + .eslintrc |
| Session | 1 |
| Letztes Update | 2026-04-18 |
| Blockiert durch | — |
| Naechste Aktion | Schritt 0.2: `tsconfig.json` strict + `next.config.mjs` + `postcss.config.mjs` + `.eslintrc.json` anlegen |

## Changelog

### Session 1 — 2026-04-18
- **00:14** — Projekt mit /einrichten initialisiert
- Git-Repo initialisiert (steht an — noch kein `git init` ausgefuehrt)
- STATUS.md, `.claude/settings.json`, `.claude/commands/{status,catchup,next-phase}.md`, `.gitignore`, `.env.example` erstellt
- `doc/Krankenhaeuser_Muenchen.xlsx` (49 Kliniken) vorhanden
- **00:27** — Loop-Infrastruktur: `/next-phase`-Command (Gate-respektierend) + Stop-Hook (`.claude/hooks/on-stop.sh`)
- **00:35** — Vollstaendige Dokumentation angelegt:
  - `CLAUDE.md` (Projektkontext)
  - `doc/START_HERE.md`, `doc/SPEC.md`, `doc/BOOTSTRAP.md`, `doc/PHASES.md`
  - `doc/DATA_MODEL.md`, `doc/DATA_GENERATION.md`
  - `doc/SIMULATION.md`, `doc/ROUTING.md`, `doc/SCENARIOS.md`, `doc/MEASURES.md`
  - `doc/DESIGN.md`, `doc/UI.md`, `doc/TIMELINE.md`
  - `doc/AUDIT.md`, `doc/TESTING.md`
- **00:44** — Phase 0, Schritt 0.1: `pnpm init` + `package.json` mit allen Scripts (dev/build/start/lint/typecheck/test/test:e2e/format). SPEC-§2-Dependencies installiert: next@14, react@18, maplibre-gl, zustand, recharts, idb, exceljs (runtime); tailwind@3, typescript, vitest, @playwright/test, RTL-Toolkit, eslint@9 + eslint-config-next@14, tsx, prettier (dev). Peer-Pins gesetzt (eslint, @types/react, eslint-config-next) damit Gate gruenbar bleibt.

## Loop-Betrieb

Fuer autonomes Weiterarbeiten:
- `/loop /next-phase` (dynamisch, Claude pacet selbst) — arbeitet Phase fuer Phase, respektiert Gates
- Stop-Hook pflegt "Letztes Update" in STATUS.md und `.claude/session.log`
- Gate erreicht oder Blocker → Loop meldet und stoppt, wartet auf Freigabe

## Offene Aktionen
- [ ] Phase 0 — Repo-Bootstrap (git init, pnpm init, Pakete, tsconfig, shadcn init, Next.js-Shell, Testrunner, STATUS-Skelett)
- [ ] Phase 1 — Datenmodell & Typen (`lib/types.ts`, `lib/data/resources.ts`, `lib/geo.ts`)
- [ ] Phase 2 — Excel-Parser + `hospitals.json` (`scripts/gen-hospitals.ts`)
- [ ] Phase 3 — Map-Basis + Kliniken-Layer (helles CartoDB Positron)
- [ ] Phase 4 — Simulation-Engine-Kern + Store (Tick-Loop, Allocation, Detection, Recommendations)
- [ ] Phase 5 — Incident-Launcher + MANV-Layer (5 Szenarien, parallele Aktivierung, keine Radiuskreise)
- [ ] Phase 6 — OSRM-Routing + animierte Patientenbewegungen
- [ ] Phase 7 — PlannedIntake + Relocation-Engine (T2/T3 proaktiv verlegen)
- [ ] Phase 8 — Right-Panel (Alarme/Empfehlungen/Klinik/Audit)
- [ ] Phase 9 — Timeline mit Fork-Preview (Was-wäre-wenn)
- [ ] Phase 10 — Audit-Log + Export + Filter + Demo-Showcase-Button
- [ ] Phase 11 (optional) — Polish & Performance

## Bekannte Probleme
_Keine_

## Vertragsdokumente (Referenz)

Verbindliche Quellen in dieser Reihenfolge lesen:
1. `doc/START_HERE.md` — Autonomer Einstieg
2. `doc/SPEC.md` — Produktvertrag
3. `doc/BOOTSTRAP.md` — Phasen-Gates, Anti-Patterns, Autonomie-Regeln
4. `doc/PHASES.md` — Schrittweise Anleitung
5. `doc/DATA_MODEL.md`, `doc/DATA_GENERATION.md`
6. `doc/SIMULATION.md`, `doc/ROUTING.md`, `doc/SCENARIOS.md`, `doc/MEASURES.md`
7. `doc/DESIGN.md`, `doc/UI.md`, `doc/TIMELINE.md`
8. `doc/AUDIT.md`, `doc/TESTING.md`
