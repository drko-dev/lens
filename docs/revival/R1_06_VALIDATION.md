# OpenLens DevOps Revival — Validación Integral Hito R1-06 (Cierre de Release 1)

**Fecha:** 2026-10-19
**Rama:** `feat/openlens-devops-revival`
**Hito:** `R1-06` — Validación integral en laboratorio local, regresión completa, empaquetado final y criterios de salida de Release 1

---

## 1. Resumen Ejecutivo

- **Estado general de `R1-06` y de `Release 1` (`R1-00` a `R1-06`):** **APROBADO**.
- **Alcance validado de extremo a extremo:**
  1. **Integración contra servidor HTTP Kubernetes de laboratorio local (`127.0.0.1`):**
     - Se actualizó y habilitó por defecto [`save.lab-integration.test.tsx`](../../packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/save.lab-integration.test.tsx) con un servidor HTTP Kubernetes local embebido en `127.0.0.1:0` (además de soportar `OPENLENS_LAB_API` externo para `kind`/`k3d`/`minikube`).
     - **JSON Patch atómico (`application/json-patch+json`) con precondiciones `test` (`resourceVersion` + `uid`)** sobre `Deployment`, `StatefulSet` y `CustomResource` (`widgets.devops.openlens.dev`):
       - Rechazo atómico con HTTP `409 Conflict` cuando un segundo operador intenta guardar con `resourceVersion` obsoleto tras un cambio concurrente.
       - Verificación de cero mutaciones parciales en el servidor, conservación íntegra del borrador local (`editing.draft`), detección de rutas modificadas (`remoteChangedPaths: ["/spec/replicas"]`) y éxito tras `rebaseOnClusterVersion()` explícito.
     - **Reemplazo `PUT` protegido con `resourceVersion` en `ConfigMap` y `Secret`:**
       - Verificación posterior por `GET`, ausencia de etiquetas artificiales (`EditResourceLabelName`), conversión `stringData` → `data` base64 en `Secret`, rechazo `409 Conflict` ante modificaciones concurrentes y recuperación mediante rebase explícito.
     - **Fidelidad de `kubeconfig` e integración HTTP:**
       - Round-trip completo (`loadConfigFromString` → `splitConfig` → `dumpConfigYaml` → `loadValidatedConfig`) preservando `tls-server-name`, `proxy-url`, `disable-compression`, `token-file` y `exec`, seguido de consulta HTTP real contra el endpoint del clúster de laboratorio.
     - **Watches (`BOOKMARK` y `410 Gone`) sobre HTTP:**
       - Transmisión de eventos `ADDED` y `BOOKMARK` (`allowWatchBookmarks=true`, sin `metadata.name` ni `metadata.namespace`) y respuesta `ERROR` con código `410 Gone` (`expired-rv-410`).
  2. **Suite completa de regresión de Release 1 (`11 suites / 127 tests`):**
     - Todas las suites de `R1-01` a `R1-06` aprobaron sin fallos ni tests omitidos (`11 passed, 127 passed`).
  3. **Empaquetado final macOS ARM64 y validación GUI con Playwright:**
     - Binario generado en `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app` (`app.asar` SHA-256: `f703de5008c8ab9c7a2c9675e8084c3e14441d51f41d070a89c9f73d277176c1`), preservando intacta la instancia abierta por el usuario en `open-lens/dist` (PID `80825`).
     - Smoke GUI automatizado aprobado con perfil aislado (`WELCOME_OK=true`, `CATALOG_OK=true`, `PREFERENCES_VISIBLE=true`, `APP_CLOSED=true`).

---

## 2. Matriz Consolidada de Pruebas de Regresión e Integración (R1)

Comando ejecutado:
```bash
export PATH="/Users/gustavomarcon/.nvm/versions/node/v20.20.2/bin:$PATH"
npm --workspace @openlens/core exec jest -- \
  packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/save.test.tsx \
  packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/save.lab-integration.test.tsx \
  packages/core/src/renderer/components/config-secrets/__tests__/secret-details.test.tsx \
  packages/core/src/renderer/components/config-maps/__tests__/config-map-details.test.tsx \
  packages/core/src/common/__tests__/kube-helpers.test.ts \
  packages/core/src/main/catalog-sources/__test__/kubeconfig-sync.test.ts \
  packages/core/src/main/routes/port-forward/functionality/port-forward.test.ts \
  packages/core/src/main/routes/port-forward/functionality/stop-port-forwards-on-quit.test.ts \
  packages/core/src/main/__test__/kube-auth-proxy.test.ts \
  packages/core/src/common/k8s-api/__tests__/kube-api.test.ts \
  packages/core/src/common/k8s-api/__tests__/kube-object.store.test.ts
```

