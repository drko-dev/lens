# Informe de Preflight y Baseline Reproducible — Hito R1-00

**Proyecto:** OpenLens DevOps Revival  
**Fecha:** 2026-10-19  
**Rama:** `feat/openlens-devops-revival`  
**Commit base (HEAD):** `8838ac308bf4cc70a9911f7cdbc28e919f83fb2a` (`feat: Update crypto-js`)  
**Estado del hito R1-00:** **COMPLETADO (con acciones de ejecución para R1-01 sujetas a autorización)**

---

## 1. Estado actual del repositorio

### 1.1 Identidad Git y árbol de trabajo
- **Rama activa:** `feat/openlens-devops-revival` (alineada en su base con `origin/develop` en `8838ac3`).
- **Historial reciente:**
  - `8838ac3` — `feat: Update crypto-js`
  - `e0bad59` — `build(deps-dev): bump @pmmmwh/react-refresh-webpack-plugin (#47)`
  - `06d6453` — `Revert "fix: Infinite loop on extension install" (#40)`
- **Resumen del working tree (`git status --short` / `git diff --stat`):**
  - **39 archivos con seguimiento modificados** (`1500 inserciones(+), 159 eliminaciones(-)`).
  - **24 entradas sin seguimiento (`??`)**, compuestas por 19 archivos/directorios de código y tests bajo `packages/core/src/` y 5 entradas de análisis/herramientas en la raíz o subdirectorios (`.codegraph/`, `ROADMAP.md`, `docs/revival/`, `lens.js.map`, `open-lens/.omc/`).
  - **Restricción cumplida:** no se descartó, modificó ni limpió ningún archivo del árbol de trabajo.

### 1.2 Archivos con seguimiento modificados (39)
| Área | Archivos modificados |
|---|---|
| Empaquetado y dev-server | `open-lens/package.json`, `open-lens/webpack/dev-server.ts` |
| Identidad, rutas y protocolo | `packages/core/src/common/vars.ts`, `packages/core/src/common/vars/bundled-resources-dir.injectable.ts`, `packages/core/src/common/vars/lens-resources-dir.injectable.ts`, `packages/core/src/main/electron-app/runnables/setup-deep-linking.injectable.ts`, `packages/core/src/main/protocol-handler/lens-protocol-router-main/lens-protocol-router-main.ts`, `packages/core/src/main/protocol-handler/__test__/router.test.ts`, `packages/core/src/main/start-main-application/runnables/show-initial-window.injectable.ts`, `packages/core/src/extensions/extension-discovery/extension-discovery.ts`, `packages/core/src/extensions/extension-discovery/extension-discovery.test.ts`, `packages/core/src/renderer/components/dock/create-resource/user-templates.injectable.ts` |
| Kubeconfig, API y clúster | `packages/core/src/common/kube-helpers.ts`, `packages/core/src/common/__tests__/kube-helpers.test.ts`, `packages/core/src/common/cluster-types.ts`, `packages/core/src/common/k8s-api/kube-api.ts`, `packages/core/src/main/cluster/cluster-connection.injectable.ts`, `packages/core/src/main/cluster/update-entity-spec.injectable.ts`, `packages/core/src/main/cluster/update-entity-spec.test.ts`, `packages/utility-features/json-api/src/json-api.ts`, `packages/kubectl-versions/build/versions.json` |
| Edición YAML y namespaces | `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/edit-resource-model.injectable.tsx`, `packages/core/src/renderer/components/dock/edit-resource/view.tsx`, `packages/core/src/features/cluster/namespaces/edit-namespace-from-new-tab.test.tsx`, `packages/core/src/features/cluster/namespaces/__snapshots__/edit-namespace-from-new-tab.test.tsx.snap` |
| Terminales, sesiones y port-forward | `packages/core/src/main/lens-proxy/proxy-functions/shell-api-request.injectable.ts`, `packages/core/src/main/routes/port-forward/functionality/port-forward.ts`, `packages/core/src/main/shell-session/create-shell-session.injectable.ts`, `packages/core/src/main/shell-session/index.ts`, `packages/core/src/renderer/api/terminal-api.ts`, `packages/core/src/renderer/components/dock/terminal/store.ts` |
| Apariencia de clúster y menús Pod | `packages/core/src/renderer/components/catalog/hotbar-toggle-menu-item.tsx`, `packages/core/src/renderer/components/cluster-settings/icon-settings.tsx`, `packages/core/src/renderer/components/cluster-settings/__tests__/__snapshots__/icon-settings.test.tsx.snap`, `packages/core/src/renderer/components/hotbar/hotbar-entity-icon.tsx`, `packages/core/src/renderer/components/kube-object-menu/kube-object-menu.tsx`, `packages/core/src/renderer/components/kube-object-menu/kube-object-menu.test.tsx`, `packages/core/src/renderer/components/menu/menu-actions.scss`, `packages/core/src/renderer/components/workloads-pods/pod-details-container.tsx` |

