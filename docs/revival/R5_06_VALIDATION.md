# OpenLens DevOps Revival — R5-06 Validation

## Dock, ToolContextHeader, terminal, logs and YAML editor

- Date: 2026-10-22
- Base: `9b842b0` (R5-05)
- Build: `scratchpad/r506-build/out/mac-arm64/OpenLens DevOps.app` (ARM64, unsigned),
  `app.asar` sha256 `57fd0fe572986e876e9a12b1e223454401a7ba60fa4c8ae684a7ef838814d6b0`
- Verdict: **done** — one shared tool header, modern dock tabs with overflow and keyboard navigation; session lifecycles
  (PTY, log streams, editor drafts/save) unchanged.

## Changes

| Area | File(s) | Change |
|---|---|---|
| ToolContextHeader (new) | `dock/tool-context-header/` (tsx, module scss, index, test) | One compact row: EnvironmentBadge (omitted for none) · cluster · namespace chip · title … session state (dot + text: active/paused/disconnected/connecting) · tool actions. PROD adds a 2px `--envProduction` left border. Props-only: context is passed by each tool from its own session, never from the focused workspace tab. |
| Terminal | `dock/terminal/view.tsx` (header JSX only) | Old `terminal-context-header` box → ToolContextHeader (same testid). Pod/node in `title`; "Production Environment — Guarded" + Detach in `actions`; PROD confirmation gate untouched, below the header. `terminal-prod-hazard` testid now on the guarded text. |
| Logs | `dock/logs/view.tsx` | New ToolContextHeader (cluster from the frame's hosted cluster, namespace, pod, `paused`/`active` from the existing paused state, read-only). Controls unchanged. |
| YAML editor | `dock/edit-resource/view.tsx` | Cluster context box → ToolContextHeader (testids kept); Kind/Name/Namespace badges stay in the controls row (no duplication). |
| InfoPanel | `dock/info-panel.scss` | Token spacing, top border, consistent button sizes. Handlers/testids unchanged. |
| Dock tabs | `dock/dock-tabs.tsx` (+ module scss), `dock-tab.tsx` (+ module scss), `dock.tsx` | Compact tabs with accent underline, focus-visible ring, close button `aria-label="Close <title>"`; `role="tablist"` + Left/Right focus navigation on the strip wrapper; tabs keep natural width (`flex: 0 0 auto`, title max 180px) and the strip scrolls with chevrons + "All dock tabs" menu (existing Menu) only when overflowing; active tab scrolled into view; minimize/fullscreen aria-labels; existing Ctrl/⌘+W hint kept. |
| Dock tab env | `dock/dock-tab.tsx` | Last ad-hoc env badge (hardcoded `#eb5757`, emoji) → `EnvironmentBadge` (same `dock-tab-env-badge-<id>` testid, required by R4-04). |

Not touched: PTY creation/handover order, detach/redock, log streaming/buffers/pause logic, editor save/conflict/drafts,
PROD gate logic, stores, detached-window styling (R5-07).

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit -p packages/core` | 0 errors |
| ESLint changed/new files | 0 errors |
| Dock unit tests (R4-04, R4-06, edit-resource, new header + dock-tabs tests) | 19 suites, 125 tests pass |
| Snapshot suites rendering the dock (31) | 26 updated after per-suite marker triage (R5 markers only) → 29/29 suites, 370 tests, 123 snapshots pass; 2 legacy R4 suites untouched |
| Builds | 3 (round 2/3 only fixed dock tab width; each replaced the previous) |
| PTY detach/redock (DEV) | PID 26016 and `/dev/ttys016` identical before, detached and after redock |
| Smoke | open/switch/close 14 → 10 tabs via close button, no app errors |

Visual review (Opus): PROD terminal header with one badge and the confirmation gate (not clicked); DEV terminal header with
"Active"; editor header + InfoPanel in light theme; 13 dock tabs show full titles with chevrons and menu; focus ring visible
on a keyboard-focused dock tab.

Defects found and fixed: `role`/`onKeyDown` passed to `Tabs` (tsc error) → moved to wrapper; hardcoded dock tab env badge;
dock tabs shrinking to "Termi" instead of scrolling (`flex: 0 0 auto`).

## Evidence

`docs/revival/evidence/r5-06/`: `b-*` (R5-05 release) and `a-*` (R5-06): terminal PROD/DEV (dark/light), logs (dark/light/paused),
editor (dark/light), dock overflow with menu and without, few tabs, keyboard focus, `pty-*` detach/redock.

## Pending

- Logs screenshots show "Failed to load logs: not found (404)": the synthetic API has no log route; header/pause verified, real
  log content not shown.
- Terminal and logs panes stay dark in light theme (existing terminal theme behaviour, unchanged).
- PROD terminal header shows the badge plus the "Production Environment — Guarded" text (kept: carries the R4-04 `terminal-prod-hazard` testid).
- With few tabs, dock tabs no longer stretch to fill the strip (intentional compact layout).
- Clicking a terminal tab moves focus into xterm, so arrow-key navigation starts from a focused tab, not after a click.
- Legacy failing suites unchanged: `edit-namespace-from-new-tab`, `installing-helm-chart-from-new-tab` (R4 debt).
