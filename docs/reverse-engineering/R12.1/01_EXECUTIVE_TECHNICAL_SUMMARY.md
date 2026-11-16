# R12.1 — Resumen Técnico Ejecutivo

La investigación R12.1 profundizó más allá de la superficie visual de R12 para reconstruir la arquitectura interna verificable de **Mirantis Lens `2026.11.91422-latest`** (`Electron 45.2.3`, `Chromium 156.0.8078.80`, `Node 24.22.2`, `arm64`):

1. **Empaquetado & Arranque Rápido (`R12.1-B`)**:
   - `app.asar` contiene `16,888` archivos (`204 MiB`), `285` entradas unpacked (`33` binarios nativos incluyendo `node-pty`, `keytar`, `@parcel/watcher`, `fsevents`, `msgpackr-extract`, `@azure/msal-node-runtime`, `tsc`).
   - Cada ventana carga `lens.js` (`31.4 MB`) mediante `static/start-window.js` + `ipcRenderer.sendSync("lens:window-bundle")` + `static/run-with-code-cache.js` usando `Code Cache` V8 en disco.
2. **Arquitectura IPC & Ventanas (`R12.1-C`)**:
   - Catalogados **275 canales IPC** en `main.js` (`171` request, `81` message, `23` computed).
   - Una fábrica única de `BrowserWindow` (`minWidth: 700, minHeight: 500`, `nodeIntegration: true`, `nodeIntegrationInSubFrames: false`, `contextIsolation: false`, `titleBarStyle: "hidden"`).
   - Subventanas (`sub-window.html?kind=...&id=...`) sincronizadas por un bus cross-window (`window-messaging-relay-message`, `window-messaging-relay-request`, `window-messaging-observe`, `window-messaging-publish-value`) y ciclo de vida `spawn-sub-window` / `dismiss-sub-window` / `describe-closed-sub-window`.
3. **Renderer, Tabs & Teclado (`R12.1-D`)**:
   - **0 `<iframe>`, 0 `BrowserView`, 0 `WebContentsView`**: todo corre en el árbol único de `@lensapp/root-layout` + `@lensapp/main-view`.
   - Cada `TabGroup` mantiene `ephemeralTabId`; `set-tab-as-not-ephemeral` la convierte en permanente; `main-view-tab-dragged-out-of-window` dispara `sub-window`.
   - `36+` shortcuts declarativos en `@lensapp/keyboard-shortcuts` cubren tabs, split groups, árbol del Navigator, filas de listas, Dock, Terminal y mouse back/forward.
4. **Persistencia Real en Disco (`R12.1-G..K`)**:
   - El estado de UI/tabs/grupos **no** depende de `window.localStorage` (donde solo hay cookies `refiner_*`), sino de archivos por feature en `persisted-state/` (`main-view-feature`, `navigator-feature`, `cluster-manager`, `initial-navigator-expansion`, `release-notes`, `migrations`), `lens-local-storage-v2/` (`entity-aggregator-main`), `window-state-for-first-application-window.json`, `lens-user-store.json` y `lens-cluster-store.json`.
   - Verificado en experimento de reinicio (`:9225`): abrir `Preferences` en sesión 1 restaura automáticamente la tab `Preferences` y dimensiones `1440x900` en sesión 2.