### 1.3 Archivos y directorios sin seguimiento (24)
- **Código y pruebas en `packages/core/src/` (19):**
  - `packages/core/src/common/vars/is-packaged-app.injectable.ts`
  - `packages/core/src/common/vars/is-packaged-app.global-override-for-injectable.ts`
  - `packages/core/src/main/routes/port-forward/functionality/port-forward.test.ts`
  - `packages/core/src/main/routes/port-forward/functionality/stop-port-forwards-on-quit.injectable.ts`
  - `packages/core/src/main/routes/port-forward/functionality/stop-port-forwards-on-quit.test.ts`
  - `packages/core/src/main/shell-session/pod-shell-session/`
  - `packages/core/src/renderer/components/cluster-settings/cluster-appearance-dialog.tsx`
  - `packages/core/src/renderer/components/cluster-settings/cluster-appearance-picker.module.scss`
  - `packages/core/src/renderer/components/cluster-settings/cluster-appearance-picker.tsx`
  - `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/request-replace-kube-resource.injectable.ts`
  - `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/save-verification.ts`
  - `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/save.lab-integration.test.tsx`
  - `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/save.test.tsx`
  - `packages/core/src/renderer/components/dock/terminal/create-pod-terminal-tab.injectable.ts`
  - `packages/core/src/renderer/components/dock/terminal/create-pod-terminal-tab.test.ts`
  - `packages/core/src/renderer/components/kube-object-menu/kube-object-menu-items/pod-devops-menu.injectable.ts`
  - `packages/core/src/renderer/components/workloads-pods/pod-devops-menu.tsx`
  - `packages/core/src/renderer/components/workloads-pods/pod-devops-menu.test.tsx`
  - `packages/core/src/renderer/components/workloads-pods/pod-exec-command.ts`
  - `packages/core/src/renderer/components/workloads-pods/pod-exec-command.test.ts`
- **Documentación, índices y artefactos auxiliares (5):**
  - `docs/revival/`
  - `ROADMAP.md`
  - `.codegraph/`
  - `open-lens/.omc/`
  - `lens.js.map` (105 MiB, artefacto temporal de análisis en la raíz)

### 1.4 Arquitectura del monorepo y scripts de build
- **Total de paquetes en workspaces:** 44 (`open-lens` + 43 paquetes `@openlens/*` bajo `packages/**/*`).
- **Orquestador:** Lerna `6.6.2` con caché/topología Nx.
  - `npm run build` (`lerna run --stream build`): compila los 39 paquetes que definen script `build` respetando el grafo topológico (`^build`).
  - `@openlens/core` (`build`): ejecuta `webpack --config webpack/library-bundle.ts` generando `packages/core/static/build/library/{main.js,renderer.js,renderer.css}` y definiciones `.d.ts` mediante `ForkTsCheckerPlugin`, seguido de `linkable-push`.
  - `open-lens` (`build` + `postbuild`): ejecuta `webpack --config webpack/webpack.ts` hacia `open-lens/static/build/`, luego `build:tray-icons` (`@openlens/generate-tray-icons`) y `download:binaries` (`@openlens/ensure-binaries`).
  - `npm run build:app` (`lerna run --stream build:app`): ejecuta en `open-lens` `electron-builder --publish never`.

