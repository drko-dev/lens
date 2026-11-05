# H7.0 — Validación

**Fecha:** 2026-11-02 · **Estado:** PASS con limitaciones documentadas (ver §4)

## 1. Resultados

| # | Prueba | Resultado | Evidencia |
|---|---|---|---|
| 1 | Rama H7 confirmada | PASS | `feature/global-docking-h7`, worktree único, HEAD `16a4df8` |
| 2 | Checkpoint RC3 (rama + tag local/remoto) | PASS | `e4b59c5`, tag anotado `473ed58` |
| 3 | Integridad DMG RC3 | PASS | `shasum -c` OK (`805972f6…3197`), `hdiutil verify` VALID |
| 4 | Git y disco | PASS | Sin archivos rastreados modificados; 13 sin seguimiento preservados |
| 5 | Arranque Electron DEV | PASS | 1 proceso Electron; CDP `:9223` expone `https://lens.app:<puerto>/welcome`; sin errores en el log |
| 6 | HMR (renderer, SCSS) | PASS | Regla temporal en `cursor.scss` aplicada en ~4 s; `performance.timeOrigin` sin cambios (no hubo recarga completa); revertida, `git diff` vacío |
| 7 | Aislamiento de perfil | PASS | Perfil en `~/Documents/lens/qa-profiles/h7-dev/appdata/OpenLens DevOpsDev`; único clúster `h7-synthetic` → `qa-profiles/h7-dev/home/.kube/config`; perfil real sin modificar (mtime 2026-11-01 17:13) |
| 8 | HMR de TSX en `packages/core` | LIMITACIÓN | Ver §4.1 — cambio en `welcome.tsx` no reflejado; revertido |
| 9 | Tests unitarios | N/A | Sin cambios de código |

Ejecutadas: 8 · PASS: 7 · FAIL: 0 · Limitación documentada: 1 · PENDING: 0

## 2. Comandos reales

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.2/bin:$PATH"   # Node v24.22.2
cd open-lens
npm run dev:main          # webpack --watch (main)
npm run dev:renderer      # Webpack Dev Server 127.0.0.1:9191, hot: "only"
QA="$HOME/Documents/lens/qa-profiles/h7-dev"
CICD="$QA/appdata" HOME="$QA/home" KUBECONFIG="$QA/home/.kube/config" npm run dev-run
```

- Electron 45.2.0 (arm64), DevTools/CDP en `127.0.0.1:9223`, inspector main en `:9229`.
- No se ejecutó `prestart-dev`: `binaries/client/darwin` y `static/build` ya existían.
- Kubeconfig sintético: servidor `https://127.0.0.1:1`, token ficticio, sin credenciales reales.

## 3. Disco y memoria

| Momento | Libre |
|---|---|
| Inicio de H7.0 | 19,1 GiB |
| Tras borrar build intermedia de `open-lens/dist/` (8 archivos, SHA `61a97777…`, no RC3) | 19,83 GiB |
| Tras `pip3 cache purge` + `~/Library/Caches/{Homebrew,lens-desktop-updater}` | 20,52 GiB |
| Tras compilación inicial (el swap creció) | 19,40 GiB |
| Tras borrar 231 `*.hot-update.*` viejos de `open-lens/static/build` (31/10–02/11, 640 MB, ignorados por Git) | 20,08 GiB |
| Con DEV corriendo | 19,08 GiB |
| Final, procesos cerrados | 18,87 GiB |

- Recuperado en total por limpieza: ~2,1 GiB. Lo consumido después corresponde al **swap de macOS** (5 → 6 GiB en `/private/var/vm`), que no se libera hasta que baje la presión de memoria o se reinicie.
- RAM: 16 GiB; Electron + node ~1,46 GiB RSS con DEV activo; 50 % libre al cerrar.
- Perfil QA: 15 MB.
- **No se tocó:** RC3 (`releases/`, `dist/rc3`), RC2 (`dist/rc2`), checkpoint, `~/.kube`, código fuente, `node_modules`, perfil `OpenLens DevOpsDev`.

## 4. Limitaciones y hallazgos

### 4.1 HMR no cubre los componentes TSX de `packages/core`
`open-lens` importa `@openlens/core/renderer`, que resuelve (symlink) a `packages/core/static/build/library/`, un bundle de producción (41 MB, compilado 2026-11-02 06:48). El dev server solo observa `open-lens/src` y los SCSS de core importados explícitamente en `open-lens/src/renderer/index.ts`. Todo el docking vive en `packages/core`, así que H7.1 necesita un watch de core:

```bash
cd packages/core && NODE_ENV=development npx webpack --config webpack/library-bundle.ts --watch
```

con recarga del renderer (no HMR de estado). Se probará al iniciar H7.1, vigilando memoria: con 16 GiB y el swap ya en ~4,9 GiB, conviene no sumar otros procesos pesados.

#### 4.1.1 Core Watch validado (2026-11-02, previo a H7.1): PASS con recarga

```bash
# 1) solo el bundle renderer de core (sin el de main)
cd packages/core
NODE_ENV=development npx webpack --config webpack/library-bundle.ts --config-name lens-app-renderer --watch
# 2) cd open-lens && npm run dev:renderer
# 3) CICD=… HOME=… KUBECONFIG=… npm run dev-run   (dev:main no hace falta para cambios de UI en core)
```

- Compilación inicial del watch: 2,4 s (caché en disco en `packages/core/node_modules/.cache`, 298 MB). Rebuild incremental: ~1 s.
- Cambio temporal en `welcome.tsx`: presente en `static/build/library/renderer.js`; **no** se aplica por HMR; visible tras recargar el renderer (`location.reload()`, nuevo `timeOrigin`). Revertido: el bundle quedó limpio en ~1 s y Electron mostró el original tras recargar; `git diff` vacío.
- El watch reescribe `packages/core/static/build/library/` (ignorado por Git). Se respaldó antes y se restauró al terminar: 3433 archivos con SHA idéntico al bundle de producción previo.
- RSS de la sesión (watch + dev server + Electron): ~3,3 GiB.
- **Costo real: el swap de macOS.** Pasó de 6 a 9 GiB durante la sesión y no se libera al cerrar los procesos. Disco: 20,23 GiB al iniciar, 17,10 GiB al terminar, sin archivos nuevos que lo expliquen. Con 16 GiB de RAM, cada sesión DEV completa consume del orden de 1–3 GiB de disco en swap hasta reiniciar.

### 4.2 El perfil DEV previo no estaba aislado
`~/Library/Application Support/OpenLens DevOpsDev` (597 MB, último uso 2026-11-01) contiene 15 clústeres reales, incluidos `PAY-PROD-CLUSTER001` y `PROD-CLUSTER002`, apuntando a `~/.kube/*`, y sync de `~/.kube`. Causa: `--user-data-dir` no aísla en este código (ver arquitectura §3.3). Se conserva intacto por decisión del usuario; los datos de configuración son los JSON `lens-*-store.json` (~KB). Lo voluminoso son cachés de Chromium (`Cache` 435 MB, `Code Cache` 106 MB) y `binaries` (48 MB).

## 5. Procesos al finalizar

Ninguno: sin `electron`, `nodemon`, `webpack` ni `dev-server.ts` activos; puertos 9191/9223/9229 libres.
