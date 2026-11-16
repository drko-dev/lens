# Mirantis Lens 2026.11 — Preferencias y Persistencia

## 1. Categorías de Preferences (`CONFIRMED` en `:9224`)

Observadas en `r12-lens-preferences-real.png` bajo `PREFERENCES`:
1. **`App`**: `THEME` (`Dark`, etc.), `LENS CLI` (`lens` en `/usr/local/bin`), `COLORIZED CLUSTERS`, `START-UP`, `UPDATE CHANNEL`, `LOCALE TIMEZONE`.
2. **`Proxy`**: Configuración HTTP/HTTPS proxy y CAs.
3. **`Kubernetes`**: Sync de kubeconfigs, descarga automática de `kubectl` y mirrors.
4. **`Editor`**: Configuración de Monaco Editor (tab size, minimap, line numbers, font size).
5. **`Tables`**: Densidad / altura de fila, columnas ocultas y límites de **Recent and Favorite Searches** (`Search History Limit`, `Search Favorites Limit`).
6. **`Terminal`**: Shell path, copy on select, tema y **`Terminal Shell Arguments`** (1 argumento por línea, ej. `-NoProfile`, `--norc`, previo a los args de Lens).
7. **`Integrations`**: Configuraciones de integraciones (AWS/Azure/Google/GitOps según versión).
8. **`Telemetry`**: Reporting / analytics opt-in/out.
9. **`External Tools`**: Selector de **AI Tools** (incluye `Claude Code`, `Copilot`, `Gemini`, **`Antigravity CLI (agy)`**, `Codex`, `Custom`), `Allow AI to access UI by default`, `Open AI tools in an external terminal`, `External terminal command`.
- *Nota*: `Extensions > Permissions` (aprobación/revocación de Ask AI por extensión) figura en Release Notes 2026.11 (`CONFIRMED` en texto embebido).

## 2. Almacenes Persistentes (`CONFIRMED` en `main.js`)

| Store (`configName`) | Contenido / Responsabilidad | Equivalente NovaKube |
|---|---|---|
| `config` | Estado base de aplicación / migraciones | `config` |
| `lens-user-store` | Preferencias de usuario (`userPreferencesPersistentStorageInjectable`) | `lens-user-store` |
| `preferences-store` | Estado de preferencias extendidas / categorías UI | `lens-user-store` + `localStorage` |
| `lens-cluster-store` | Clústeres conocidos, colores, iconos, metadata de kubeconfig | `lens-cluster-store` |
| `V8 Code Cache` | Cache compilado de `lens.js` en `userData` (`static/start-window.js`) | **No presente aún en NovaKube** (`P4`) |
| `main-view` groups/tabs | `main-view-tab-groups`, `main-view-groups-width-state` | `openlens:workspace-session-snapshot-v1` + `openlens:global-layout:v1` |
