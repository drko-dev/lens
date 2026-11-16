# R12.1 — Matriz de Cobertura de Controles e Interacciones

Cobertura calculada estrictamente sobre el alcance inventariado en Mirantis Lens `2026.11.91422-latest` (sin extrapolar ni declarar 100%).

| Área / Grupo | Controles / Mecanismos Inventariados | Verificados (`CONFIRMED`) | Bloqueados en Perfil Sin Activar (`BLOCKED`) | Fuente Principal |
|---|---|---|---|---|
| **Shell Global & Menús macOS** (`Lens`, `File`, `Edit`, `View`, `Window`, `Help`, `TopBar`, `Hotbar`, `StatusBar`, `RootNavigator`) | 42 | 35 | 7 (acciones tras modal de activación) | CDP `:9224`/`:9225`, `System Events` (`PID 90563`, `25798`), `r12-lens-*.png` |
| **Ventanas, Subventanas & Persistencia** (`application-window`, `splash`, `sub-window`, `window-state`, `persisted-state`) | 18 | 14 | 4 (drag-out vivo de tab a `sub-window` tras modal) | `main.js`, `lens.js`, `sub-window.html`, `:9225` reinicio |
| **Preferences** (9 categorías `App` .. `External Tools`) | 15 | 11 | 4 (interacción con formularios detrás del modal en `:9225`) | CDP `:9224`/`:9225`, Release Notes 2026.11 |
| **Cluster, Kubernetes, Dock, Drawer, Terminal, Logs** | 34 | 18 (por código/capturas `r8-*-lens.png`/Release Notes/IPC) | 16 (interacción en vivo sin cuenta activada en `:9225`) | `r8-0/1/2/4-lens.png`, `main.js` IPC, `lens.js` |
| **TOTAL INVENTARIADO** | **109** | **78 (`71.6%` confirmado)** | **31 (`28.4%` bloqueado por activación)** | — |
