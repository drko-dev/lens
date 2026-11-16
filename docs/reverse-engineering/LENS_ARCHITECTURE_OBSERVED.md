# Mirantis Lens 2026.11.91422-latest — Arquitectura Observable (Capa A & B)

- **Target**: `/Applications/Lens.app` (`CFBundleShortVersionString`: `2026.11.91422-latest`, `CFBundleIdentifier`: `com.electron.kontena-lens`)
- **Comparado contra**: NovaKube `6.5.3-dev` (`develop @ ed27e227` / docs `55089dee`)
- **Fecha**: 2026-11-16
- **Herramientas usadas**: `rea` (`inspect_electron_fuses`, `open_binary`, `inspect_plist`, `inspect_signature`, `inspect_artifact`, `analyze_javascript_application`, `list_electron_targets`), inspección ASAR de solo lectura, Playwright CDP (`:9224`), `ps`/`lsof`.

---

## 1. Hallazgos de Capa A — Bundle macOS, Fuses y Firma

| ID | Aspecto | Resultado Observado | Técnica / Evidencia | Confianza |
|---|---|---|---|---|
| `RE-ARCH-01` | Versión & Bundle | `Lens` `2026.11.91422-latest`, `LSMinimumSystemVersion: 13.0`, URL scheme `lens://` | `rea.inspect_plist` (`ev_3b1b7f21ee10c1d7c0c1148ee89c72aa2acc3306ebb1fbdb02a7c92828881ecb`) | `CONFIRMED` |
| `RE-ARCH-02` | Runtime Electron / Node | Electron `45.2.3` (`arm64`), Chromium `156.0.8078.80`, V8 `15.6.75.27`, Node `24.22.2` | `Electron Framework` `Info.plist` + CDP `/json/version` (`:9224`) | `CONFIRMED` |
| `RE-ARCH-03` | Firma & Entitlements | `Developer ID Application: Kontena Oy (JJ22T2W355)`, `hardened_runtime: true`, `com.apple.security.cs.allow-jit: true` | `rea.inspect_signature` (`ev_dedb14cf32991cf0ef0057f90651c3077df67b7526e348f84973e27c5c1069c5`) | `CONFIRMED` |
| `RE-ARCH-04` | Electron Fuses | `RunAsNode: enabled`, `EnableNodeOptionsEnvironmentVariable: enabled`, `EnableNodeCliInspectArguments: enabled`, `EnableEmbeddedAsarIntegrityValidation: disabled`, `OnlyLoadAppFromAsar: disabled` | `rea.inspect_electron_fuses` (`ev_8f0bf42c91ce1af68f0850eec7fe19c923f544b391d20d140ff9e91fb623acd7`) | `CONFIRMED` |
| `RE-ARCH-05` | Inventario `app.asar` | `18,307` nodos, `21,970` ocurrencias (`16,889` files, `5,081` dirs); `69` archivos fuera de `node_modules` (`main.js` 18 MB, `lens.js` 31.4 MB) | `rea.inspect_artifact` (`ev_a9535b14c25ac02873e17aca4a92ec906be42fd25b86218b84ec448f844cb967`) + header ASAR | `CONFIRMED` |
| `RE-ARCH-06` | Limitación REA AST | `analyze_javascript_application` sobre `static/build/main.js` (18 MB) agotó el heap de 2 GB del worker AST (`semantic_graph.coverage: partial`); mitigado con análisis de entrypoints chicos + inspección estructural | `rea.analyze_javascript_application` (`ev_a53b49b12f6d33ed0b7eafd4a9c6e8f264fe0d0b8f77e4518a04fc6be8e7d9e5`) | `CONFIRMED` |
| `RE-ARCH-07` | Arranque rápido (V8 Code Cache) | `static/start-window.js` solicita por `ipcRenderer.sendSync("lens:window-bundle")` la ruta en disco de `lens.js` y un directorio de V8 code cache, ejecutando vía `static/run-with-code-cache.js` | Lectura de `static/start-window.js` dentro de `app.asar` | `CONFIRMED` |
| `RE-ARCH-08` | Binarios embebidos | `bundledHelmVersion: 3.20.2`, `bundledKubectlVersion: 1.27.16`, `k8sProxyVersion: 0.4.0`, `node-pty: 1.1.0-beta34` | `package.json` en `app.asar` + `Resources/arm64/lens-k8s-proxy` | `CONFIRMED` |

---

## 2. Hallazgos de Capa B — Procesos, Ventanas, Renderers y Eliminación de `<iframe>`

| ID | Aspecto | Lens Oficial `2026.11.91422-latest` | NovaKube `6.5.3-dev` | Confianza |
|---|---|---|---|---|
| `RE-ARCH-09` | Arquitectura de Cluster View | **0 `<iframe>`**, **0 `BrowserView`**, **0 `WebContentsView`**. Todo el clúster se monta dentro del único renderer principal (`@lensapp/main-view` + `@lensapp/root-layout`). | Cada clúster monta `<iframe id="cluster-frame-${cluster.id}">` dentro de `#lens-views` (`ClusterFrameHandler`). | `CONFIRMED` |
| `RE-ARCH-10` | `BrowserWindow` & Seguridad | `nodeIntegration: true`, `contextIsolation: false`, `titleBarStyle: "hidden"`, `minWidth: 700, minHeight: 500`. | Igual (`create-electron-window.injectable.ts`), más ventanas `detached-tool`/`secure-pilot` con `sandbox: true`, `contextIsolation: true`. | `CONFIRMED` |
| `RE-ARCH-11` | Subventanas (`Tabs in windows`) | Soporta `sub-window.html` + canales `spawn-sub-window`, `raise-sub-window`, `dismiss-sub-window`, `retitle-sub-window`, `rename-sub-window`, `sub-window-descriptor`, `open-sub-windows`. | Tiene `detached-tool` y `floating-panels`/`global-docking` para paneles de Dock/Workloads, pero **no** unificada la arquitectura de `sub-window.html` para arrastrar cualquier Workspace Tab fuera de la ventana. | `CONFIRMED` |
| `RE-ARCH-12` | Lock de instancia única | `app-paths-setup-main:setup-app-paths` lee `CICD`; `enforce-single-application-instance` cierra segunda instancia si comparte `userData`. | Idéntico. | `CONFIRMED` |
| `RE-ARCH-13` | Red interna & Proxy | Utility `NetworkService` con `--host-resolver-rules=MAP localhost 127.0.0.1,MAP lens.app 127.0.0.1,MAP *.lens.app 127.0.0.1` + proceso `lens-k8s-proxy`. | Idéntico. | `CONFIRMED` |
| `RE-ARCH-14` | Limitación `rea.list_electron_targets` | `rea.list_electron_targets` solo enumera páginas `file://` (`splash.html`); excluyó `https://lens.app:<port>/` como `unsupported_url`. | Complementado con Playwright CDP directo sobre `:9224`. | `CONFIRMED` |
