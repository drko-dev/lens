# OpenLens DevOps Revival — Validación Hito R1-05

**Fecha:** 2026-10-19
**Rama:** `feat/openlens-devops-revival`
**Hito:** `R1-05` — Conectividad base: `kubectl`, integridad SHA-256, proxy, watches y port-forward

---

## 1. Resumen Ejecutivo

- **Estado general del hito `R1-05`:** **APROBADO (unidad, tipos, compilación, empaquetado macOS ARM64 y ejecución real del binario en perfil aislado)**.
- **Mejoras implementadas:**
  1. **Resolución de `kubectl` por versión del clúster en Port-Forward:**
     - [`create-port-forward.injectable.ts`](../../packages/core/src/main/routes/port-forward/functionality/create-port-forward.injectable.ts): resuelve la instancia de `Kubectl` correspondiente a la versión del clúster (`getClusterByIdInjectable` + `createKubectlInjectable`), usando `bundledKubectlInjectable` únicamente como respaldo.
     - [`port-forward.ts`](../../packages/core/src/main/routes/port-forward/functionality/port-forward.ts): invoca `getKubectlBinPath(false)` en lugar de forzar `true` (binario empaquetado), captura mensajes de error de `stderr` y `error` en `lastError`, y limpia `PortForward.portForwards` cuando el inicio falla o expira.
  2. **Verificación de integridad SHA-256 y protección del binario empaquetado de `kubectl`:**
     - [`kubectl.ts`](../../packages/core/src/main/kubectl/kubectl.ts): incorpora `computeFileSha256`, `verifyBinaryIntegrity` y `fetchExpectedSha256` durante `downloadKubectl()`, registrando la procedencia y el digest SHA-256 en logs y eliminando únicamente binarios descargados gestionados (`unlinkIfManagedBinary`) sin borrar jamás el binario empaquetado.
  3. **Recuperación acotada de `KubeAuthProxy`:**
     - [`create-kube-auth-proxy.injectable.ts`](../../packages/core/src/main/kube-auth-proxy/create-kube-auth-proxy.injectable.ts): acota los reintentos de arranque en `run()` a `maxStartupAttempts = 3` cuando `waitUntilPortIsUsed` falla, evitando recursión infinita y notificando el error al usuario.
  4. **Estabilidad de Watches (`BOOKMARK`, `410 Gone`, Backoff Exponencial con Jitter y Preservación de Tablas):**
     - [`kube-watch-event.ts`](../../packages/core/src/common/k8s-api/kube-watch-event.ts), [`kube-api.ts`](../../packages/core/src/common/k8s-api/kube-api.ts) y [`kube-object.store.ts`](../../packages/core/src/common/k8s-api/kube-object.store.ts):
       - Soporte de eventos `BOOKMARK` y parámetro `allowWatchBookmarks=true` en `KubeObjectStore.watchNamespace()`.
       - Actualización del `resourceVersion` tanto del recurso como del `watchedNamespace` al recibir `BOOKMARK` (que en Kubernetes omite `metadata.name` y `metadata.namespace`), sin invocar `ensureMetadataSelfLink`.
       - Limpieza explícita de `watchdogTimer` y `timedRetry` en cierres, errores y `abort`.
       - Cálculo de backoff exponencial con jitter acotado (`computeWatchRetryDelay`).
       - Resincronización completa (`loadAll` + reinicio de watch) ante `410 Gone` tanto en `KubeStatus` como en `Response` HTTP 410.
       - Preservación de los elementos ya cargados en `KubeObjectStore.loadAll()` cuando una recarga posterior falla transitoriamente (`if (!this.isLoaded) this.resetOnError(error)`), evitando vaciar las tablas de la interfaz.

---

## 2. Archivos Modificados