### 1.5 Hashes de archivos de control (SHA-256)
| Archivo | SHA-256 |
|---|---|
| `package-lock.json` | `db312b2bd5d1298b6ab25b941d64558fbdb2e97fa820a0472433cd5b4b1ffe9b` |
| `open-lens/package.json` | `34fd0b0f03599de98325180e5d2da051a346f0119dc1cdaaf4a10875ca6a0e41` |
| `packages/core/package.json` | `502bb08aa5caa965b821c0b2ac07cf5907c42c5546356fa0cd76e99b8140d457` |

---

## 2. Inventario del entorno y versiones

### 2.1 Sistema operativo y herramientas nativas
- **Sistema operativo:** macOS `27.0.1` (Build `26A434`)
- **Kernel y arquitectura:** `Darwin 27.0.0 arm64` (`RELEASE_ARM64_T8132`)
- **Xcode Developer Dir:** `/Applications/Xcode.app/Contents/Developer`
- **Compilador C/C++:** `Apple clang version 21.0.0 (clang-2100.3.34.2)`, target `arm64-apple-darwin27.0.0`
- **Python del sistema/entorno:** `Python 3.14.6`

### 2.2 Node.js, npm y compatibilidad con `engines`
- **Requisito declarado en el monorepo:**
  - `open-lens/package.json`: `"engines": { "node": ">=16 <=20" }`
  - `packages/core/package.json`: `"engines": { "node": ">=16 <=20" }`
- **Instalaciones de Node.js detectadas en el host:**
  1. **Homebrew (`/opt/homebrew/bin/node`):** `v26.7.0` — **Fuera de rango (`>20`)**. Es la versión que se activó en ejecuciones previas cuando no se cargó `nvm`.
  2. **NVM default (`~/.nvm/versions/node/v22.22.0/bin/node`):** `v22.22.0` (npm `10.9.4`) — **Fuera de rango (`>20`)**.
  3. **NVM LTS Iron (`~/.nvm/versions/node/v20.20.2/bin/node`):** **`v20.20.2` (npm `10.8.2`)** — **DENTRO DE RANGO (`>=16 <=20`) y ya instalada localmente**.

> **Determinación de toolchain:** No hace falta instalar otra versión de Node ni actualizar dependencias del proyecto. Basta con anteponer `/Users/gustavomarcon/.nvm/versions/node/v20.20.2/bin` al `PATH` en toda sesión de compilación y pruebas.

### 2.3 Dependencias críticas instaladas en `node_modules`
| Dependencia | Declarada (`open-lens` / `core`) | Instalada en `node_modules` | Observaciones |
|---|---|---|---|
| `electron` | `^22.3.10` (`build.electronVersion`: `22.3.3`) | `22.3.10` | Binario `arm64`, Node ABI `110` |
| `electron-builder` | `^23.6.0` | `23.6.0` | Configurado con `--publish never` y `npmRebuild: false` |
| `@electron/rebuild` | `^3.2.10` | `3.2.13` | Disponible para rebuild manual si cambiara Electron |
| `typescript` | `^4.9.5` | `4.9.5` | Usado por `ts-loader` y `fork-ts-checker-webpack-plugin` |
| `node-pty` | `0.10.1` | `0.10.1` | Binario nativo `arm64` ya compilado |
| `webpack` | `^5.81.0` | `5.83.1` | Bundle de librería (`core`) y app (`open-lens`) |
| `lerna` | `^6.6.1` | `6.6.2` | Orquestador de workspaces |
| `@kubernetes/client-node` | `^0.19.0` | `0.19.0` | Cliente Kubernetes en proceso main |