| Suite | Hito | Estado | Casos verificados |
| :--- | :--- | :--- | :--- |
| `save.test.tsx` | R1-02 | **PASS** | JSON Patch con `test` (`resourceVersion` + `uid`), PUT de `Secret`/`ConfigMap`, 409/422, rebase explícito, redacción de secretos |
| `save.lab-integration.test.tsx` | R1-06 | **PASS** | Servidor HTTP K8s local (`127.0.0.1`): concurrencia real en `Deployment`, `StatefulSet`, `CRD`, `ConfigMap`, `Secret`, `kubeconfig` round-trip y watches `BOOKMARK`/`410 Gone` |
| `secret-details.test.tsx` | R1-03 | **PASS** | Conflicto 409 inline en `SecretDetails`, preservación de borrador ante MobX, diff sólo por nombres de clave sin exponer secretos, 403/404 y normalización `stringData` |
| `config-map-details.test.tsx` | R1-03 | **PASS** | Conflicto 409 inline en `ConfigMapDetails`, preservación de borrador local, recarga/re-aplicación explícita y manejo de errores 403/404 |
| `kube-helpers.test.ts` | R1-04 | **PASS** | Fidelidad de serialización (`tls-server-name`, `proxy-url`, `disable-compression`, `token-file`, `as*`, `exec` completo), aislamiento de entradas inválidas y redacción de secretos |
| `kubeconfig-sync.test.ts` | R1-04 | **PASS** | Sincronización de `kubeconfig`, aislamiento de contextos válidos frente a entradas corruptas y sanitización de logs |
| `port-forward.test.ts` | R1-05 | **PASS** | Bind a `127.0.0.1`, uso de `getKubectlBinPath(false)` por versión del clúster, captura de `stderr` en `lastError` y limpieza de registro activo |
| `stop-port-forwards-on-quit.test.ts` | R1-05 | **PASS** | Detención limpia de procesos `kubectl port-forward` al cerrar la aplicación |
| `kube-auth-proxy.test.ts` | R1-05 | **PASS** | Ciclo de vida de `lens-k8s-proxy` y límite de 3 reintentos de arranque (`maxStartupAttempts = 3`) sin recursión infinita |
| `kube-api.test.ts` | R1-05 | **PASS** | `PATCH` (`strategic`, `json`, `merge`), `allowWatchBookmarks=true` y avance de `resourceVersion` por namespace en eventos `BOOKMARK` |
| `kube-object.store.test.ts` | R1-05 | **PASS** | Carga por namespace, preservación de elementos en tabla ante fallos transitorios de recarga y backoff exponencial con jitter (`computeWatchRetryDelay`) |

- **Total Suites:** `11 passed, 11 total`
- **Total Tests:** `127 passed, 127 total` (`0 failed, 0 skipped`)
- **Typecheck (`npx tsc -p packages/core/tsconfig.json --noEmit`):** `0 errores`

---

## 3. Compilación, Empaquetado Final y Validación del Binario (`OpenLens DevOps.app`)

1. **Compilación completa (`npm run build`):**
   - Log: `/tmp/openlens-r1-06-build.log` (código de salida `0`).
2. **Empaquetado macOS ARM64 (`open-lens/dist-stage`):**
   - Comando: `npx electron-builder --projectDir open-lens --mac dir --arm64 --publish never -c.directories.output=dist-stage`
   - Log: `/tmp/openlens-r1-06-package.log` (código de salida `0`).
   - Binario ejecutable: `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps`
   - SHA-256 de `Contents/Resources/app.asar`: `f703de5008c8ab9c7a2c9675e8084c3e14441d51f41d070a89c9f73d277176c1`
3. **Prueba Real de Interfaz Gráfica con Playwright (`smoke-r1-01.cjs`):**
   - Log: `/tmp/openlens-r1-06-smoke.log`
   - Resultado:
     - `RUNTIME={"name":"OpenLens DevOps","isPackaged":true,"userData":"/tmp/openlens-r1-01-safe-BnZ50O/appdata/OpenLens DevOps"}`
     - `WELCOME_OK=true`
     - `CATALOG_ITEM_COUNT=0`
     - `REAL_KUBECONFIG_REFERENCES_VISIBLE=false`
     - `CATALOG_OK=true`
     - `PREFERENCES_VISIBLE=true`
     - `APP_CLOSED=true`
   - Capturas persistidas:
     - `docs/revival/R1_06_EMPTY_CATALOG.png`
     - `docs/revival/R1_06_PREFERENCES.png`

---

## 4. Estado de Puerta de Salida de Release 1 (`R1`)

| Hito | Descripción | Estado | Documento de Evidencia |
| :--- | :--- | :--- | :--- |
| **R1-00** | Preflight de entorno, espacio en disco, Git y baseline | **COMPLETADO** | [`R1_00_PREFLIGHT.md`](./R1_00_PREFLIGHT.md) |
| **R1-01** | Build reproducible macOS ARM64 y smoke GUI aislado | **COMPLETADO** | [`R1_01_VALIDATION.md`](./R1_01_VALIDATION.md) |
| **R1-02** | Concurrencia optimista JSON Patch (`test` `resourceVersion` + `uid`) | **COMPLETADO** | [`R1_02_VALIDATION.md`](./R1_02_VALIDATION.md) |
| **R1-03** | Conflictos inline en `Secret` y `ConfigMap` y redacción de secretos | **COMPLETADO** | [`R1_03_VALIDATION.md`](./R1_03_VALIDATION.md) |
| **R1-04** | Fidelidad de serialización `kubeconfig`, aislamiento y matriz `exec` | **COMPLETADO** | [`R1_04_VALIDATION.md`](./R1_04_VALIDATION.md) |
| **R1-05** | Conectividad base: `kubectl` SHA-256, proxy acotado, watches y port-forward | **COMPLETADO** | [`R1_05_VALIDATION.md`](./R1_05_VALIDATION.md) |
| **R1-06** | Integración contra servidor K8s de laboratorio local y cierre de R1 | **COMPLETADO** | [`R1_06_VALIDATION.md`](./R1_06_VALIDATION.md) |
