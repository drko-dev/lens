# R1-03 — Conflictos y protección de guardado inline para Secrets y ConfigMaps
**Fecha:** 2026-10-19  
**Rama:** `feat/openlens-devops-revival`  
**Base:** `8838ac308bf4cc70a9911f7cdbc28e919f83fb2a` (working tree con cambios no confirmados)  
**Estado:** **código, unit tests, typecheck, build del monorepo, empaquetado ARM64 y smoke GUI aislado aprobados**. Integración en vivo contra API server Kubernetes **pendiente de validación integral en R1-06**.

## Cambios implementados
1. **Helper compartido de concurrencia, redacción y verificación inline (`packages/core/src/renderer/components/kube-object-details/inline-resource-save-helper.ts`):**
   - Normalización de datos de `Secret` (`data` base64 + conversión de `stringData` a `data` en base64) y `ConfigMap` (`data` clave-valor).
   - Detección de claves modificadas (`getChangedKeys`, `hasUnsavedKeyChanges`) y comparación por clave entre base cargada, versión remota y borrador del operador (`describeKeyValueConflict`).
   - Fusión controlada sobre la versión remota (`mergeDraftKeysOntoRemote`) para re-aplicar exclusivamente las claves editadas por el usuario cuando este lo solicita explícitamente.
   - Clasificación de errores HTTP (`isSaveConflictError` para `409 Conflict`, `isForbiddenError` para `403`, `isNotFoundError` para `404`) y verificación posterior al guardado (`findUnpersistedKeys`).
   - Redacción estricta de secretos (`redactSecretValues`): reemplaza cualquier valor de secreto en texto plano o decodificado desde base64 (`>= 3` caracteres) por `[REDACTED]` antes de mostrar notificaciones o registrar errores.
2. **Panel de detalle de Secrets (`packages/core/src/renderer/components/config-secrets/secret-details.tsx` y `secret-details.scss`):**
   - Registra `baseUid`, `baseResourceVersion` y `baseData` de la versión cargada.
   - Protege el borrador local (`this.data`) y el estado de visibilidad (`this.revealSecret`) frente a actualizaciones reactivas de MobX (`autorun`) mientras existan cambios sin guardar para el mismo `uid`.
   - Envía `metadata.resourceVersion = this.baseResourceVersion` (y `uid`) en `secretStore.update`, limpia `stringData` tras normalizar, y verifica mediante `secretStore.api.get` que las claves guardadas coincidan con el estado persistido.
   - Ante un error `409 Conflict`, conserva el borrador, consulta la última versión del clúster o del store, y presenta un banner de conflicto (`data-testid="secret-conflict-notice"`) que muestra **únicamente nombres de claves** (`keys changed locally`, `keys changed in cluster`, `conflicting keys`) sin exponer jamás valores secretos ni base64, ofreciendo dos acciones explícitas:
     - `Reload cluster version` (`data-testid="reload-remote-secret"`).
     - `Re-apply my changes on cluster version` (`data-testid="reapply-changes-secret"`).
   - Maneja explícitamente errores `403 Forbidden`, `404 Not Found` (recurso eliminado remotamente), errores de red/API redactados y fallos de lectura posterior al guardado sin perder el borrador del usuario.
3. **Panel de detalle de ConfigMaps (`packages/core/src/renderer/components/config-maps/config-map-details.tsx` y `config-map-details.scss`):**
   - Incorpora el mismo control optimista por `baseResourceVersion` y `baseUid`, protección de borrador local ante `autorun` de MobX, verificación posterior con `configMapStore.api.get`, y banner de resolución de conflictos `409` (`data-testid="config-map-conflict-notice"`) con botones explícitos de recarga (`data-testid="reload-remote-config-map"`) y re-aplicación (`data-testid="reapply-changes-config-map"`).
4. **Pruebas unitarias y de regresión:**
   - `packages/core/src/renderer/components/config-secrets/__tests__/secret-details.test.tsx` (6 pruebas): bloqueo de sobrescritura por MobX con borrador sucio, detección de 409 sin exponer valores secretos + recarga/re-aplicación explícita, redacción de valores secretos en errores 403/genéricos, normalización de `stringData` a `data`, detección de discrepancia o fallo de lectura post-save y manejo de `404 Not Found`.
   - `packages/core/src/renderer/components/config-maps/__tests__/config-map-details.test.tsx` (3 pruebas): protección de borrador frente a actualización reactiva del store, resolución explícita de conflicto 409 (recarga y re-aplicación sobre nuevo `resourceVersion`) y conservación del borrador ante errores 403/404.

## Pruebas y validación ejecutadas
- **Jest (`secret-details.test.tsx`, `config-map-details.test.tsx`, `save.test.tsx`):** **3 suites / 29 pruebas aprobadas** bajo Node `v20.20.2`.
- **Typecheck (`npx tsc -p packages/core/tsconfig.json --noEmit`):** **exit 0**.
- **Build del monorepo (`npm run build`):** **exit 0** (40 proyectos compilados con Node `v20.20.2`; log en `/tmp/openlens-r1-03-build.log`).
- **Empaquetado macOS ARM64 (`npm --workspace open-lens run build:app -- --mac dir --arm64 -c.directories.output=dist-stage`):** **exit 0** sin firma ni publicación, preservando intacta la instancia abierta por el usuario en `open-lens/dist`; log en `/tmp/openlens-r1-03-package.log`.
- **Smoke GUI con Playwright (`node docs/revival/scripts/smoke-r1-01.cjs`):** **exit 0** contra `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps` con `HOME` y `CICD` aislados (`/tmp/openlens-r1-01-safe-jFC5RB`) y `KUBECONFIG=/dev/null`. Verificados:
  - `RUNTIME={"name":"OpenLens DevOps","isPackaged":true,"userData":"/tmp/openlens-r1-01-safe-jFC5RB/appdata/OpenLens DevOps"}`
  - `WELCOME_OK=true`
  - `CATALOG_ITEM_COUNT=0` y `REAL_KUBECONFIG_REFERENCES_VISIBLE=false`
  - `PREFERENCES_VISIBLE=true` y `APP_CLOSED=true`

## Binario y evidencias
- Aplicación generada: `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`
- `Contents/Resources/app.asar` SHA-256: `9c63f855df012d604e0b8093443ef4f88232a88d276282d9e0087aa2adb44d2d`
- Capturas de pantalla:
  - `docs/revival/evidence/R1_03_EMPTY_CATALOG.png`
  - `docs/revival/evidence/R1_03_PREFERENCES.png`

## Limitaciones pendientes para R1-06
- La validación con un servidor de API Kubernetes simulado/local para comprobar el flujo extremo a extremo de conflictos `PUT` sobre `Secret` y `ConfigMap` se ejecutará dentro del hito de integración **R1-06**.
