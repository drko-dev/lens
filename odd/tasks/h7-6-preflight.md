# H7.6 — Preflight: Disconnect lifecycle and docking compatibility audit

Objective: resolve the cluster-frame lifecycle after Disconnect, then audit which views can join global docking and in what order.
Branch: `feature/global-docking-h7` · Delivery: separate lifecycle-fix commit (with its test) + docs commit · Runners: jest (packages/core), Playwright Electron (`open-lens/integration/h7-docking-e2e.mjs`).

## Specs

- S1 Phase A: "Identificar: Qué evento ejecuta Disconnect. Quién destruye el cluster frame. Quién libera los stores y suscripciones Kubernetes. Si existe un período de gracia intencional. Si el watch de Pods tiene consumidores reales después de Disconnect. Si la conexión permanece activa indefinidamente o termina más tarde. Si el problema también existe con el flag global desactivado." / "Medir conexiones activas a los 0, 2, 5, 10, 20 y 60 segundos."
- S2 "Si se demuestra una retención indebida: Agregar un test de regresión inicialmente fallido. Corregir el propietario real del recurso. No cerrar conexiones compartidas que todavía tengan consumidores legítimos. No agregar temporizadores arbitrarios para disimular el problema. No alterar el comportamiento de las ventanas desacopladas que ya funciona." / "Validar Disconnect, reconexión y cambio entre clústeres sintéticos."
- S3 Playwright Disconnect: "Con Global Docking ON. Con Global Docking OFF. Con Pods abierto. Con Deployments abierto. Con ambos paneles. Con una ventana desacoplada. Con reconexión. Con dos clústeres sintéticos." / "Comprobar cierres reales mediante contadores de la API sintética." / "No utilizar llamadas directas al store para simular acciones de usuario." / regression incl. the 64 scenarios when the environment is ready.
- S4 Phase B audit of families (workloads/resources, Events/Nodes, Details/inspector, Terminal/editor, Logs/Kubetail, Settings/global views, Catalog/extensions): cluster vs global, mountable in GlobalPanelHost, stores/services, multi-instance, subscriptions/PTY, native window need, state lost on unmount, move risks. Output: compatibility matrix + incorporation order. No migration.
- S5 Doc `docs/H7_6_PREFLIGHT_Y_COMPATIBILIDAD.md` with the sections listed in the prompt; resources; separate commit for the lifecycle fix; no push/merge.

## Tasks

- T1 S1 Investigate Disconnect with an Electron probe (flag ON/OFF) — inline — done (see L3)
- T2 S2 RED test + fix in ClusterView reaction — inline — done (RED: 2 activations ≠ 1; GREEN 11/11; commit 1f36511)
- T3 S3 Playwright DC01–DC08 + regression — inline — done (DC 8/8 run 06-06-35; full 72/72 run 06-28-29; commit 55bd034)
- T4 S4 Compatibility audit — delegated (read-only explorer, mapping trigger: 7 families) — done (spot-checked allowedKinds + host route gate)
- T5 S5 Doc + commits — inline — done (e2e620b; fix 1f36511)

## Log

- L1 (2026-11-03) H7.6 prompt "OpenLens DevOps — H7.6: Preflight, ciclo de vida y expansión del docking global" (full text in session transcript).
- L2 Start: HEAD c685098; disk 19 GiB free, swap 8.0/9.2 GiB, RAM 39 % free; builds need >20 GiB.
- L3 Probe (scratch, Electron DEV, synthetic API): after "Disconnect" the old proxy dies and all watches reach 0 at t+0, then main logs `activate` → `reconnect` → `Authentication proxy started` and 4 watches (Pods 1) reopen by t+2 s, staying open at t+60 s with the route on /catalog and a hidden iframe. Same with the flag OFF. Cause: `ClusterView` reaction tracks `hasView` (added in dc48e1f, pre-RC3); Disconnect removes the view, the reaction fires before the /catalog navigation unmounts it, and it calls initView + requestClusterActivation.
- L4 Fix (1f36511): skip re-activation when only the view disappeared for the same, now disconnected, cluster; guard test keeps dc48e1f's re-create for connected clusters. Lint clean; tsc 42 = 42 pre-existing.
- L5 Electron validation blocked: open-lens consumes core's built library (dev server bundle still has the old reaction), so a core renderer build is required. Disk fell 19 → 17 GiB because macOS added a 2 GiB swapfile (swap 9.2 → 11.2 GiB total); safe cleanup tops out at ~1.5 GiB (< 20 GiB). No build run; no further Electron runs to avoid more swap growth.
- L6 Next: when disk > 20 GiB, build core renderer, run D01–D08 then the full suite (72). No PASS declared for Electron until then.
- L7 (2026-11-03) Prompt "H7.6 Preflight: validación definitiva de Disconnect" (full text in session transcript). Start: HEAD e2e620b, disk 17 GiB (container 18.4 GB), swap 9.6/11.2 GiB, RAM 42 %, shell Node 22.22.
- L8 IDs D01–D08 collided with H7.2 docking D01–D16: renamed the new ones to DC01–DC08 (behavior unchanged); sampling now t+0/2/5/10/20 (+t+60 in DC01) with lens-k8s-proxy PID tracking. Uncommitted.
- L9 Cleanup: deleted 17 codebase-memory-mcp index DBs of directories that no longer exist (~1.16 GiB, none open). Free space unchanged: the Time Machine local snapshot 2026-11-02-203539 pins those blocks. uv cache prune hung on a lock, stopped. Blocked: >20 GiB needs deleting that snapshot (user backup) -> asked for authorization.
- L10 User authorized deleting the TM local snapshot: +5.1 GB (22 GiB free). Core renderer build (Node 24.22.2, dev mode, 17.5 s, 1.45 GB RSS, 42 pre-existing TS errors); served lens.js contains the fix.
- L11 DC01–DC08 8/8 (all samples 0 watches/frames/new proxies, t+60 in DC01). Full run 71/72: P14 asserted the old defect (2→1); expectation set to 0. Confirmation run 72/72, 0 writes. Restored 24 regenerated evidence images; killed an orphan repo lens-k8s-proxy from 2026-11-02. Close: disk 20 GiB, swap 12.1/13.3 GiB, RAM 51 %. H7.6 Preflight PASS.
