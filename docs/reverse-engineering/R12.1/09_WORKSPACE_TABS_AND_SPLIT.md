# R12.1-D — Sistema de Workspace Tabs, Grupos, Split Screen y Drag-Out

Extraído de `static/build/lens.js` (`/tmp/lens-r12-1-d-renderer-index.json`) y verificado contra comportamiento documentado en Release Notes 2026.11 y `:9224`.

## 1. Modelo de Tab Groups y Tabs Efímeras (`CONFIRMED`)

- **Tab Groups (`tab-groups-reactive`)**:
  - Los grupos se almacenan por `id` y se ordenan por `orderNumber` (`byOrderNumber`).
  - Existe foco activo por grupo (`set-focused-tab-group-id`) y atajos dedicados (`split-tab-group-keyboard-shortcut`, `focus-next-tab-group-keyboard-shortcut`).
  - Ancho mínimo/base observado en constante vecina: `280` (`Tqe=280`), persistido vía `main-view-groups-width-state`.
- **Tabs Efímeras (`ephemeralTabId`)**:
  - Cada grupo mantiene un único `ephemeralTabId` en su estado (`a?.ephemeralTabId === tabId`).
  - **Fijar tab (`set-tab-as-not-ephemeral`)**: Al hacer doble clic (o fijar), limpia `ephemeralTabId: undefined` en ese grupo (`r.set(a.id, {...a, ephemeralTabId: void 0})`).
  - También existe acción global `set-all-tabs-as-not-ephemeral`.

## 2. Drag-to-Edge Split & Drag-Out a `sub-window`

```mermaid
flowchart LR
    T[Tab en MainView] -->|1 clic recurso| E["ephemeralTabId del grupo"]
    E -->|Doble clic| P["set-tab-as-not-ephemeral (Fija)"]
    T -->|Drag al borde MainView o Split btn| S["Nuevo TabGroup en main-view-tab-groups"]
    T -->|Drag fuera de BrowserWindow| D["main-view-tab-dragged-out-of-window"]
    D -->|tabDraggedOutOfWindowInjectionToken| SW["IPC: spawn-sub-window -> sub-window.html"]
```
