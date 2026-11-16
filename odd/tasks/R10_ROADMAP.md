# NovaKube — R10: Paridad de Comportamiento e Interacción 1:1 — Roadmap

- **Base**: `develop @ 75e6d8b7` (`origin/develop @ 75e6d8b7`)
- **Branch**: `feature/r10-interaction-parity`
- **Methodology**: Differential execution (`Lens Official :9225` vs `NovaKube Electron DEV :9223` with Hot Reload). Every interaction records initial state, event, Lens result, NovaKube result, root cause, behavioral test, fix, and re-verification.
- **Testing Policy (MANDATORY)**: Single test coordinator (orchestrator), max 1 heavy runner at a time, focused Jest `--maxWorkers=2`, sequential isolated E2E, full suites only at final checkpoints. See `AGENTS.md`.

## Hitos

- [x] **R10.0 — Baseline**: Verificar `develop` y `origin/develop`, crear rama `feature/r10-interaction-parity`, inicializar `R10_ROADMAP.md`, `R10_CHECKPOINT.md`, `R10_INTERACTION_PARITY_MATRIX.md`, `R10_MISSING_INTERACTIONS_ROADMAP.md`, levantar stack DEV con Hot Reload en paralelo con Mirantis Lens oficial (`:9225`).
- [x] **R10.1 — Ventanas nativas macOS**: Apertura, cierre, minimización, maximización, restauración, redimensionamiento, movimiento, posición inicial, tamaños min/max, persistencia de dimensiones, foco, z-order, activación Dock, semáforos macOS, doble clic barra superior, `Cmd+W`, `Cmd+M`, `Cmd+Tab`, `Escape`.
- [x] **R10.2 — Subventanas y modales**: Apertura, posición inicial, tamaño, foco automático, relación con ventana principal, modales, diálogos, popovers, menús contextuales, ventanas desacopladas, cierre independiente, reacoplamiento, cambio de ventana, persistencia, restauración tras reinicio.
- [x] **R10.3 — Docking y paneles**: Abrir, cerrar, minimizar, maximizar, dividir, arrastrar, acoplar, desacoplar, reordenar, mover entre contenedores, redimensionar, doble clic, menús de acciones, atajos, restauración de layout.
- [x] **R10.4 — Pestañas y navegación**: Clic simple, doble clic, pestañas temporales/permanentes, apertura en segundo plano, cierre, reapertura, cambio de pestaña, arrastrar, reordenar, cambio de clúster, historial atrás/adelante, persistencia, foco y scroll conservado, navegación desde tablas y drawers.
- [x] **R10.5 — Menús y acciones**: TopBar, menús contextuales, menú de aplicación macOS, menús de filas/headers, atajos de teclado, tooltips.
- [x] **R10.6 — Tablas, Drawers y recursos**: Tablas, búsqueda, filtros, ordenamiento, drawers, YAML Editor, Overview, Workloads, Nodes, Pods, Deployments, formularios, notificaciones.
- [x] **R10.7 — Terminal, Logs y Kubetail**: Apertura, foco, teclado, scroll, búsqueda, cambio de contenedor/pod, cierre, PTY/streams sin fugas.
- [x] **R10.8 — Preferences e integraciones**: Catalog, Hotbar, Navigator, Preferences, Extensions, formularios y persistencia.
- [x] **R10.9 — Funciones faltantes**: Documentadas dependencias externas reales en `R10_MISSING_INTERACTIONS_ROADMAP.md` (`Lens ID`, `Mirantis AI`, `License`, `Toggle Hotbar` en backlog).
- [x] **R10.10 — Compatibilidad y regresiones**: Verificada convivencia intacta de OpenLens + NovaKube (`application-menu`, `kube-object-menu`, `workspace-tabs`, `experimental-settings`, `pod-network-policies` + `h7-docking-e2e.mjs` 186/186).
- [x] **R10.11 — Aceptación visual y funcional**: Verificación diferencial completa entre `:9225` (Mirantis Lens) y `:9223` (NovaKube Electron DEV) registrada en `R10_INTERACTION_PARITY_MATRIX.md`.
- [x] **R10.12 — Build final ARM64**: Merge a `develop`, build limpio `.app` + `.dmg` ARM64 desde `develop` HEAD, firma + `codesign`, ejecución standalone desde `.dmg` y repetición de pruebas críticas comparadas con Lens oficial.
