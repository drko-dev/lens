# R12.1-C — Arquitectura de Subventanas (`sub-window`)

- **HTML**: `static/build/sub-window.html` (carga `/reload-when-bundle-is-back.js` y `/start-window.js`, usando el mismo `lens.js` con V8 Code Cache).
- **Identificación por Query Params** (`main.js` `getSubWindowSearchParams` / `parseSubWindowSearchParams`): `?kind=<kindId>&id=<id>`.
- **Scopes de Inyección**: `main.js` y `lens.js` distinguen `"application-window-only"` vs `"sub-window-only"`, cargando solo las features pertinentes en cada tipo de ventana.

## Ciclo de Vida Observado en Canales IPC

```mermaid
sequenceDiagram
    participant R1 as Renderer (Main Window)
    participant M as Main Process (SubWindow Manager)
    participant R2 as Renderer (SubWindow)

    R1->>M: Request: spawn-sub-window (kind, id, bounds/tab)
    M->>R2: Create BrowserWindow(sub-window.html?kind=...&id=...)
    R2->>M: sync: lens:window-bundle (V8 Code Cache)
    R2->>M: Message: name-this-sub-window
    R1-->>M: Computed: open-sub-windows (lista reactiva)
    R1->>M: Request: raise-sub-window / retitle-sub-window / rename-sub-window
    R2->>M: Message: sub-window-closed (al cerrar)
    R1->>M: Request: describe-closed-sub-window (para restauración)
```

## Canales Asociados (`CONFIRMED`)
- **Request**: `spawn-sub-window`, `raise-sub-window`, `dismiss-sub-window`, `retitle-sub-window`, `rename-sub-window`, `has-sub-window`, `sub-window-descriptor`, `describe-closed-sub-window`.
- **Message**: `name-this-sub-window`, `sub-window-opening-use`, `sub-window-closed`.
- **Computed**: `open-sub-windows`.
- **Cross-Window Sync**: `window-messaging-relay-message`, `window-messaging-relay-request`, `window-messaging-answer-request`, `window-messaging-observe`, `window-messaging-publish-value`.
