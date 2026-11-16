# H7.6.3B — Pod Logs in global docking (history, follow, lifecycle)

Objective: dock Pod Logs in GlobalPanelHost without losing history/follow/pause on move, collapse or tab switch; release on close.
Branch: `feature/global-docking-h7` (base `1d368ee`). Delivery: single focused commit, no push/merge. Runners: jest (packages/core), Playwright Electron (`open-lens/integration/h7-docking-e2e.mjs`, `H7_ONLY`).
Starting point: uncommitted Gemini work (8 modified + 4 untracked files), audited in L2; kept where correct.

## Specs

- S1 "Mover el panel no debería equivaler a borrar toda la sesión de logs." Remount must not clear the buffer when the logical session is the same.
- S2 Stable identity: "ClusterId. Namespace. Pod. UID del Pod, cuando esté disponible. Contenedor. Opciones de logs que alteren el contenido. TabId estable." "El tabId no debe regenerarse durante cada montaje React." "No mostrar logs de un pod, contenedor o clúster diferente."
- S3 Resume: "No eliminar automáticamente el buffer." "No crear dos timers para el mismo tabId." "No ejecutar dos solicitudes simultáneas innecesarias." Deduplicate lines, 10.000-line cap.
- S4 Visual state: follow kept; reading older lines is not sent to the bottom on restore; "Si la pestaña estaba pausada, no reactivarla silenciosamente." Classic Dock behavior preserved.
- S5 Move/collapse: keep buffer, stop polling without consumers. Close: release session, timers, buffer, tab data. Disconnect: no polling, no reconnect, no proxy recreation. "No utilizar una única operación de cleanup que destruya el buffer tanto al replegar como al cerrar."
- S6 Entry point: user can open Logs of a pod and container into the docked host (flag-gated, classic mode intact).
- S7 Unit tests: the 12 listed in the prompt §9 (loss, retention, no duplicate intervals, dedupe, memory cap, identity, pause, follow, close release, disconnect release, classic compat, cluster isolation). "No modificar expectativas solamente para convertir FAIL en PASS."
- S8 Playwright LG01–LG10 (open, real API lines, drag, group, tab switch, collapse/restore, follow + no duplicates, close releases polling, isolation, disconnect). Real mouse/keyboard, no store shortcuts. Then full 111 regression; target 121/0/0/0 only if actually executed.
- S9 Out of scope: Terminal, Editor, Kubetail, H7.7, detached windows, RBAC. No new dependencies. Synthetic Kubernetes only, no writes, QA profile `~/Documents/lens/qa-profiles/h7-dev`.
- S10 Doc `docs/H7_6_3_COMPONENTES_CON_ESTADO.md` updated; commit `feat(h7): preserve log sessions across global docking`; only H7.6.3B files; never `git add .`.

## Tasks

- T1 S1,S2,S3,S7 LogStore: session key (+showPrevious/tailLines/sinceSeconds), register session after await, view state (follow+offset), tests — inline — done (14 store tests, 5/5 mutants caught; uncommitted)
- T2 S4 list.tsx restore follow/offset on mount + save on unmount; view.tsx resume path kept — inline — code done; behavior proven only by LG07 (not run yet)
- T3 S2,S5 identity + BoundPodLogs gating + openLogsPanel tabId/uid + close hook release — inline — done (9 panel tests, 4/4 mutants caught; uncommitted)
- T4 S6 "Logs (docked)" per container in KubeObjectMenu (Pod) — inline — code done; proven only by LG01 (not run yet)
- T5 S8 mock numbered logs + LG01–LG10 — inline — written, syntax-checked, NOT executed: blocked by disk gate (20 GiB, need >23 for the renderer build)
- T6 S8,S10 full regression, doc, commit — inline — pending

## Log

- L1 (2026-11-03) User request: prompt "OPENLENS DEVOPS — RETOMAR DESARROLLO CON CLAUDE CODE … H7.6.3B — Logs con conservación de historial, estado de follow y ciclo de vida correcto durante el docking global" (full text in session; Gemini left changes uncommitted).
- L2 Audit of Gemini diff. Kept: LogsDescriptor/openLogsPanel idea, resume vs reload split, canResume concept, cluster rejection in BoundPodLogs, `pod-logs` PanelKind (no exhaustive Record broken). Defects: (a) openLogsPanel has no caller/menu; (b) canResume ignores showPrevious/tailLines/sinceSeconds; (c) `load()` reads logTabData before the await and registers activeSessions only `if (data)` — BoundPodLogs sets data in an effect that runs after the child's, so the first session is never registered and the first remount still wipes history; (d) follow stored as boolean only, scroll offset not restored, mount-time onScroll(offset 0) can overwrite follow and trigger loadLogs; (e) no release on docked close (only classic clear-log-tab-data); (f) default tabId `log-tab-${pod}-${container}` collides across namespaces and ignores pod UID; (g) tests: #1 asserts the defect instead of failing on it, #3 claims no duplicate intervals without checking; no close/cluster/cap tests.
- L3 Start: HEAD 1d368ee, disk 21 GiB, swap 10.3/11 GiB — below the 23 GiB build margin; unit tests only until space is recovered.
- L4 Fixes over Gemini (all inline): session key now covers showPrevious/tailLines/sinceSeconds; session registered AFTER the await by re-reading tab data (it was skipped when BoundPodLogs wrote the data late); `useLayoutEffect` in BoundPodLogs so the tab data exists before LogsDockTab's effect; `logs-view-model.injectable.ts` used `logStoreInjectable` without importing it (would not compile); follow boolean replaced by view state {follow, offset}, restored on mount and saved on unmount; deterministic tab id `docked-logs:<cluster>:<ns>:<uid>:<container>` (was `log-tab-<pod>-<container>`, colliding across namespaces); `onPanelClosed` optional hook in SplitPanelStore.closePanel (only explicit close; `onStreamStopRequested` also fires on prune/detach so it cannot be used to release); host injectable wires it to clearLogTabData; `DockLogsMenuItem` (new, per container, flag-gated).
- L5 Tests: jest dock/logs + global-docking = 19 suites / 167 tests green (classic log tests included). Mutation checks: store 5/5 caught, panel 4/4 caught (first N4 mutant was misplaced, redone inside collapsePanel). Old Gemini tests passed even against the buggy session registration; replaced.
- L6 Mock: `/api/v1/namespaces/*/pods/*/log` with numbered timestamped lines, inclusive `sinceTime`, `appendLogs`, per container counters (total/tail/since); Pod gets a `sidecar` container. Smoke-tested standalone on a local port (no Electron).
- L7 Resources 2026-11-03: disk 20 GiB (df -g), swap 10.6/11 GiB, RAM 52% free. Orphan `npm run dev:renderer` of this repo (PID 40376, 25 h, port 9191) found running; not started by this session, left untouched.
