# H7.0 — Arquitectura y entorno DEV

**Fecha:** 2026-11-02 · **Rama:** `feature/global-docking-h7` · **HEAD auditado:** `16a4df8`
**Alcance:** auditoría de solo lectura. No se modificó código fuente.

## 1. Preflight Git y checkpoint

| Ítem | Resultado |
|---|---|
| Rama activa | `feature/global-docking-h7` (worktree único) |
| Historial | `16a4df8` → `8d76cf6` (runbook) → `2ef8c98` (RC3 docs) |
| Rama `checkpoint/rc3-pre-h7-2026-11-02` | local y remota en `e4b59c5` (desciende de `2ef8c98`, solo agrega `docs/checkpoints/RC3_PRE_H7_2026-11-02.md`) |
| Tag `rc3-pre-h7-2026-11-02` | presente local y remoto (objeto anotado `473ed58`, apunta a `e4b59c5`) |
| DMG RC3 respaldado | `~/Documents/lens/releases/rc3-pre-h7-2026-11-02/` — `shasum -c SHA256SUMS` OK (`805972f6…3197`), `hdiutil verify` VALID |
| Copia en repo | `open-lens/dist/rc3/` mismo SHA-256 |
| Sin seguimiento preservados | 13 rutas (`.codebase-memory/`, `docs/evidence/h1-e2e/*.png`, `main.js`, `odd/*.png`, `open-lens/lens.css`, `open-lens/scripts/`, `open-lens/static/branding/app-icons/negro-flat-backup.png`, `splash.html`, `trayIcon*.png`) — sin tocar |

## 2. Arquitectura actual (evidencia `packages/core/src`, abreviado `CORE`)

### 2.1 ClusterFrameLayout
- `CORE/renderer/frames/cluster-frame/cluster-frame-layout-child-component.injectable.tsx` registra el layout en `clusterFrameChildComponentInjectionToken` (`cluster-frame-child-component-injection-token.ts:15`).
- Renderiza `<MainLayout sidebar={<Sidebar/>} footer={<Dock/>}>` con la ruta activa (`currentRouteComponentInjectable`) en la línea ~35.
- **Punto de integración H7.1:** envolver ese `<Component />` con un host de paneles, condicionado por flag inyectado. Agregar un hijo hermano al token no sirve: quedaría fuera de la columna de contenido.

### 2.2 MainLayout
- `CORE/renderer/components/layout/main-layout.tsx`: props `sidebar`, `footer`, `children`, `className`.
- Columnas: `cluster-nav-column` (sidebar redimensionable 150–400 px, `--sidebar-width`), `cluster-content-column` (`ErrorBoundary` + children), footer (Dock).
- El host global vive **solo** dentro de `cluster-content-column`; sidebar y Dock quedan intactos.

### 2.3 Motor split-panel (`CORE/renderer/components/split-panel/`, ~5,1 k líneas + ~2 k de tests)
- Árbol `SplitLayoutNode = Branch | Group | Leaf` (`split-panel-types.ts:75-114`); orientación `horizontal | vertical`; `Group` = pestañas.
- `PanelKind`: `kubetail, resource-details, pods, deployments, events, terminal, resource-editor`.
- Catálogo (`panel-catalog.ts`): `terminal` y `resource-editor` con `available: false`.
- API del store (`split-panel-store.ts`): `addPanel` (451), `closePanel` (467), `toggleMaximizePanel` (500), `movePanel(src, target, "group" | "split-horizontal" | "split-vertical")` (509), `swapLeaves` (537), `extractTabFromGroup` (555), `setBranchRatio` (343), `setClusterId` (318), plantillas de workspace (581/610).
- Desacople: `detachPanel` (644, exige `clusterId`, marca desacoplado solo tras confirmación de main), `redockPanel` (770), `onPanelRedocked` (812, fail-closed ante `clusterId` distinto). `DynamicLayoutRenderer` limita `canDetach` a `kubetail` y `resource-details` (`dynamic-layout-renderer.tsx:44`).
- Persistencia: `serializeLayout` (916), formato `version: 3` con migración desde V1/V2, `restoreLayout` (997, ventanas desacopladas restauradas inertes), `persistToStorage` (1114) en `localStorage["openlens:split-layout"]`, backup de payload corrupto y `assertNoSensitiveFields`.
- Consumidor único: `CORE/renderer/components/kubetail/kubetail-page.tsx` (flag `floatingPanelsFeatureFlag`, guardia `isNestedInSplit`).

