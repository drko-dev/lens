# R12.1-B — Inventario Completo del Empaquetado (`Lens.app` & `app.asar`)

- **Objetivo**: `/Applications/Lens.app` (`2026.11.91422-latest`, `arm64`).
- **Fuente**: `rea.inspect_artifact` (`ev_a9535b14c25ac02873e17aca4a92ec906be42fd25b86218b84ec448f844cb967`), `rea.inspect_plist`, `rea.inspect_signature`, inspección de solo lectura de header `app.asar` (`/tmp/lens-r12-1-b-inventory.json`).

## 1. Estructura de `/Applications/Lens.app/Contents/`

| Ruta | Tipo / Tamaño | Función Identificada | Confianza |
|---|---|---|---|
| `MacOS/Lens` | Mach-O arm64 (SHA-256 `fcba4973...`) | Ejecutable principal Electron (`Developer ID Application: Kontena Oy`) | `CONFIRMED` |
| `Frameworks/Electron Framework.framework` | `208,076,816 B` (`45.2.3`) | Runtime Electron `45.2.3` + Chromium `156.0.8078.80` + Node `24.22.2` | `CONFIRMED` |
| `Frameworks/Lens Helper*.app` | 4 helpers | `Lens Helper`, `GPU`, `Plugin`, `Renderer` (sandboxed y non-sandboxed) | `CONFIRMED` |
| `Frameworks/{Mantle,ReactiveObjC,Squirrel}.framework` | Frameworks macOS | Soporte auto-update (`Squirrel`) y Cocoa bindings | `CONFIRMED` |
| `Resources/app.asar` | `168,563,558 B` (`16,888` files, `204 MiB` descomprimido) | Código y assets principales de Lens Desktop | `CONFIRMED` |
| `Resources/app.asar.unpacked` | `285` entradas | Binarios nativos `.node`, `.dylib`, `spawn-helper`, `tsc` | `CONFIRMED` |
| `Resources/arm64/{helm,kubectl,lens-k8s-proxy}` | `55.9 MB` / `49.0 MB` / `40.8 MB` | Binarios embebidos: Helm `3.20.2`, Kubectl `1.27.16`, `lens-k8s-proxy` `0.4.0` | `CONFIRMED` |
| `Resources/cli/bin/` | CLI bundle | Comando `lens` instalable en `/usr/local/bin` | `CONFIRMED` |

## 2. Entrypoints y Archivos Clave en `app.asar` (fuera de `node_modules`: 69 archivos)

| Archivo en `app.asar` | Tamaño | Rol / Relación | Confianza |
|---|---|---|---|
| `package.json` | `2,568 B` | `main: "static/start-main.js"`, CSP, deps `@lensapp/*` y `@k8slens/*` | `CONFIRMED` |
| `static/start-main.js` | `2,133 B` | Bootstrap del proceso main (`static/build/main.js`) | `CONFIRMED` |
| `static/start-window.js` | `1,283 B` | Solicita `ipcRenderer.sendSync("lens:window-bundle")` y ejecuta `lens.js` con V8 Code Cache | `CONFIRMED` |
| `static/run-with-code-cache.js` | `3,792 B` | Compilador/cargador V8 `cachedData` en disco para ventanas | `CONFIRMED` |
| `static/build/main.js` | `18,005,550 B` | Bundle Webpack/Rspack del proceso Main | `CONFIRMED` |
| `static/build/lens.js` | `31,488,146 B` | Bundle Webpack/Rspack compartido por todas las ventanas/subventanas | `CONFIRMED` |
| `static/build/index.html` | `287 B` | HTML raíz de `application-window` (`#app`, `#terminal-init`, `/start-window.js`) | `CONFIRMED` |
| `static/build/sub-window.html` | `1,211 B` | HTML dedicado de `sub-window` con spinner `.sub-window-loading` + `/start-window.js` | `CONFIRMED` |
| `static/splash.html` + `splash.png` | `2,869 B` + `2.28 MB` | Ventana `splash` inicial destruida al montar `first-application-window` | `CONFIRMED` |
| `static/reload-when-bundle-is-back.js` | `1,169 B` | Soporte reload ante reconstrucción de bundle | `CONFIRMED` |
| `static/build/assets/*` | `32` `.png`/`.webm` | Previews embebidos (Welcome, Argo Rollouts, AI Tools, Split screen, Tabs in windows, MCP) | `CONFIRMED` |

## 3. Módulos Nativos Identificados (`app.asar.unpacked`, 33 binarios principales)

- `node-pty` (`1.1.0-beta34`: `pty.node`, `spawn-helper`): PTY real para Terminal.
- `keytar` (`keytar.node`): Acceso a macOS Keychain.
- `@azure/msal-node-runtime` (`libmsalruntime.dylib`, `msal-node-runtime.node`) + `@azure/msal-node-extensions` (`dpapi.node`): Autenticación Azure/AKS.
- `@parcel/watcher` (`watcher.node`) + `fsevents` (`fsevents.node`): Watchers de kubeconfigs, extensiones locales y archivos.
- `@electron-internal/extract-zip` (`index.darwin-universal.node`): Extracción nativa de paquetes/extensiones.
- `msgpackr-extract` (`extract.node`): Serialización binaria rápida.
- `@typescript/typescript-darwin-x64/lib/tsc` (`24.9 MB`): Compilador TypeScript embebido para construcción de extensiones in-app.
