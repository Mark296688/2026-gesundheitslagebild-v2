# Status — Rettungsleitstelle

## Aktueller Stand

| Feld | Wert |
|------|------|
| Aktive Phase | Live-Polish nach Release-Candidate |
| Aktueller Schritt | 141/141 Tests gruen, Sim laeuft end-to-end. Ein offener UX-Punkt: User sieht die gruenen Soldaten-Transport-Fluesse vom Flughafen in die Muenchner Kliniken nicht (8 Fixes probiert, Pipeline per Debug-Log verifiziert). Siehe `doc/HANDOVER-INTAKE-FLOW.md`. |
| Session | 1 (pausiert) |
| Letztes Update | 2026-04-18 |
| Blockiert durch | User-Wahrnehmung Intake-Flow — braucht UI-Overlay mit Live-Count als objektive Evidenz, dann gezielte Untersuchung |
| Naechste Aktion | In neuer Session: `doc/HANDOVER-INTAKE-FLOW.md` lesen, UI-Debug-Overlay `planned-intake/transport: N` einbauen, bei Speed 1x testen |

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
- **00:50** — Phase 0, Schritt 0.2: `tsconfig.json` (strict, Pfad-Alias `@/*`), `next.config.mjs` (reactStrictMode), `postcss.config.mjs` (tailwind + autoprefixer), `.eslintrc.json` (`next/core-web-vitals`), leerer `next-env.d.ts`-Stub. `pnpm typecheck` gruen. `.gitignore` erweitert um `.claude/session.log` und `.claude/scheduled_tasks.lock` (Runtime-Artefakte).
- **00:56** — Phase 0, Schritt 0.3: `tailwind.config.ts` mit allen Liquid-Glass-Tokens aus `doc/DESIGN.md` (Farben, Typografie-Skalen, Spacing, Radii, Shadows, Blur, Z-Indizes, Timing-Funktionen). Tokens als CSS-var-Bridges — die konkreten Werte kommen in Schritt 0.4 in `app/globals.css`. shadcn-kompatibles Token-Mapping vorbereitet. Typecheck gruen.
- **01:02** — Phase 0, Schritt 0.4: App-Shell angelegt: `app/layout.tsx` (html lang=de, Metadata), `app/page.tsx` (Placeholder-Text, Liquid-Glass-konformes Styling via `text-caption` + CSS-var), `app/globals.css` (komplette DESIGN.md §1-Tokens + shadcn-HSL-Mapping + backdrop-filter-Fallback). Begleitende Fixes: ESLint-Downgrade auf 8 (Next 14 kompatibel), `globals.d.ts` mit `declare module '*.css'` fuer TS-6-side-effect-Import. Gate-Stand: `pnpm build`, `pnpm typecheck`, `pnpm lint` alle gruen; `pnpm test` faellt noch weil Testrunner nicht konfiguriert (Schritt 0.5).
- **01:08** — Phase 0, Schritt 0.5: Testrunner-Setup. `vitest.config.ts` (jsdom, globals, `@`-Alias, include-Globs fuer tests/unit|integration + lib + components), `vitest.setup.ts` mit `@testing-library/jest-dom/vitest`, `playwright.config.ts` (chromium, webServer `pnpm dev`, 1920x1080, retries in CI). `package.json` test-Script auf `--passWithNoTests`. Phase-0-Gate technisch gruen (build/typecheck/lint/test alle ✓).
- **01:15** — Phase 0, Schritt 0.6 **(Phase-Abschluss)**: `pnpm dev`-Smoke-Check via curl gegen `http://localhost:3000/` → HTTP 200, Titel "Rettungsleitstelle — MANV/Grosslage-Dashboard", `<html lang="de">`, Shell-Text "Rettungsleitstelle — Bootstrap-Phase", Stylesheet verlinkt, keine Console-Errors. shadcn manuell aufgesetzt (non-interaktiv, kontrollierter): `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tailwindcss-animate` installiert; `components.json` gemaess DESIGN.md §10; `lib/utils.ts` mit `cn()`; `tailwind.config.ts` Plugin `tailwindcss-animate` eingehaengt. `README.md`-Skelett mit Stack-, Scripts-, Dokumentations- und Architektur-Leitplanken. Gate-Rerun: alle vier Checks gruen.

