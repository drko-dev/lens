# NovaKube — Roadmap R11: Paridad Visual, Estructural y Funcional 1:1 (`R11.1`–`R11.12`)

Basado en [R11_COMPLETE_PARITY_GAP_REPORT.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/revival/R11_COMPLETE_PARITY_GAP_REPORT.md).

## Reglas Operativas

- Rama: `feature/r11-full-lens-parity` desde `develop` (`ea48aa16`).
- Entorno: Electron DEV con Hot Reload + Mirantis Lens oficial en paralelo + CDP + Playwright + `osascript`.
- Tests pesados: estrictamente seriales (`AGENTS.md`), Jest focalizado con `--maxWorkers=2`, E2E secuenciales con perfiles aislados.
- Por hito: `INSPECCIONAR LENS -> IMPLEMENTAR -> HOT RELOAD -> COMPARAR + PROBAR -> JEST -> COMMIT -> PUSH FEATURE -> MERGE A DEVELOP -> PUSH DEVELOP`.

## Hitos Secuenciales

- [x] **R11.1 — Layout Raíz Unificado**: Hotbar, Navigator, Workspace TabBar, StatusBar; `Preferences`, `Welcome`, `Release Notes`, `Cluster Settings` y `Extensions` como pestañas del Main View preservando Workspaces, layouts y docking.
- [x] **R11.2 — Navigator del Clúster**: Jerarquía y orden oficial (`Applications`, `Flux`, `Argo CD`, `Security Center`, `Cost Monitoring [NEW]`, `Device Resources / DRA [NEW]`, `Admission Policies`, `Gateway API`), drill-down `< >`, búsqueda `Cmd+P` y detección honesta de capacidades/CRDs.
- [x] **R11.3 — Navigator Raíz**: `Bookmarks`, `Extensions`, `Kubernetes Clusters`, `Local Kubeconfigs`, integraciones cloud disponibles, navegación de regreso `<` y acceso completo a clústeres configurados.
- [x] **R11.4 — Workspace Tabs**: Pestañas efímeras (cursiva en 1 clic), doble clic para fijar, iconos contextuales, títulos, colores de clúster, botón split, promoción Dock -> Main View y persistencia/restauración sin romper docking universal.
- [ ] **R11.5 — TopBar, StatusBar y Hotbar**: Controles del TopBar (`Send Feedback`), AI dropdown `[ >_ AI | v ]` funcional, avatar, paginador Hotbar sin `<` duplicado, y StatusBar configurable por tema (apariencia Lens 1:1 con StatusBar oficial y conservación del tema NovaKube sin franja azul forzada).
- [ ] **R11.6 — Preferences**: 10 categorías reales (`App`, `Proxy`, `Kubernetes`, `Editor`, `Tables`, `Terminal`, `Integrations`, `Telemetry`, `Experimental`, `External Tools`) preservando configuraciones existentes.
- [ ] **R11.7 — Experimental y Extensiones**: `Theme Tweaker` y `URL Navigation & Sharing` con estados reales de instalación, activar/desactivar, persistencia y manejo de errores sin fingir marketplace remoto.
- [ ] **R11.8 — Búsqueda Avanzada**: Historial, Favoritos (`★`), Regex (`.*`), Match Case (`Aa`), persistencia e integración con `Preferences > Tables`.
- [ ] **R11.9 — Editor YAML**: Side-by-Side Diff contra manifiesto original, Revert, validación, confirmaciones y recuperación de cambios.
- [ ] **R11.10 — Terminal**: Toolbar equivalente, `Allow AI to access UI`, terminal externa, reanudación, shell, PTY, split, docking y redocking.
- [ ] **R11.11 — Menús macOS**: `View > Toggle Hotbar`, `Window`, `Help` (`Release Notes`, `Export Support Logs`, `Restart in Safe Mode`, `Send Feedback`), aceleradores y foco.
- [ ] **R11.12 — Métricas, Drawers y Cierre**: Autodetección de VictoriaMetrics, métricas disponibles, cierre de Drawer al cambiar al Dock, selectores temporales respaldados por datos, H7 completo secuencial, E2E R11, merge a `develop`, build ARM64 + `.dmg` firmado y verificación standalone.
