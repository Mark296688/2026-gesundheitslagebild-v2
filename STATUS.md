# Status — Rettungsleitstelle

## Aktueller Stand

| Feld | Wert |
|------|------|
| Aktive Phase | Phase 7 — PlannedIntake + Relocation-Engine (startet) |
| Aktueller Schritt | Phase 6 abgeschlossen autonom: OSRM-Client + IndexedDB-Cache + Fallback + RouteLayer mit animierten Pillen. 123/123 Tests, Gate gruen. |
| Session | 1 |
| Letztes Update | 2026-04-18 |
| Blockiert durch | — |
| Naechste Aktion | Phase 7 Schritt 7.1: `lib/simulation/relocation.ts` + `components/panels/PlannedIntakeForm.tsx` + `components/map/PlannedIntakeLayer.tsx` |

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
- **09:06** — **Phase 6 abgeschlossen (autonom)**: OSRM-Routing + RouteLayer. `lib/routing/route-id.ts` (3-Dezimal-Rundung fuer Cache-Hits). `fallback.ts` (Haversine 50 km/h, 20-Punkt-Polyline). `osrm-client.ts` (fetchRoute mit AbortController-Timeout 8 s, Retry einmal bei 5xx, Rate-Limit 2 Req/s, Test-Hooks `fetchImpl`/`rateLimited`). `route-cache.ts` (IndexedDB via idb + In-Memory-Cache als Fallback). `routing/index.ts` Facade mit `getRouteSync` (synchroner Fallback + async OSRM-Upgrade) und `getRoute` (rein async). `components/map/RouteLayer.tsx` zeichnet MANV-Transport-Linien (durchgezogen blau), Transfer (violett), Planned (gruen), Fallback-Routen gestrichelt. Animierte Dots entlang der Polyline per Tick auf Basis `arrivedAt - durationMin` → Progress `[0..1]`. 13 neue Tests (routing: routeId, interpolate, fallbackRoute, fetchRoute-Mock inkl. Retry/Timeout). Gate: **123/123 Tests**, typecheck/lint/build gruen.

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