### 2.4 Estado de módulos nativos (`.node`) y binarios empaquetados
- **`node-pty` (`0.10.1`):**
  - `node_modules/node-pty/bin/darwin-arm64-110/node-pty.node` (`Mach-O 64-bit bundle arm64`, 61 KiB, SHA-256 `7f2f890c04c4eba69ebc75a7131a9864851c344223458bcde076fa5625b60b4b`).
  - `node_modules/node-pty/build/Release/pty.node` (idéntico hash SHA-256 `7f2f890c04c4eba69ebc75a7131a9864851c344223458bcde076fa5625b60b4b`).
  - **Importante:** ABI `110` corresponde a Electron `22.x`. Como ya está compilado para `darwin-arm64` ABI `110` y `open-lens/package.json` tiene `"npmRebuild": false`, **no es necesario ejecutar `electron-rebuild` ni `node-gyp`** (lo cual evita incompatibilidades con `Python 3.14.6`, donde `distutils` ya no existe).
- **Otros módulos nativos verificados en `arm64`:**
  - `@swc/core-darwin-arm64/swc.darwin-arm64.node` (`arm64`)
  - `@nrwl/nx-darwin-arm64/nx.darwin-arm64.node` (`arm64`)
  - `@parcel/watcher/prebuilds/darwin-arm64/node.napi.glibc.node` (`arm64`)
  - `sharp/build/Release/sharp-darwin-arm64v8.node` (`arm64`)
  - `fsevents/fsevents.node` y `iconv-corefoundation/lib/native.node` (Universal `x86_64` + `arm64`)
- **Binarios de cliente ya descargados en `open-lens/binaries/client/darwin/arm64/`:**
  - `kubectl`: `v1.25.16` (`Mach-O 64-bit executable arm64`, 48 MiB, SHA-256 `d364f73df218b02642d06f3fa9b7345d64c03567b96ca21d361b487f48a33ccc`)
  - `helm`: `v3.11.0+g472c573` (`Mach-O 64-bit executable arm64`, 50 MiB, SHA-256 `6f001f90098d66f8ae88f013a558eeb9513c2ac936ac127416e5f6b24d242caf`)
  - `lens-k8s-proxy`: `v0.3.0` (`Mach-O 64-bit executable arm64`, 35 MiB, SHA-256 `3d7dea9bf2f020c9d282a32688ab8c186bc52871b149dbd8df7878344954a413`)

---

## 3. Diagnóstico del almacenamiento disponible

### 3.1 Estado de volúmenes APFS
| Volumen / Montaje | Dispositivo | Tamaño | Usado | Disponible | Uso % | Observación |
|---|---|---:|---:|---:|---:|---|
| `/` | `/dev/disk3s3s1` | 228 GiB | 13 GiB | **18 GiB** | 41% | Comparte contenedor APFS con Data |
| `/System/Volumes/Data` | `/dev/disk3s1` | 228 GiB | 170 GiB | **18 GiB** | 91% | Volumen real de `$HOME` y `/private/tmp` |
| `/Library/.../iOS_24A434` | `/dev/disk7s1` | 17 GiB | 17 GiB | 480 MiB | 98% | Imagen montada de simulador iOS (independiente) |

- **Volúmenes externos (`/Volumes`):** No hay discos externos conectados (solo el enlace `Macintosh HD -> /` y `.timemachine`).
- **Snapshots locales Time Machine (`tmutil listlocalsnapshots /`):** 0 snapshots activos.
- **Explicación de la variación respecto a mediciones previas:** Durante el análisis con REA, la extracción temporal de `app.asar` en `/tmp` redujo el espacio libre a ~353 MiB / 5.2 GiB. Tras liberarse los temporales de `/tmp` y purgarse bloques APFS, el contenedor dispone actualmente de **18 GiB libres**.

