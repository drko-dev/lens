# Mirantis Lens 2026.11 — Ventanas, Subventanas y Paneles

## 1. Ventana Principal (`application-window`)

- **Dimensiones observadas (default)**: `1440x900` (`minWidth: 700`, `minHeight: 500`), `titleBarStyle: "hidden"`.
- **Regiones exactas (CDP `:9224`, `1440x900`)**:
  1. **TopBar** (`x:0, y:0, w:1440, h:49`, `#1F2123`, `borderBottom: 1px solid #2D2F31`): Traffic lights nativos macOS en `x:0..80`, controles internos desde `x:80, y:8, h:32`.
  2. **Hotbar** (`x:0, y:49, w:64, h:830`, `#181A1C`, `borderRight: 1px solid #2D2F31`) con paginador `< 1 >` abajo.
  3. **`<main>`** (`x:64, y:49, w:1376, h:830`): contiene:
     - **Navigator** (`w:248px`, header `"Navigator"` de `h:36px` alineado con `WorkspaceTabBar`).
     - **WorkspaceTabBar** (`x:312..1440, y:49..85, h:36px`) con tabs, badge `PREMIUM` e icono Split (`vertical_split`).
     - **MainView Content** (`y:85..879`) con soporte de múltiples **tab groups** (`main-view-tab-groups` + `main-view-groups-width-state`).
     - **Dock** (`main-view-bottom-items`): barra inferior con tabs del Dock, `+`, `Fit to window` (`fullscreen`) y `Open/Minimize` (`keyboard_arrow_up/down`).
  4. **StatusBar** (`x:0, y:879, w:1440, h:21`, `#1F2123` sin autenticar/neutro o `#3D90CE` autenticado Lens Personal + contexto clúster).

## 2. Ventanas Secundarias (`sub-window`)

- **Mecanismo confirmado**: `static/build/sub-window.html` + `main.js` (`spawn-sub-window`, `raise-sub-window`, `dismiss-sub-window`, `retitle-sub-window`, `rename-sub-window`, `has-sub-window`, `sub-window-descriptor`, `open-sub-windows`) + `lens.js` (`main-view-tab-dragged-out-of-window`).
- **Disparador**: Arrastrar cualquier tab del `MainView` fuera de los límites de la ventana principal crea una `sub-window` con su propio `BrowserWindow` cargando `sub-window.html` + `lens.js` (V8 code cache).
- **Diferencia con NovaKube**: NovaKube usa `detached-tool-window` / `global-docking` para paneles específicos (Terminal, Logs, Resource Details, Workloads), pero aún no implementa arrastrar una `WorkspaceTab` arbitraria (ej. `Preferences`, `Cluster Overview`, `Release Notes`) hacia afuera para spawnear una `sub-window` ni split de `WorkspaceTab` arrastrando al borde de `MainView`.

## 3. Paneles & Drawers

| Panel | Qué lo abre | Dónde aparece | Foco & Redimensión | Cierre & Efecto sobre otros | Estado conservado | Confianza |
|---|---|---|---|---|---|---|
| **Resource Details Drawer** | Clic en fila de tabla / `Cmd+P` / link de recurso / extensión | Slide-over derecho sobre `MainView` (`z-index: 100`) | Recibe foco; ancho fijo/redimensionable | Botón `×`, `Escape`, o **clic/activación de cualquier Dock tab** (cierra el Drawer) | Objeto seleccionado + scroll | `CONFIRMED` |
| **Dock (Terminal / Logs / Edit / Create)** | `+`, menú de fila (`Logs`, `Shell`, `Edit`), AI button | Franja inferior (`main-view-bottom-items`) | `ResizingAnchor` vertical; `fullscreen` (Fit to window) | Botón `×` por tab, `Shift+Escape` minimiza, `Cmd+W` cierra tab | Tabs abiertos + historial/altura | `CONFIRMED` |
| **Split Screen (`MainView`)** | Botón `vertical_split` o drag de tab al borde de `MainView` | Divide `MainView` horizontalmente en `main-view-tab-groups` | Sash divisor (`--vscode-sash-hover-size: 4px`) actualiza `main-view-groups-width-state` | Cerrar última tab del grupo colapsa el split | Anchos de grupos + tabs por grupo | `CONFIRMED` |
| **Modales (`Send Feedback`, Activation, Confirm)** | Botón `Send Feedback` / acción destructiva | Overlay centrado con backdrop oscuro | Trap de foco modal | `Escape` o botón cierre | Formulario transitorio | `CONFIRMED` |