### 2.4 Ventanas nativas
- Canales: `CORE/common/detached-tools/detached-tool-channels.ts` (`request-detach`, `frame-request-redock`, `frame-list-detached`, `redocked`), tema y terminal en canales propios.
- Main: `CORE/main/detached-tool-windows/` — `BrowserWindow` sandbox, sin `nodeIntegration`, partición `openlens-detached-tools`, registro por `webContents.id` con descriptor que incluye `clusterId`, limpieza en `closed`, validación de identidad en redock.
- Flag: `detached-tool-windows-feature-flag.injectable.ts` (`--enable-detached-tools` u `OPENLENS_DETACHED_TOOLS`).

### 2.5 Sistemas que deben convivir
- `CORE/features/workspace-tabs/`: barra de pestañas **por clúster** con `accentColor` desde `cluster.preferences.clusterColor`. Sin referencias cruzadas con split-panel; riesgo de colisión de nombres ("workspace").
- Color del pin: `clusterColor` en `CORE/common/cluster-types.ts:108`; lo escribe `cluster-settings/cluster-appearance-picker.tsx` y lo propaga `main/cluster/update-entity-spec.injectable.ts`. Acción contextual en `hotbar/hotbar-entity-icon.tsx:122` (diagnóstico del bug diferido a H7.4).

### 2.6 Dependencias
- Ninguna librería de docking (dockview, flexlayout-react, rc-dock, react-mosaic, golden-layout, allotment) en `package.json` ni `node_modules`.

## 3. Entorno DEV

### 3.1 Scripts reales
- Raíz: `start-dev` = `lerna run start` (con `prestart-dev`: tray icons + binaries).
- `open-lens`: `start` = `concurrently -i -k "npm run dev-run -C" npm:dev:*`
  - `dev:main`: webpack `--watch` (`webpack/main.ts`)
  - `dev:renderer`: `ts-node ./webpack/dev-server.ts` → Webpack Dev Server `127.0.0.1:9191` (`WEBPACK_DEV_SERVER_PORT`), `hot: "only"`, `writeToDisk: true`
  - `dev-run`: `nodemon --watch ./static/build/main.js --exec "electron --remote-debugging-port=9223 --inspect ."`

### 3.2 Versiones
- `.nvmrc` = 24; Node por defecto en shell = v22.22.0; nvm tiene v24.22.2 → usar v24.22.2.
- Electron 45.2.0, binario Mach-O arm64 presente; `open-lens/binaries/client/darwin` y `static/build` existentes (no hace falta `prestart-dev`).

### 3.3 Aislamiento de perfil (hallazgo importante)
- `CORE/main/app-paths/setup-app-paths.injectable.ts:36` **reescribe** `userData = appData/appName`. Por eso `--user-data-dir` (usado en H6) **no aísla**: el perfil DEV real termina en `~/Library/Application Support/OpenLens DevOpsDev` (597 MB, último uso 2026-11-01).
- Mecanismo correcto ya existente: `CICD=<dir>` sobrescribe `appData` (líneas 30-31) y los logs; con `CICD` + `HOME=<dir>` el `homedir` pasa a `HOME` (`CORE/common/vars/user-info.injectable.ts`), por lo que el sync de kubeconfig (`~/.kube` por defecto) apunta al HOME sintético.
- Perfil QA propuesto (fijo, fuera del repo): `~/Documents/lens/qa-profiles/h7-dev/` con `home/.kube/config` sintético (cluster `https://127.0.0.1:1`, sin credenciales), y `KUBECONFIG` apuntando a él.
- Comando real (solo Electron con entorno aislado; webpack sin `HOME` alterado):

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.2/bin:$PATH"
cd open-lens
npm run dev:main            # proceso 1
npm run dev:renderer        # proceso 2
QA=~/Documents/lens/qa-profiles/h7-dev
CICD="$QA/appdata" HOME="$QA/home" KUBECONFIG="$QA/home/.kube/config" npm run dev-run   # proceso 3
```

Ejecutado y validado el 2026-11-02 (ver `H7_0_VALIDACION.md`).

### 3.4 Alcance real del HMR
- `open-lens` consume `@openlens/core/renderer` desde `packages/core/static/build/library/` (bundle precompilado), no desde el fuente.
- HMR funciona para `open-lens/src` y los SCSS de core importados en `open-lens/src/renderer/index.ts`.
- Cambios TSX en `packages/core` requieren un watch del bundle de core más recarga del renderer (propuesta en `H7_0_VALIDACION.md` §4.1).

### 3.5 Recursos
- Disco al iniciar: 19,1 GiB; tras la limpieza autorizada: 20,52 GiB; final: 18,87 GiB (crecimiento del swap de macOS).
- RAM: 16 GiB. Puertos 9191/9223/9229 libres al terminar.
