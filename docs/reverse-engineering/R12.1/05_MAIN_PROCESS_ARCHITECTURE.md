# R12.1-C — Arquitectura del Proceso Principal (`static/build/main.js`)

- **Bundle**: `app.asar::static/build/main.js` (`18,005,550 B`).
- **Bootstrap**: `package.json` (`"main": "static/start-main.js"`) -> `main.js`.

## 1. Fábrica Centralizada de Ventanas (`BrowserWindow`)

En `main.js` se observó una única instanciación centralizada de `new BrowserWindow(...)` compartida por `application-window` y `sub-window`:
- `frame`: parametrizado (`titleBarStyle: "hidden"`, `trafficLightPosition` opcional).
- `minWidth: 700`, `minHeight: 500`, `show: false`, `backgroundColor: "#1e2124"`.
- Soporte de estado `"maximized"` (calculando bounds según `display`) y `"fullscreen"`.
- **`webPreferences` exactas**:
  - `nodeIntegration: true` (`!0`)
  - `nodeIntegrationInSubFrames: false` (`!1`) — refuerza que no depende de subframes con Node.
  - `contextIsolation: false` (`!1`)
  - `enableDeprecatedPaste: true` (`!0`)
  - `additionalArguments` parametrizados.

## 2. Subsistemas Identificados en `main.js`

| Subsistema | Responsabilidad | Canales / Evidencia | Confianza |
|---|---|---|---|
| **App Paths & Single Instance** | Resuelve `userData` vía `CICD`, bloquea segunda instancia | `app-paths-setup-main`, `enforce-single-application-instance`, `app-paths` | `CONFIRMED` |
| **Window & Layout Manager** | Posición, tamaño, multi-display, bounds, estado maximizado/fullscreen | `window-layouts`, `window-layouts-now`, `displays`, `displays-now`, `set-window-bounds`, `place-window`, `set-window-state`, `focus-window` | `CONFIRMED` |
| **Sub-Window Manager** | Ventanas secundarias (`Tabs in windows`) | `spawn-sub-window`, `raise-sub-window`, `dismiss-sub-window`, `retitle-sub-window`, `rename-sub-window`, `open-sub-windows`, `describe-closed-sub-window` | `CONFIRMED` |
| **Cross-Window Messaging Bus** | Bus de mensajes, requests y valores observables entre ventanas | `window-messaging-open-windows`, `window-messaging-relay-message`, `window-messaging-relay-request`, `window-messaging-answer-request`, `window-messaging-observe`, `window-messaging-publish-value` | `CONFIRMED` |
| **Store Sync & State** | Sincronización Main <-> Renderers y snapshots | `config`, `lens-user-store`, `preferences-store`, `lens-cluster-store`, `store-sync-main`, `store-sync-renderer`, `state-snapshot-channel` | `CONFIRMED` |
| **Cluster & Kubeconfig Proxy** | Conexión, proxy interno, `lens-k8s-proxy`, `kubectl`/`helm` | `activate-cluster`, `deactivate-cluster`, `initial-cluster-state-sync`, `ensure-kubeconfig-file-channel`, `helm-*`, `kubectl-*` | `CONFIRMED` |
| **Terminal / PTY** | Creación/escritura/cierre de `node-pty` y entorno de clúster | `start-in-pseudo-terminal`, `write-to-pseudo-terminal`, `kill-pseudo-terminal`, `pseudo-terminal-output`, `pseudo-terminal-exit`, `cluster-shell-env` | `CONFIRMED` |
| **AI Tools / Ask AI / MCP** | Integración MCP local, driving de ventanas y prompts Ask AI | `mcp-show-resource-tab`, `mcp-open-resource-details`, `ai-tool-driving-*`, `ask-ai-*`, `run-ask-ai-conversation-of-terminal` | `CONFIRMED` |
| **Cloud Auth** | OAuth / perfiles AWS EKS, Azure AKS, Google GKE, MKE | `request-aws-profile-activation-channel`, `assume-aws-role-with-mfa`, `rename-aks-*`, `gke-oauth-login`, `authenticate-mke-cluster` | `CONFIRMED` |
