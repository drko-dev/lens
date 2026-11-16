# R12.1 — Observaciones Dinámicas (CDP `:9224`, `:9225` y macOS Accessibility)

| ID | Observación | Resultado Real | Técnica | Confianza |
|---|---|---|---|---|
| `DYN-01` | Targets iniciales de Lens | `splash.html` (`file://`) + `https://lens.app:<port>/` (`page`) | CDP `/json/list` (`:9224`, `:9225`) | `CONFIRMED` |
| `DYN-02` | Menú `Lens > Preferences` | Abre tab `Preferences` con 9 categorías (`App`, `Proxy`, `Kubernetes`, `Editor`, `Tables`, `Terminal`, `Integrations`, `Telemetry`, `External Tools`) manteniendo shell raíz | `osascript` + CDP `:9224`, `:9225` | `CONFIRMED` |
| `DYN-03` | Menú `Window > Minimize` | Cambia `AXMinimized` a `"true"`, restaurable vía AX a `"false"` | `osascript` (`System Events` sobre `PID 25798`) | `CONFIRMED` |
| `DYN-04` | Modal de activación en perfil limpio | `Welcome to Lens — Lens Desktop is not yet activated. Please activate.` intercepta clics en el área central; `Preferences` vía menú nativo sigue abriendo tabs por detrás | `:9224` (`r12-lens-preferences-real.png`), `:9225` | `CONFIRMED` |
| `DYN-05` | `View > Toggle Hotbar` en perfil limpio | Lanzó error `-1728` en primer intento a los `2.8s` del arranque antes de activación o sin foco de menú listo (`toggleHotbarError` registrado); menú completo sí confirmado en `PID 90563` | `osascript` `:9225` vs `:9224` | `CONFIRMED` |
| `DYN-06` | Persistencia tras `SIGTERM` y relanzamiento | Restaura `1440x900` y tabs `["Welcome", "Release Notes", "Preferences"]` desde `persisted-state/main-view-feature/` | `:9225` sesión 1 -> sesión 2 | `CONFIRMED` |
