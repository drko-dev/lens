# R12.1-D — Teclado, Foco y Navegación por Scope

## 1. Infraestructura de Eventos (`keyboard-mouse-shortcut-listener`)

- Lens envuelve `#app` en `keyboard-mouse-shortcut-listener-module__Listener` y delimita regiones con `keyboard-mouse-shortcut-scope-module__Scope` (`display: contents`).
- Soporta tanto atajos de **teclado** (`invoke-shortcut`) como botones de **mouse** (`invoke-mouse-shortcut`, ej. `go-back-mouse-keyboard-shortcut` / `go-forward-mouse-keyboard-shortcut`).

## 2. Catálogo Completo de Shortcuts Identificados en `lens.js` (`CONFIRMED`)

- **Tabs & Split Groups**:
  - `close-selected-tab-keyboard-shortcut`, `close-tab-keyboard-shortcut`, `close-tab-keyboard-shortcut-invoke`
  - `switch-next-keyboard-shortcut`, `switch-previous-keyboard-shortcut`
  - `split-tab-group-keyboard-shortcut`
  - `focus-next-tab-group-keyboard-shortcut`
- **Navigator Tree (`@lensapp/tree`)**:
  - `focus-previous-node-keyboard-shortcut`, `focus-next-node-keyboard-shortcut`, `focus-last-node-keyboard-shortcut`
  - `focus-child-or-open-node-keyboard-shortcut` (flecha derecha / Enter)
  - `focus-parent-or-close-node-keyboard-shortcut` (flecha izquierda)
  - `open-node-context-menu-keyboard-shortcut`
  - `trigger-entity-single-click-keyboard-shortcut`, `trigger-entity-double-click-keyboard-shortcut`, `trigger-create-child-keyboard-shortcut`
- **Tablas & Listas**:
  - `move-to-next-row-in-item-list-layout-keyboard-shortcut`, `move-to-previous-row-in-item-list-layout-keyboard-shortcut`
- **Dock, Terminal & Navegación**:
  - `open-terminal-keyboard-shortcut`, `open-new-lens-prism-dock-tab-keyboard-shortcut`
  - `go-back-keyboard-shortcut`, `go-forward-keyboard-shortcut`
  - `show-cluster-settings-tab-keyboard-shortcut`, `reveal-cluster-command-shortcut`
  - `close-command-palette-keyboard-shortcut`, `toggle-dev-tools-keyboard-shortcut`