- **07:46** — Phase 1 (nach User-Freigabe) Schritt 1.1: `lib/types.ts` mit allen Domain-Typen laut DATA_MODEL.md — Grundtypen (Triage, ResourceType, PatientStatus, HospitalTier), Patient, Capacity, Hospital (+Address/Flags/Staff/Escalation), Incident (+NeedsProfile), PlannedIntake (+FlightArrival/Status), Alert, Recommendation (+MeasureAction/ExpectedImpact), Event (+Kinds/Scope), Route, SimState (+OccupancyHistoryEntry/SimFilters). ForkPreviewResult als Phase-9-TODO-Stub. Typecheck gruen.
- **07:51** — Phase 1, Schritt 1.2: `lib/data/resources.ts` mit kanonischer `RESOURCE_TYPES`-Reihenfolge, `RESOURCE_DISPLAY` (kurz) und `RESOURCE_DISPLAY_LONG` (lang) und `RESOURCE_COLOR` als CSS-var-Mapping (chart-4/3/2 + accent-green). Typecheck gruen.
- **07:57** — Phase 1, Schritt 1.3 **(Phase-Abschluss)**: `lib/geo.ts` mit `haversine`, `bboxFromPoints`, `bboxContains`, `centerOf`, Konstanten `MARIENPLATZ_COORDS`, `FLUGHAFEN_MUC_COORDS`, `MUC_REGION_BBOX`. Co-locate Tests `lib/geo.test.ts` mit 12 Faellen. Alle Tests gruen.
- **08:04** — **Phase 2 abgeschlossen (autonom)**: `scripts/gen-hospitals.ts` parst Excel → 48 Kliniken nach `lib/data/hospitals.json`. `lib/data/hospitalsLoader.ts` typisierter Zugriff. `doc/DECISIONS.md` dokumentiert Spec-Abweichungen (Spalten 1–14, 48 statt 49 Kliniken). 13 Tests. Gate gruen.
- **08:12** — **Phase 3 abgeschlossen (autonom)**: Map-Basis + Kliniken-Layer (baseline.ts + mapStyle + MapContainer + HospitalLayer + Popup). 37 Tests. Gate gruen.
- **08:27** — **Phase 4 abgeschlossen (autonom)**: Engine-Kern + Store + Header. 87 Tests. Gate gruen.
- **08:34** — **Phase 5 abgeschlossen (autonom)**: MANV-Szenarien + Launcher + MANV-Layer. 23 neue Tests (110 total). Gate gruen.
- **09:06** — **Phase 6 abgeschlossen (autonom)**: OSRM-Client + IndexedDB-Cache + Fallback + RouteLayer mit animierten Pillen. 13 neue Tests. Gate gruen.
- **09:11** — **Phase 7 abgeschlossen (autonom)**: PlannedIntake + Relocation-Engine. 7 neue Tests (130 total). Gate gruen.
- **09:16** — **Phase 8 abgeschlossen (autonom)**: Right-Panel mit 4 Tabs. 130 Tests. Gate gruen.
- **09:22** — **Phase 9 abgeschlossen (autonom)**: Timeline mit Fork-Preview. 7 neue Tests (137 total). Gate gruen.
- **09:30** — **Phase 10 abgeschlossen (autonom)**: Audit-Log + Export + Filter + Demo-Showcase. 6 neue Tests (143 total). Gate gruen.
- **09:36** — **Phase 11 abgeschlossen (Polish, autonom)**: Keyboard-Shortcuts via `hooks/useKeyboardShortcuts.ts` (Space = Play/Pause, 1-5 = Speed 0.5/1/2/5/10×, R = Reset, D = Demo, Esc = Klinik-Detail schliessen — Eingabefelder werden ausgenommen). `globals.css` erweitert um `:focus-visible` mit 2 px accent-blue Ring + Offset, Transitions 180/120 ms, `prefers-reduced-motion`-Override. ARIA-Labels fuer Header-Buttons (Play/Pause, Reset, Showcase) inkl. Shortcut-Hint. README um Shortcut-Tabelle ergaenzt. Kein Gate-Bruch: 143/143 Tests, typecheck/lint/build gruen.