### 3.2 Desglose de espacio en el proyecto (`/Users/gustavomarcon/Documents/lens/lens` — 3.2 GiB)
| Ruta | Tamaño | Naturaleza |
|---|---:|---|
| `open-lens/dist` | **810 MiB** | Build previo del 12 de octubre (`OpenLens DevOps.app` + `.dmg` de 178 MiB) |
| `node_modules` (raíz) | **1.2 GiB** | Dependencias instaladas del monorepo |
| `open-lens/node_modules` | **650 MiB** | Dependencias específicas y paquetes linkeados de `open-lens` |
| `open-lens/binaries` | **134 MiB** | `kubectl`, `helm` y `lens-k8s-proxy` (`darwin/arm64`) |
| `lens.js.map` (raíz) | **105 MiB** | Source map extraído durante el análisis REA (sin seguimiento en Git) |
| `open-lens/static` | **95 MiB** | Bundle previo de `open-lens` (incluye `.hot-update.js` de 11.2 MiB) |
| `.codegraph` | **83 MiB** | Índice CodeGraph del repositorio |
| `packages` | **89 MiB** | Código fuente y `packages/core/static/build` (29 MiB) |

### 3.3 Principales cachés de desarrollo en `$HOME` (~8.5 GiB identificados)
| Ruta | Tamaño | Impacto si se limpia (con autorización) |
|---|---:|---|
| `~/.cache/codex-runtimes` | 1.6 GiB | Caché de runtimes de Codex |
| `~/.cache/codebase-memory-mcp` | 1.1 GiB | Caché de indexación MCP |
| `~/Library/Caches/ms-playwright` | 557 MiB | Navegadores de Playwright |
| `~/Library/Caches/lens-desktop-updater` | 531 MiB | Instaladores descargados por el auto-updater de Lens oficial |
| `~/Library/Caches/orca-updater` | 492 MiB | Caché de actualización de otra app |
| `~/Library/Caches/org.swift.swiftpm` | 488 MiB | Caché de paquetes Swift |
| `~/.cache/huggingface` | 391 MiB | Modelos descargados de HuggingFace |
| `~/.npm` | 338 MiB | Caché de tarballs de npm |
| `~/Library/Caches/node-gyp` | 178 MiB | Headers de Node/Electron para compilación nativa |
| `~/Library/Caches/electron` | 167 MiB | Zips descargados de Electron (**conservar** para que `electron-builder` no vuelva a descargar Electron 22.3.3) |

### 3.4 Evaluación de suficiencia de espacio para el build
- Un ciclo completo de compilación (`@openlens/core` + paquetes + `open-lens` webpack + `electron-builder` `.app` y `.dmg` para `darwin-arm64`) consume entre **1.5 GiB y 2.5 GiB** de pico adicional (y reemplaza los **810 MiB** actuales de `open-lens/dist`).
- Con **18 GiB disponibles**, **sí existe espacio suficiente** para ejecutar el build de `R1-01` dentro del umbral recomendado (`>= 10–15 GiB` libres).
- Adicionalmente, si se autoriza eliminar únicamente `lens.js.map` (105 MiB en la raíz del repo) y `~/Library/Caches/lens-desktop-updater` (531 MiB), se ganan ~636 MiB extra sin tocar cachés útiles de Electron ni dependencias.

---

## 4. Riesgos y bloqueos identificados

1. **Discrepancia de Node.js en el `PATH` predeterminado (Riesgo Alto — Mitigado en procedimiento):**
   - El host tiene Node `v26.7.0` en `/opt/homebrew/bin` y `v22.22.0` como `default` de `nvm`. Ejecutar scripts sin fijar `PATH` viola `engines ("node": ">=16 <=20")`.
   - **Solución:** Exportar explícitamente `PATH="/Users/gustavomarcon/.nvm/versions/node/v20.20.2/bin:$PATH"` antes de cualquier comando.
2. **Prohibición de reconstrucción nativa automática con Python 3.14 (Riesgo Alto — Mitigado):**
   - El host tiene `Python 3.14.6`, que no incluye el módulo estándar `distutils` requerido por la versión antigua de `node-gyp` anidada en `node-pty@0.10.1`.
   - Como `node-pty` ya cuenta con el binario `darwin-arm64-110/node-pty.node` compilado para Electron 22 (ABI 110), **no se debe ejecutar `npm rebuild` ni `electron-rebuild`**. En `open-lens/package.json` ya está configurado `"npmRebuild": false`.
