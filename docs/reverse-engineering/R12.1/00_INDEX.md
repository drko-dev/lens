# Mirantis Lens 2026.11 — R12.1 Deep Reverse Engineering Index

- **Target**: `/Applications/Lens.app` (`2026.11.91422-latest`, macOS `arm64`, Electron `45.2.3`, Chromium `156.0.8078.80`, Node `24.22.2`)
- **Alcance**: Investigación estática, dinámica, arquitectónica, de estados, IPC y persistencia **exclusivamente sobre Mirantis Lens** (sin comparación con NovaKube ni cambios de código).

## Documentos del Espacio `R12.1/`

| Documento | Contenido | Estado |
|---|---|---|
| [01_EXECUTIVE_TECHNICAL_SUMMARY.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/01_EXECUTIVE_TECHNICAL_SUMMARY.md) | Síntesis técnica y hallazgos nuevos R12.1 | `DONE` |
| [02_MCP_CAPABILITIES.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/02_MCP_CAPABILITIES.md) | Catálogo real de 207 herramientas `rea-agents@6.5.0` y límites | `DONE` |
| [03_ASAR_AND_BUNDLE_INVENTORY.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/03_ASAR_AND_BUNDLE_INVENTORY.md) | Inventario completo `Lens.app`, `app.asar` (`16,888` files) y unpacked | `DONE` |
| [05_MAIN_PROCESS_ARCHITECTURE.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/05_MAIN_PROCESS_ARCHITECTURE.md) | Fábrica `BrowserWindow` y subsistemas de `main.js` | `DONE` |
| [06_RENDERER_ARCHITECTURE.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/06_RENDERER_ARCHITECTURE.md) | Paquetes `@lensapp/*`, DI `@ogre-tools/injectable`, cero `<iframe>` | `DONE` |
| [07_ELECTRON_WINDOW_LIFECYCLE.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/07_ELECTRON_WINDOW_LIFECYCLE.md) | Creación, bounds, splash, minimización, cierre y restauración | `DONE` |
| [08_SUBWINDOW_ARCHITECTURE.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/08_SUBWINDOW_ARCHITECTURE.md) | Subventanas (`sub-window.html`), `spawn-sub-window` y bus cross-window | `DONE` |
| [09_WORKSPACE_TABS_AND_SPLIT.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/09_WORKSPACE_TABS_AND_SPLIT.md) | `ephemeralTabId`, `tab-groups-reactive`, splits y drag-out | `DONE` |
| [11_INTERACTION_COVERAGE_MATRIX.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/11_INTERACTION_COVERAGE_MATRIX.md) | Matriz de cobertura de controles e interacciones observadas vs bloqueadas | `DONE` |
| [13_KEYBOARD_AND_FOCUS.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/13_KEYBOARD_AND_FOCUS.md) | Scope listener + 36+ shortcuts internos declarativos | `DONE` |
| [15_IPC_CHANNEL_CATALOG.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/15_IPC_CHANNEL_CATALOG.md) | Catálogo de 275 canales IPC (`171` req, `81` msg, `23` computed) | `DONE` |
| [16_STATE_AND_PERSISTENCE.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/16_STATE_AND_PERSISTENCE.md) | Stores JSON, `persisted-state/`, `lens-local-storage-v2/`, `Code Cache` | `DONE` |
| [17_RESTART_AND_RECOVERY.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/17_RESTART_AND_RECOVERY.md) | Experimentos de reinicio en perfil QA aislado (`:9225`) | `DONE` |
| [18_DYNAMIC_OBSERVATIONS.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/18_DYNAMIC_OBSERVATIONS.md) | Observaciones dinámicas CDP + macOS Accessibility / `osascript` | `DONE` |
| [19_ERRORS_AND_LIMITATIONS.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/19_ERRORS_AND_LIMITATIONS.md) | Limitaciones de herramientas, OOM y modal de activación | `DONE` |
| [20_OPEN_RESEARCH_QUESTIONS.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/20_OPEN_RESEARCH_QUESTIONS.md) | Preguntas abiertas priorizadas por impacto | `DONE` |
| [21_EVIDENCE_INDEX.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/21_EVIDENCE_INDEX.md) | Índice maestro de evidencias REA, ASAR, CDP y disco | `DONE` |
| [22_FINAL_RESEARCH_REPORT.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/22_FINAL_RESEARCH_REPORT.md) | Informe técnico final consolidado | `DONE` |
| [STATIC_ANALYSIS_RECOVERY_LOG.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/static-analysis/STATIC_ANALYSIS_RECOVERY_LOG.md) | Registro de recuperación OOM en `main.js` y estrategia `lens.js` | `DONE` |
| [R12_1_CHECKPOINT.md](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/docs/reverse-engineering/R12.1/checkpoints/R12_1_CHECKPOINT.md) | Estado final de unidades `R12.1-A`..`R12.1-L` | `DONE` |
