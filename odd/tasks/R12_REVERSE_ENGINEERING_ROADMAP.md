# NovaKube — Roadmap Técnico de Remediación Post-R12 (Basado en Brechas Verificadas)

Principio rector: **Preservar el 100% de las funcionalidades propias de OpenLens y NovaKube** (Workspaces, Multiclúster, Hotbar, Colores personalizados, Docking universal / `H7 186/186`, Multiventana, Persistencia, Kubetail, Logs, Terminal/PTY, AI Providers, OAuth, RBAC, Incident Center).

---

## P0 — Incompatibilidades graves o funciones rotas
- *(Ninguna P0 abierta tras el cierre R11.13; `H7 186/186 PASS` y DMG ARM64 verificada).*

## P1 — Ventanas, navegación e interacciones clave diferentes

### Hito R13.1 — Drag-to-Edge Split & Drag-Out `sub-window` en `WorkspaceTabBar`
- **Objetivo**: Reproducir el comportamiento de `Tabs in windows` / `Split screen` de Lens 2026.11 al arrastrar una Workspace Tab al borde del `MainView` o fuera de la ventana.
- **Archivos**: `packages/core/src/features/workspace-tabs/`, `packages/core/src/main/detached-tool-windows/`, `packages/core/src/renderer/components/cluster-manager/`.
- **Compatibilidad**: Usa la infraestructura existente de `workspace-tabs` y `global-docking` sin romper `<iframe id="cluster-frame-*">`.
- **Criterios de aceptación**: Drag al borde derecho/izquierdo crea split; drag fuera de la ventana abre subventana; cerrar subventana reintegra la tab; H7 intacto.

### Hito R13.2 — Sección raíz `Admission Policies [NEW]` en Cluster Navigator
- **Objetivo**: Alinear la sección `Admission Policies [NEW]` con sus 4 recursos (`Mutating/Validating Admission Policies` + `Bindings`) como sección raíz entre `Config` y `Network`.
- **Archivos**: `packages/core/src/renderer/components/kube-object-menu/`, `packages/core/src/renderer/components/layout/sidebar-items.injectable.ts`, `validating-admission-policies`.
- **Pruebas**: `order-of-sidebar-items.test.tsx` (`--runInBand`) + CDP clúster conectado.

## P2 — Componentes y controles ausentes

### Hito R13.3 — `RootNavigatorPanel` Header (`Home v` + lupa) y `SearchInputUrl` Clock/Regex/MatchCase
- **Objetivo**: Unificar la cabecera de `RootNavigatorPanel` (`Home v` dropdown + lupa `Cmd+P`) y agregar el botón reloj dedicado + flags `.*`/`Aa` persistidos por favorito en `SearchInputUrl`.
- **Archivos**: `root-navigator-panel.tsx/.scss`, `search-input-url.tsx`.

### Hito R13.4 — `Terminal Shell Arguments` & `Antigravity CLI (agy)` en Preferences
- **Objetivo**: Agregar `Terminal Shell Arguments` (1 arg/línea antes de args propios) en `Preferences > Terminal` y `Antigravity CLI (agy)` en `Preferences > External Tools` y dropdown AI del TopBar.
- **Archivos**: `terminal-settings.tsx`, `user-preferences`, `external-tools-settings.tsx`, `novakube-top-bar-actions.injectable.tsx`.

## P3 — Diferencias visuales, Menús macOS y Gobernanza Ask AI

### Hito R13.5 — TopBar `notifications` bell + Menú `Help` (`Welcome`, `Send Feedback`) + `Extensions > Permissions`
- **Objetivo**: Agregar icono `notifications` en TopBar, ítems `Welcome` y `Send Feedback` en menú macOS `Help`, y base de permisos `Ask AI` en `Preferences > Extensions`.
- **Archivos**: `novakube-top-bar-actions.injectable.tsx`, `help-extras-menu-items.injectable.ts`, `extensions-settings`.

## P4 — Arquitectura y Optimización a Largo Plazo

### Hito R13.6 — V8 Code Cache en `start-window.js` & Evaluación `Lens MCP` / No-Iframe
- **Objetivo**: Acelerar el arranque frío con `vm.Script` cachedData (`lens:window-bundle`) y evaluar compatibilidad futura del servidor MCP de clúster sin afectar `global-docking` ni `H7`.