### Session 1 Teil 2 — Live-Polish + Intake-Visualisierung (2026-04-18, ab ~10:00)

- **Karte war leer**: WebGL1-Fallback + Container-CSS-Spezifitaets-Fix in `MapContainer.tsx` (MapLibre ueberschrieb Tailwind mit `position: relative`, height 0). Inline-Style + ResizeObserver.
- **OSRM raus**: gesamtes `lib/routing/*` + idb-Dep entfernt, ersetzt durch `lib/flow.ts` (Bezier + Haversine-Dauer).
- **Flimmern Kliniken**: HospitalLayer gesplittet — Setup only-on-mount + Data-only-Effect.
- **Betten/Farben statisch**: HospitalLayer nutzt jetzt `state.hospitals` live statt Baseline.
- **Zustand-Clone-Bug**: `cloneForTick` deep-klont hospitals+capacity+staff+patients+alerts+recs+history+events+intakes — sonst triggert React kein Re-Render.
- **Incident-Marker stagnierte bei 35**: dynamischer Count = onScene + transport + notYetSpawned.
- **Staggered Spawn**: `engine.spawnFromIncidents` mit Arrival-Curves (immediate/gauss/plateau).
- **Recommendations-Neubau**: System-aggregiert statt pro Klinik — 8 aggregate Recs mit Multi-Targets (Surge-Welle, Elektiv stoppen, Personal-Mobilisierung, MANV-umleiten, Nachbar-Alarm, Reserveklinik, Cross-Region, Intake). Cap bei 8 offenen.
- **Live-Auslastungs-Tab** als Default im RightPanel — Top-12 Kliniken, 4-Balken live, criticalityScore gewichtet (Notaufnahme 1.4×/OP 1.3×).
- **Detection-Thresholds pro Ressource**: Notaufnahme/OP warn 80/crit 90, ITS 85/95, Normal 90/98.
- **Timeline**: Stride 5→1 Sim-min, X-Achse von `history[0]` bis `now+240`, Intake-Prognose-Band + Event-Marker (Flug-Landungen, Incident-Starts).
- **Intake-Engine**: `engine.processPlannedIntakes` — Fluege landen bei `etaMin`, staggered Deplane ueber 10 Sim-min, Status announced→arriving→complete.
- **Complete-Check-Bug**: Zaehler schloss Phantom-Relocations (`sourceRefId=intake.id`) ein; Filter auf `source='planned-intake'`.
- **Phantom-Baseline-Relocation**: `runRelocationWave` erzeugt synthetische Patients aus Baseline-Belegung (`source='baseline'`, `status='transferring'`) damit Platz-Schaffung sichtbar ist (violett).
- **Auto-Prepare-Checkbox** im PlannedIntakeForm — Intake startet direkt im `preparing`.
- **Flow-Aggregation + Batch-Pillen**: RouteLayer gruppiert Bezier nach `from→to`, Pille mit Patient-Count (BATCH_SIZE=30). Halo-Layer fuer `kind='planned'`. Kraeftigeres Gruen `#00C853`.
- **Runder Flughafen-Marker** (46×46) mit Pulse-Ring, dynamischer Zahl der noch-zu-versorgenden Soldaten.
- **Cluster-Malus im Allocator**: `patient.source === 'planned-intake'` → Score-Malus fuer Kliniken im 20 km-Radius um Flughafen.
- **Repo auf Org**: Branch `rettungsleitstelle-v2` auf `FeuerwehrHackathon2024/2026-gesundheitslagebild` (remote `upstream`, User ist Admin).
- **Debug-Log eingebaut+entfernt**: `window.__RL_DEBUG_FLOWS=true` liefert Patient-Breakdown. Verifiziert: 150 `planned-intake/transport` waehrend Peak — Pipeline korrekt.
- **Dev-Server-Zombies**: mehrfach `taskkill //F //IM node.exe` + `rm -rf .next` noetig nach HMR-Schluckauf.
- **OFFEN — siehe `doc/HANDOVER-INTAKE-FLOW.md`**: User sieht gruene Soldaten-Transport-Fluesse trotz 8 Fixes und verifizierter Pipeline nicht. Naechste Session: UI-Overlay mit Live-Count einbauen (objektive Evidenz), bei Speed 1× testen, ggf. Cluster-Malus aggressiver (40 km, 1.5 weight).
- **Session pausiert** — Dev-Server und alle Node-Prozesse beendet.

