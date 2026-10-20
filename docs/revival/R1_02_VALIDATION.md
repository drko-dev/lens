# R1-02 — Precondiciones de concurrencia para recursos JSON Patch
**Fecha:** 2026-10-19  
**Rama:** `feat/openlens-devops-revival`  
**Base:** `8838ac308bf4cc70a9911f7cdbc28e919f83fb2a` (working tree con cambios no confirmados)  
**Estado:** **código, unit tests, typecheck, build y smoke GUI offline aprobados**. Integración real con API server Kubernetes **pendiente de laboratorio**.

## Cambios implementados
1. `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/edit-resource-model.injectable.tsx`: la rama de JSON Patch envía antes de los cambios del usuario `test /metadata/resourceVersion` usando la versión **originalmente cargada**; cuando hay `uid`, también `test /metadata/uid`. No confía en un `resourceVersion` escrito en el YAML. Rechaza la edición sin resourceVersion conocido.
2. El PATCH conserva su carácter mínimo; usa `getUserChanges()`, que omite modificaciones de campos administrados por el servidor. El GET posterior se mantiene como validación **adicional**, no como garantía de concurrencia.
3. El destino de guardado se resuelve desde el recurso original, evitando que una edición manual de `metadata.selfLink` redirija el PATCH.
4. `request-patch-kube-resource.injectable.ts`: los errores incluyen `isConflict` al recibir 409 o ciertos errores 422 explícitos de fallo de operación `test`. Otros 422 y 403 no son tratados como conflictos.
5. Se amplió `save.test.tsx` para verificar operaciones de precondición, UID, metadata alterada manualmente, rechazo por conflicto y borrador conservado, falta de resourceVersion y clasificación de errores HTTP.

## Pruebas
- `save.test.tsx`: **20 pruebas aprobadas**.
- `save.lab-integration.test.tsx`: **3 pruebas omitidas**; precisan clúster local y NO se consideran aprobadas.
- TypeScript `tsc -p packages/core/tsconfig.json --noEmit`: **exit 0**.
- Monorepo `npm run build`: **exit 0**, 40 proyectos; Node 20.20.2; log `/tmp/openlens-r1-02-build.log`.
- Empaquetado `npm run build:app -- --mac dir --arm64`: **exit 0**, Electron 22.3.3 macOS arm64, sin publicación ni firma; log `/tmp/openlens-r1-02-package.log`.
- UI Playwright del **binario empaquetado** ejecutada con HOME/CICD aislados y KUBECONFIG=/dev/null; **exit 0**. Comprobados Welcome, catálogo de **0** clústeres, ausencia de rutas kubeconfig reales, navegación al menú Preferencias y cierre de la app. Log `/tmp/openlens-r1-02-smoke.log`. La GUI no pudo probar la edición de recursos sin un clúster simulado o de laboratorio.

## Binario y evidencias
- Build actual: `open-lens/dist/mac-arm64/OpenLens DevOps.app` (**765 MiB**).
- `Contents/Resources/app.asar` SHA-256: `e64ceac2213e1699c86544ede2006c99cf5425ee5b1a511752ae9f4a8fd6c62a`.
- Build anterior R1-01 preservada como `open-lens/dist.r1-01-baseline/mac-arm64/OpenLens DevOps.app` (ASAR SHA-256 `23e49ab4dc450b5cb409b5feb53f384a3746f94a7279d824efb0138cca5aedff`).
- Captura: `docs/revival/evidence/R1_02_EMPTY_CATALOG.png`; smoke reproducible `docs/revival/scripts/smoke-r1-01.cjs`.

## Incógnitas antes de considerar seguro el comportamiento sobre Kubernetes
- El API server debe validar que el test de `resourceVersion` falle **sin aplicar ninguna operación posterior**, tanto para Deployment como StatefulSet y un CRD; confirmar respuesta HTTP 409/422 real.
- Cobertura de `metadata.uid` en recursos borrados/recreados entre GET y PATCH.
- Confirmar UX del conflicto contra un recurso externo concurrente, permisos RBAC y mutación por controladores/webhooks.
- En un entorno sin clúster conectado, el smoke sólo cubre arranque/GUI, **no la operación YAML**.
- No se corrió ningún test contra producción ni se contactó a clústeres reales.

## Criterio de avance
El código de R1-02 está **verificado en pruebas unitarias y binario GUI offline**. Las pruebas de integración real quedan explícitamente para R1-06 sobre un laboratorio autorizado, antes de proclamar cerrada la seguridad de R1. Por indicación del usuario, se puede continuar con R1-03 sin solicitud rutinaria de autorización.
