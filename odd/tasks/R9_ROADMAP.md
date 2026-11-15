# NovaKube — R9: Paridad Visual + Funcional 1:1 — Roadmap

- **Base**: `develop @ f48e9e95`
- **Branch**: `feature/r9-functional-visual-parity`
- **Testing Policy (MANDATORY)**: Single test coordinator (orchestrator), max 1 heavy runner at a time, focused Jest `--maxWorkers=2`, sequential isolated E2E, full suites only at final checkpoints. See `AGENTS.md`.

## Hitos

- [x] **R9.0 — Baseline y recuperación del contexto**: Verificar Git/HEAD, crear rama `feature/r9-functional-visual-parity`, registrar política de testing en `AGENTS.md`, `R9_ROADMAP.md` y `R9_CHECKPOINT.md`, levantar synthetic K8s (`18443`/`18444`), webpack `dev:main` + `dev:renderer` (`9191` HMR) y Electron DEV (`9223`) en paralelo con Mirantis Lens oficial (`9225`).
- [x] **R9.1 — Inventario total de interacciones Lens y NovaKube**: Recorrer Mirantis Lens oficial (`:9225`) e inventariar controles/estados/interacciones reales; mapear equivalentes, stores, IPC, rutas y funciones propias de NovaKube.
- [x] **R9.2 — Matriz comparativa visual/funcional**: Crear `odd/tasks/R9_FEATURE_PARITY_MATRIX.md` con clasificación real (`MATCH`, `VISUAL_GAP`, `FUNCTIONAL_GAP`, `MISSING`, `REGRESSION`, `NOVAKUBE_ONLY`, `EXTERNAL_DEPENDENCY`, `BLOCKED`) y evidencia reproducible.
- [x] **R9.3 — Corrección de regresiones existentes**: Corregir regresiones detectadas preservando 100% de OpenLens + NovaKube (H1–H9, H7, R7/R8).
- [x] **R9.4 — Corrección de funciones compartidas con comportamiento diferente**: Alinear `FUNCTIONAL_GAP` de navegación, botones, menús, tabs, drawers, YAML, logs, terminal, preferences, tooltips, atajos y drag-and-drop.
- [ ] **R9.5 — Paridad visual detallada de componentes**: Corregir `VISUAL_GAP` verificados con capturas comparativas y computed styles en Electron DEV + Hot Reload.
- [ ] **R9.6 — Roadmap de funciones faltantes, dependencias y arquitectura**: Crear `odd/tasks/R9_MISSING_FEATURES_ROADMAP.md` con inventario explícito de `MISSING` / `EXTERNAL_DEPENDENCY`, arquitectura propuesta y criterios de aceptación.
- [ ] **R9.7 — Implementación de funcionalidades faltantes técnicamente realizables**: Implementar y probar funciones faltantes sin dependencias propietarias/licencia externa.
- [ ] **R9.8 — Compatibilidad entre funciones originales y funciones nuevas**: Verificar que OpenLens histórico y NovaKube (Workspaces, multiclúster, pines/colores, docking universal, redocking, multiventana, Kubetail, AI Providers, OAuth, RBAC, Incident Center, temas) convivan sin conflictos.
- [ ] **R9.9 — Hardening, persistencia y regresiones**: Validar persistencia, estados de error/loading/vacío y limpieza de recursos.
- [ ] **R9.10 — Validación E2E integral y aceptación**: Ejecutar en serie tests focalizados, nuevas suites R9 y la suite completa `h7-docking-e2e.mjs` como regresión final, más aceptación visual/funcional comparada.
- [ ] **R9.11 — Merge, release ARM64 y DMG final**: Integrar a `develop`, compilar `.app` + `.dmg` ARM64 desde `develop` HEAD, firmar, verificar `codesign`, probar standalone fuera del servidor DEV, verificar SHA256 y cerrar R9.