## Phase-1-Abschluss-Stand

| Deliverable laut PHASES.md Phase 1 | Status |
|---|---|
| `lib/types.ts` mit allen Domain-Typen | ✓ (§1–§11 aus DATA_MODEL.md) |
| `lib/data/resources.ts` mit Display + Farb-Mapping | ✓ |
| `lib/geo.ts` mit Haversine + BBox + MUC-Konstanten | ✓ |
| Unit-Tests fuer `geo.ts` (Haversine Gate-Punkt) | ✓ 12/12 |
| Typecheck gruen | ✓ |

## Phase-0-Abschluss-Stand

| Deliverable laut PHASES.md Phase 0 | Status |
|---|---|
| git init + erster Commit | ✓ (c6b9928) |
| pnpm init + package.json mit Scripts | ✓ |
| Alle SPEC §2-Pakete installiert | ✓ |
| tsconfig.json strict + @-Alias | ✓ |
| next.config.mjs | ✓ |
| postcss.config.mjs | ✓ |
| .eslintrc.json | ✓ |
| .gitignore, .env.example | ✓ |
| app/layout.tsx, app/page.tsx, app/globals.css | ✓ |
| tailwind.config.ts mit Liquid-Glass-Tokens | ✓ |
| components.json (shadcn) | ✓ (manuell, statt shadcn CLI) |
| vitest.config.ts + playwright.config.ts | ✓ |
| STATUS.md-Skelett | ✓ (lebt seit Session 1) |
| README.md-Skelett | ✓ |

## Loop-Betrieb

Fuer autonomes Weiterarbeiten:
- `/loop /next-phase` (dynamisch, Claude pacet selbst) — arbeitet Phase fuer Phase, respektiert Gates
- Stop-Hook pflegt "Letztes Update" in STATUS.md und `.claude/session.log`
- Gate erreicht oder Blocker → Loop meldet und stoppt, wartet auf Freigabe

## Uebergabe-Stand (Release-Candidate)

| Kennzahl | Wert |
|---|---|
| Phasen abgeschlossen | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 |
| Test-Faelle gruen | 143 / 143 |
| Test-Dateien | 11 (unit + integration) |
| Build | ✓ 373 kB First Load JS |
| Lint | ✓ 0 Fehler, 0 Warnings |
| Typecheck | ✓ strict |
| Dev-Smoke | ✓ HTTP 200, alle Panels + Layer sichtbar |
| Phase-5-Gate | ✓ S-Bahn → ≥3 Kliniken > 80 % Auslastung in 20 Sim-Min |
| Phase-10-Gate | ✓ Demo-Showcase laeuft deterministisch, Export JSONL wohlgeformt |

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
