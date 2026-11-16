# R12.1-C — Catálogo de Canales IPC (`static/build/main.js`)

Totales observados por extracción estructural en `main.js` (`/tmp/lens-r12-1-c-main-index.json`):
- **Request Channels**: `171`
- **Message Channels**: `81`
- **Computed Channels**: `23`
- **Síncrono (`ipcRenderer.sendSync`)**: `lens:window-bundle` (`static/start-window.js`)

## 1. Canales de Ventanas, Subventanas, Layouts y Bus Cross-Window

| Tipo | Canal | Propósito | Confianza |
|---|---|---|---|
| `Request` | `spawn-sub-window`, `raise-sub-window`, `dismiss-sub-window`, `retitle-sub-window`, `rename-sub-window`, `has-sub-window`, `sub-window-descriptor`, `describe-closed-sub-window` | Ciclo de vida completo de subventanas | `CONFIRMED` |
| `Message` | `name-this-sub-window`, `sub-window-opening-use`, `sub-window-closed` | Registro, uso y cierre de subventanas | `CONFIRMED` |
| `Computed` | `open-sub-windows`, `window-layouts`, `displays`, `window-messaging-open-windows` | Estado reactivo de ventanas y monitores | `CONFIRMED` |
| `Request` | `window-layouts-now`, `displays-now`, `window-layout-is-allowed-now`, `set-window-bounds`, `place-window`, `set-window-state`, `focus-window` | Geometría y posicionamiento multimonitor | `CONFIRMED` |
| `Request` | `window-messaging-relay-message`, `window-messaging-relay-request`, `window-messaging-answer-request`, `window-messaging-observe`, `window-messaging-unobserve`, `window-messaging-publish-value`, `window-messaging-is-window-open` | Sincronización RPC y pub/sub entre `BrowserWindow`s | `CONFIRMED` |
| `Message` | `window-messaging-envelope`, `window-action-channel`, `bring-application-to-front`, `show-main-view-tab-kludge-channel`, `reset-tab-visibility-scope-channel` | Enrutado de mensajes, acciones de ventana y visibilidad de tabs | `CONFIRMED` |

## 2. Canales de Estado, Persistencia, Ciclo de Vida y Menús

| Tipo | Canal | Propósito | Confianza |
|---|---|---|---|
| `Message` | `store-sync-main`, `store-sync-renderer`, `changes-of-state`, `removal-of-state`, `removal-of-state-with-prefix`, `sync-box-channel` | Replicación de stores MobX/JSON entre procesos | `CONFIRMED` |
| `Request` | `state-snapshot-channel`, `sync-box-initial-value-channel`, `app-paths`, `application-has-loaded`, `request-quit-of-app`, `request-restart-of-app` | Bootstrap e hidratación inicial | `CONFIRMED` |
| `Message` | `request-restart-of-app-in-safe-mode`, `request-restart-of-app-out-of-safe-mode`, `open-command-palette`, `send-feedback-requested`, `open-app-context-menu-channel` | Acciones globales de menú y UI | `CONFIRMED` |

## 3. Canales de Clústeres, Kubernetes, Terminal, Métricas, AI & MCP

- **Clústeres / Kube**: `activate-cluster`, `deactivate-cluster`, `disconnect-cluster`, `delete-cluster`, `clear-cluster-as-deleting`, `set-cluster-as-deleting`, `initial-cluster-state-sync`, `cluster-state-sync`, `cluster-connection-updates`, `cluster-visibility`, `on-cluster-connected`, `open-cluster-overview-tab`, `open-logs`, `edit-resource`, `create-resource`, `open-terminal`.
- **Terminal / PTY**: `start-in-pseudo-terminal`, `write-to-pseudo-terminal`, `kill-pseudo-terminal`, `pseudo-terminal-output`, `pseudo-terminal-exit`, `terminal-in-general-to-main`, `terminal-in-general-to-renderer`, `close-shell-for-dock-tab`, `spawn-detached-on-host`, `cluster-shell-env`.
- **Helm & Kubectl**: `helm-release-*` (`rollback`, `history`, `update`, `creation`, `configuration`), `helm-chart-*`, `list-helm-releases`, `kubectl-apply-all`, `kubectl-delete-all`, `kubectl-execution-channel`, `kubectl-execution-cancel`.
- **Métricas**: `prometheus-query-range`, `prometheus-details`, `prometheus-metrics-providers`, `metrics-query-range-provider`, `metrics-query-provider`, `all-metrics-sources`, `primary-metrics-source`.
- **AI & MCP**: `mcp-show-resource-tab`, `mcp-open-resource-details`, `ai-tool-driving-drive-window`, `ai-tool-driving-open-windows`, `ai-tool-driving-focused-window`, `ai-tool-driving-focus-window`, `ai-tool-publishing-request`, `ask-ai-function-invocation-request`, `run-ask-ai-conversation-of-terminal`, `resume-ask-ai-conversation-externally`, `show-where-external-terminal-is-chosen`.