- [`packages/core/src/main/routes/port-forward/functionality/port-forward.ts`](../../packages/core/src/main/routes/port-forward/functionality/port-forward.ts)
- [`packages/core/src/main/routes/port-forward/functionality/create-port-forward.injectable.ts`](../../packages/core/src/main/routes/port-forward/functionality/create-port-forward.injectable.ts)
- [`packages/core/src/main/kubectl/kubectl.ts`](../../packages/core/src/main/kubectl/kubectl.ts)
- [`packages/core/src/main/kube-auth-proxy/create-kube-auth-proxy.injectable.ts`](../../packages/core/src/main/kube-auth-proxy/create-kube-auth-proxy.injectable.ts)
- [`packages/core/src/common/k8s-api/kube-watch-event.ts`](../../packages/core/src/common/k8s-api/kube-watch-event.ts)
- [`packages/core/src/common/k8s-api/kube-api.ts`](../../packages/core/src/common/k8s-api/kube-api.ts)
- [`packages/core/src/common/k8s-api/kube-object.store.ts`](../../packages/core/src/common/k8s-api/kube-object.store.ts)
- [`packages/core/src/main/routes/port-forward/functionality/port-forward.test.ts`](../../packages/core/src/main/routes/port-forward/functionality/port-forward.test.ts)
- [`packages/core/src/main/__test__/kube-auth-proxy.test.ts`](../../packages/core/src/main/__test__/kube-auth-proxy.test.ts)
- [`packages/core/src/common/k8s-api/__tests__/kube-api.test.ts`](../../packages/core/src/common/k8s-api/__tests__/kube-api.test.ts)
- [`packages/core/src/common/k8s-api/__tests__/kube-object.store.test.ts`](../../packages/core/src/common/k8s-api/__tests__/kube-object.store.test.ts)

---

## 3. Evidencia de Pruebas Unitarias y Typecheck

### 3.1. Pruebas Unitarias (`Jest`)
Comando ejecutado:
```bash
export PATH="/Users/gustavomarcon/.nvm/versions/node/v20.20.2/bin:$PATH"
npm --workspace @openlens/core exec jest -- \
  packages/core/src/main/routes/port-forward/functionality/port-forward.test.ts \
  packages/core/src/main/__test__/kube-auth-proxy.test.ts \
  packages/core/src/common/k8s-api/__tests__/kube-api.test.ts \
  packages/core/src/common/k8s-api/__tests__/kube-object.store.test.ts
```
Resultado:
- **Test Suites:** `4 passed, 4 total`
- **Tests:** `61 passed, 61 total`
- **Tiempo:** `4.941 s`

### 3.2. Verificación de Tipos (`TypeScript`)
Comando ejecutado:
```bash
npx tsc -p packages/core/tsconfig.json --noEmit
```
Resultado: **Código de salida `0` (sin errores)**.

---

## 4. Compilación, Empaquetado y Prueba Real del Binario (`OpenLens DevOps.app`)

1. **Compilación del monorepo (`npm run build`):**
   - Log: `/tmp/openlens-r1-05-build.log` (código de salida `0`).
2. **Empaquetado macOS ARM64 (`open-lens/dist-stage`):**
   - Comando: `npx electron-builder --projectDir open-lens --mac dir --arm64 --publish never -c.directories.output=dist-stage`
   - Log: `/tmp/openlens-r1-05-package.log` (código de salida `0`, sin tocar la instancia abierta en `open-lens/dist` con PID `80825`).
   - Artefacto generado: `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`
   - SHA-256 de `Contents/Resources/app.asar`: `70dc619baca59932a4b5cff1ae30981b5b6a5bdc866d8cd8eac630d4dddd7587`
3. **Smoke Automatizado sobre el Binario Empaquetado (`Playwright`):**
   - Comando: `node docs/revival/scripts/smoke-r1-01.cjs`
   - Log: `/tmp/openlens-r1-05-smoke.log`
   - Resultado:
     - `RUNTIME={"name":"OpenLens DevOps","isPackaged":true,"userData":"/tmp/openlens-r1-01-safe-9eSaw0/appdata/OpenLens DevOps"}`
     - `WELCOME_OK=true`
     - `CATALOG_ITEM_COUNT=0`
     - `REAL_KUBECONFIG_REFERENCES_VISIBLE=false`
     - `CATALOG_OK=true`
     - `PREFERENCES_VISIBLE=true`
     - `APP_CLOSED=true`
   - Capturas persistidas:
     - `docs/revival/R1_05_EMPTY_CATALOG.png`
     - `docs/revival/R1_05_PREFERENCES.png`
