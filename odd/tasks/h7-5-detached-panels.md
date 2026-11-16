# H7.5 — Native detached docking panels (option A)

Objective: detach/redock global-docking Pods/Deployments into the existing sandboxed detached-tool windows, read-only live tables fed by Main.
Branch: `feature/global-docking-h7` · Delivery: single commit `feat(h7): support native detached docking panels` · Runners: jest (packages/core), Playwright Electron (`open-lens/integration/h7-docking-e2e.mjs`).

## Specs

- S1 Option A approved: "Mantener `sandbox: true`, `contextIsolation: true` y `nodeIntegration: false` en las ventanas desacopladas." / "No introducir una ventana nueva con Node habilitado ni desactivar contextIsolation."
- S2 "Reutilizar las validaciones IPC, el registro de ventanas, los controles de navegación y el mecanismo de reacople existentes."
- S3 "Diseñar un renderer genérico de paneles desacoplados, con contratos de datos explícitos y tipados. No duplicar KubeObjectListLayout ni crear una segunda implementación completa de Pods/Deployments."
- S4 "mostrar tablas de solo lectura actualizadas en vivo desde main, mediante watches correctamente cancelados."
- S5 "Implementar desacople, reacople explícito, reacople al cerrar, recuperación ante fallos y aislamiento estricto por clusterId."
- S6 "Mantener una única representación activa de cada panel. Mientras esté desacoplado, su vista original debe permanecer desmontada."
- S7 "Conservar identidad visual de clúster y entorno, incluyendo advertencia PROD."
- S8 "Mostrar claramente que la ventana es de solo lectura, sin controles que aparenten realizar acciones no disponibles."
- S9 Limitation doc: editing, details and advanced actions require redocking; full-frame architecture documented as future work needing its own security review.
- S10 Playwright P01–P16 + previous 48 on Electron DEV; target 64 PASS / 0 FAIL; no SKIP.
- S11 Doc `docs/H7_5_VENTANAS_DESACOPLADAS.md`, evidence `docs/evidence/h7-5/`; restore QA profile; no push/merge; do not start H7.6.

## Tasks

- T1 S1-S5 Main: `resource-list` tool kind (request/descriptor validation, list+watch session, frame-removal close) — inline — done (RED 8 → GREEN; main 127/127)
- T2 S3,S7,S8 Window renderer: typed rows table, read-only notice, accent — inline — done (probe: live row + emitted event shown)
- T3 S5,S6 Renderer: global store IPC wiring, detach control, placeholder, redock/close, failure recovery — inline — done (RED 8 → GREEN; 62 suites 586/586)
- T4 S10 Playwright P01–P16 + full regression — inline — done (run 2026-11-03T01-31-01: 64/64)
- T5 S9,S11 Docs, evidence, commit — inline — done (see commit)

## Log

- L1 (2026-11-02) H7.5 prompt "OpenLens DevOps — H7.5: Ventanas nativas desacopladas" (full text in session transcript).
- L2 (2026-11-02) User approved option A with conditions S1–S11 (quoted above).
- L3 Audit: existing windows are sandboxed `file://` pages fed by Main (`detached-tool-session-manager.ts`); cluster frames run with nodeIntegration true / contextIsolation false (`create-electron-window.injectable.ts:88-90`). Closing a workspace tab only hides it (`workspace-tabs-store.ts closeTab`); cluster frames are removed on deactivation/delete (`request-deactivation.injectable.ts:31`).
- L4 T1–T3 implemented. Also: reused window is restored when minimized (`open-detached-tool-window.injectable.ts`, test added). Lint `--fix` accidentally reformatted legacy lines in dynamic-layout-renderer; reverted to HEAD and reapplied only H7.5 (39 = 39 errors as HEAD).
- L5 Probe in Electron DEV: window file:// sandboxed, status live, row h7-pod-0, emitted ADDED event shown, Redock closes it, pods watches 2 → 1. Electron reports 2 displays (1920x1080 each).
- L6 Run 1 61/64 (P12 real bug: detachPanel early return; P03 baseline assumption; P14 catalog duplicate). Run 2 62/64 (main bundle built before restore(); P14 measured pre-existing Disconnect leftover). Run 3 64/64. Disk 19.6 GiB (<20): builds stopped.