3. **Artefactos mezclados en `open-lens/static/build/` (Riesgo Medio):**
   - El directorio `open-lens/static/build/` contiene archivos `.hot-update.js` / `.hot-update.json` del 15 de octubre junto con `lens.js` del 19 de octubre. Si se ejecuta `electron-builder` sin limpiar antes `static/build`, esos archivos de desarrollo se empaquetarán en `app.asar` (pues `build.files` incluye `"static/**/*"`).
   - **Solución:** Limpiar selectivamente `packages/core/static/build`, `open-lens/static/build` y `open-lens/dist` (conservando `open-lens/binaries` para no re-descargar 134 MiB) al iniciar `R1-01`.
4. **Ruta desactualizada en el helper de pruebas de integración Playwright (Riesgo Medio):**
   - En [`open-lens/integration/helpers/utils.ts`](file:///Users/gustavomarcon/Documents/lens/lens/open-lens/integration/helpers/utils.ts#L18), `appPaths.darwin` apunta a `./dist/mac-arm64/OpenLens.app/Contents/MacOS/OpenLens`, mientras que `open-lens/package.json` define `"productName": "OpenLens DevOps"`, lo que produce `./dist/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps`.
   - **Solución:** Para el smoke test en `R1-01`, lanzar el binario real `./dist/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps` (y actualizar `open-lens/integration/helpers/utils.ts` cuando se autorice tocar archivos de prueba).
5. **Comportamiento de `lens-k8s-proxy` al invocarse directamente (Observación operativa):**
   - El binario `open-lens/binaries/client/darwin/arm64/lens-k8s-proxy` (`v0.3.0`) ignora el flag `--version` y arranca inmediatamente un servidor HTTP en `127.0.0.1:<puerto>` leyendo `~/.kube/config`. No debe invocarse en scripts de verificación sin terminar el proceso inmediatamente.

---

## 5. Estrategia y procedimiento de compilación propuesto (para ejecutar en R1-01)

### 5.1 Garantía de aislamiento de identidad y datos (verificada en código y disco)
| Parámetro | Lens Oficial (`2026.10`) | OpenLens Clásico (`6.5.3`) | OpenLens DevOps (Este Fork) |
|---|---|---|---|
| `productName` | `Lens` | `OpenLens` | `OpenLens DevOps` (`open-lens/package.json:4`) |
| `appId` (`CFBundleIdentifier`) | `com.electron.kontena-lens` | `io.kontena.lens-app` | `dev.drko.openlens-devops` (`open-lens/package.json:85`) |
| Esquema URL (`protocolScheme`) | `lens://` | `lens://` | `openlens-devops://` (`vars.ts:27`, `open-lens/package.json:173`) |
| Directorio en `$HOME` | `~/.k8slens` | `~/.k8slens` | `~/.openlens-devops` (`vars.ts:22`) |
| Directorio `userData` (Prod) | `~/Library/Application Support/Lens` | `~/Library/Application Support/OpenLens` | `~/Library/Application Support/OpenLens DevOps` |
| Directorio `userData` (Dev) | `~/Library/Application Support/LensDev` | `~/Library/Application Support/OpenLensDev` | `~/Library/Application Support/OpenLens DevOpsDev` |
| Directorio `appData` (Smoke/Test) | — | — | Aislable por completo definiendo `CICD=/tmp/openlens-devops-smoke` (`directory-for-integration-testing.injectable.ts`) |

### 5.2 Prevención de publicación, firma y notarización
1. **No publicación:** El script `build:app` en `open-lens/package.json` invoca `electron-builder --publish never`.
2. **Sin firma de producción ni notarización forzada:**
   - `open-lens/build/notarize.js` retorna inmediatamente si no están definidas `APPLEID` y `APPLEIDPASS`.
   - Para evitar que `electron-builder` intente firmar con certificados corporativos del llavero local o contactar a Apple durante el build local, se ejecutará con `CSC_IDENTITY_AUTO_DISCOVERY=false` (o firma ad-hoc local de arm64) y `APPLEID="" APPLEIDPASS=""`.
3. **Sin re-descarga innecesaria de binarios:** Se pasará `LENS_SKIP_DOWNLOAD_BINARIES=true` una vez verificados los hashes SHA-256 de `open-lens/binaries/client/darwin/arm64/{kubectl,helm,lens-k8s-proxy}`.

### 5.3 Secuencia reproducible de comandos (para R1-01)
```bash
# 1. Fijar Node v20.20.2 en la sesión y desactivar auto-discovery de certificados/notarización
export PATH="/Users/gustavomarcon/.nvm/versions/node/v20.20.2/bin:$PATH"
export CSC_IDENTITY_AUTO_DISCOVERY=false
export APPLEID=""
export APPLEIDPASS=""
export LENS_SKIP_DOWNLOAD_BINARIES=true

# Verificar versiones activas
node -v   # Esperado: v20.20.2
npm -v    # Esperado: 10.8.2

# 2. Verificar integridad de los 3 binarios cliente preexistentes (darwin/arm64)
shasum -a 256 \
  open-lens/binaries/client/darwin/arm64/kubectl \
  open-lens/binaries/client/darwin/arm64/helm \
  open-lens/binaries/client/darwin/arm64/lens-k8s-proxy

# 3. Limpiar únicamente bundles previos y dist (conservando open-lens/binaries y node_modules)
npx rimraf packages/core/static/build open-lens/static/build open-lens/dist

# 4. Compilar todos los paquetes del monorepo y la aplicación open-lens
npm run build 2>&1 | tee /tmp/openlens-r1-01-build.log

# 5. Empaquetar la aplicación Electron para macOS arm64 (solo directorio .app primero para smoke rápido, o build:app completo)
npm --workspace open-lens run build:app -- --arm64 --dir 2>&1 | tee /tmp/openlens-r1-01-package.log
```

---

## 6. Baseline de pruebas y verificaciones adicionales para R1-01

### 6.1 Referencia de pruebas unitarias aprobadas (sin clústeres reales)
Se toma como línea base verificada en [`docs/revival/TEST_RESULTS.md`](./TEST_RESULTS.md):
- **Total:** **19 suites / 215 pruebas unitarias aprobadas** (`exit code 0`):
  - **Tanda A (4 suites / 23 tests):** Editor YAML (`save.test.tsx`, `save.lab-integration.test.tsx`), `PodDevOpsMenu`, `PortForward` y `stop-port-forwards-on-quit.test.ts`.
  - **Tanda B (8 suites / 53 tests):** `kube-helpers.test.ts`, sincronización de kubeconfig (`watch-file-changes`, `diff-changed-kubeconfig`), `PodShellSession`, `create-pod-terminal-tab.test.ts`, `icon-settings.test.tsx`, `secret-details`, `update-entity-spec.test.ts`, resolución de proxy del sistema.
  - **Tanda C (7 suites / 139 tests):** `kube-api`, detección de APIs, `kubeconfig-manager`, `kube-object-menu.test.tsx` (Evict / Force Delete), `pod-exec-command.test.ts`, servicio Helm.

### 6.2 Pruebas adicionales identificadas para validar el primer build (`R1-01`)
Para certificar el arranque de `OpenLens DevOps.app` sin tocar clústeres de producción ni perfiles de usuario:
1. **Re-ejecución rápida del subconjunto crítico de Jest bajo Node `v20.20.2`:** confirmar que las suites focalizadas pasan bajo el binario exacto `v20.20.2` (y no solo bajo `v26.7.0`).
2. **Verificación estática del bundle `.app` generado (`open-lens/dist/mac-arm64/OpenLens DevOps.app`):**
   - Comprobar `Info.plist`: `CFBundleIdentifier == "dev.drko.openlens-devops"`, `CFBundleName == "OpenLens DevOps"`, `CFBundleURLTypes` == `openlens-devops`.
   - Comprobar presencia y permisos `+x` de `Contents/Resources/arm64/{kubectl,helm,lens-k8s-proxy}`.
   - Comprobar que `node-pty` (`1463a26331df3b0b4d694b076097b2dd.node` / `pty.node`) está presente y es `arm64`.
3. **Smoke test de arranque aislado con Playwright / Electron (`CICD=/tmp/openlens-devops-smoke-*`):**
   - Lanzar `./open-lens/dist/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps` con `--integration-testing` y variable de entorno `CICD` apuntando a un directorio temporal vacío (además de `KUBECONFIG=/dev/null` para no leer `~/.kube/config`).
   - Verificar que abre la ventana principal (`https://lens.app...`), carga la ruta `/welcome`, navega a `Preferences` (`Application`, `Proxy`, `Kubernetes`), permite alternar el tema visual y cierra limpiamente con código `0`.
   - Comprobar que `mtime` de `~/Library/Application Support/Lens`, `~/Library/Application Support/OpenLens` y `~/.k8slens` permanece inalterado tras el smoke test.

---

## 7. Checklist de requisitos previos y criterios de aceptación de R1-00

### 7.1 Checklist de requisitos previos
- [x] Rama `feat/openlens-devops-revival` y commit `8838ac3` inventariados sin alterar cambios locales.
- [x] Hashes SHA-256 de `package-lock.json`, `open-lens/package.json` y `packages/core/package.json` registrados.
- [x] Espacio libre en `/System/Volumes/Data` verificado (**18 GiB libres**, suficiente para el build).
- [x] Consumidores de disco del proyecto (3.2 GiB) y cachés de usuario (~8.5 GiB) desglosados sin borrar archivos.
- [x] Node.js compatible con `engines (>=16 <=20)` localizado en el sistema (`/Users/gustavomarcon/.nvm/versions/node/v20.20.2/bin/node`, `v20.20.2`).
- [x] Compatibilidad de módulos nativos (`node-pty@0.10.1` ABI 110 `arm64`) y binarios cliente (`kubectl`, `helm`, `lens-k8s-proxy` `arm64`) verificada.
- [x] Aislamiento de identidad (`dev.drko.openlens-devops`, `~/.openlens-devops`, `OpenLens DevOps`) verificado en código y configuración.
- [x] Procedimiento reproducible de compilación sin publicación ni notarización documentado.

### 7.2 Criterios de aceptación para cerrar R1-00
| Criterio | Estado |
|---|---|
| Informe `docs/revival/R1_00_PREFLIGHT.md` creado con las 8 secciones requeridas | **Cumplido** |
| Estado de R1-00 actualizado en `docs/revival/R1_IMPLEMENTATION_CHECKLIST.md` con datos comprobados | **Cumplido** |
| Código fuente, perfiles de usuario y estado Git intactos | **Cumplido** |
| Ningún clúster Kubernetes contactado ni build completo lanzado prematuramente | **Cumplido** |

---

## 8. Acciones que requieren autorización explícita antes de continuar (Puerta hacia R1-01)

Antes de iniciar el **Hito R1-01 (Build controlada, identidad y smoke test sin producción)**, se requiere tu autorización sobre los siguientes puntos:

1. **Autorización para ejecutar el build de `R1-01` bajo Node `v20.20.2`:**
   - Limpiar únicamente los directorios de salida generados (`packages/core/static/build`, `open-lens/static/build` y `open-lens/dist`, que hoy ocupa 810 MiB de un build del 12 de octubre) conservando intactos `open-lens/binaries` y `node_modules`, y ejecutar `npm run build` + empaquetado local `arm64` con `--publish never` y `CSC_IDENTITY_AUTO_DISCOVERY=false`.
2. **Autorización opcional de limpieza de artefactos/cachés no esenciales (solo si deseás ampliar aún más el margen sobre los 18 GiB libres):**
   - Borrar `/Users/gustavomarcon/Documents/lens/lens/lens.js.map` (105 MiB, extraído durante la sesión REA) y/o `~/Library/Caches/lens-desktop-updater` (531 MiB).
3. **Autorización para ejecutar el smoke test local aislado de la aplicación empaquetada:**
   - Arrancar `OpenLens DevOps.app` usando un directorio temporal en `CICD` y `KUBECONFIG=/dev/null` para validar ventana principal, preferencias y cierre sin tocar `~/.kube/config` ni ningún clúster.
