# OpenLens DevOps Revival — R7-07 Validation

| Campo | Valor |
|---|---|
| Estado | **Cierre técnico de R7-07; checkpoint local d199c38, sin push; R7 no está certificada** |
| Rama / base | feat/r7-07-helm-intelligence / 86d5662c7caa63b2b5de7539a1321aa261ed0fdb |
| Worktree | /Users/gustavomarcon/Documents/lens/lens-r7-07-helm |
| Fecha | 2026-10-24 |
| Runtime de validación | Node 20.20.2 |

## Gates de R7-07

### Jest dirigido

**10 suites / 97 tests PASS** (sin snapshots). Comando reproducible:

    cd packages/core
    ../../node_modules/.bin/jest --runInBand \
      src/main/utils/__tests__/parse-query.test.ts \
      src/main/helm/__tests__/get-helm-release-values.test.ts \
      src/main/helm/__tests__/get-helm-chart-schema.test.ts \
      src/main/routes/helm/releases/__tests__/get-release-values-route.test.ts \
      src/renderer/components/helm-releases

| Suite | Tests |
|---|---:|
| main/utils/__tests__/parse-query.test.ts | 6 |
| main/helm/__tests__/get-helm-release-values.test.ts | 5 |
| main/helm/__tests__/get-helm-chart-schema.test.ts | 21 |
| main/routes/helm/releases/__tests__/get-release-values-route.test.ts | 2 |
| renderer/.../revision-history-model.test.ts | 14 |
| renderer/.../revision-history.test.tsx | 8 |
| renderer/.../values-diff-model.test.ts | 13 |
| renderer/.../values-diff.test.tsx | 9 |
| renderer/.../schema-validator.test.ts | 10 |
| renderer/.../values-schema-validation.test.tsx | 9 |
| **Total** | **97 PASS** |

### TypeScript y ESLint

- packages/core: ../../node_modules/.bin/tsc --noEmit -p tsconfig.json — PASS, 0 errores.
- ESLint dirigido estricto para los módulos R7-07 — PASS, 0 errores y 0 warnings (--max-warnings 0).

### Playwright

node docs/revival/scripts/verify-r7-07-playwright.cjs — PASS como **harness sintético**, no E2E Electron. Usa el ValuesDiff real; Monaco, DI y algunos elementos visuales están simulados. Verifica que el contenido esté oculto por defecto y vuelva a ocultarse al cambiar el modo. No inicia la aplicación empaquetada ni conecta a un clúster.

### Regresión global y comparación contra la base

Se ejecutó el mismo Jest en dos worktrees limpios del mismo commit, con Node 20 y --ci --runInBand src (sin actualizar snapshots):

    cd packages/core
    ../../node_modules/.bin/jest --ci --runInBand src

| Resultado | Base 86d5662 | R7-07 actual |
|---|---:|---:|
| Suites total / aprobadas / fallidas | 358 / 289 / 69 | 368 / 299 / 69 |
| Tests aprobados / fallidos / omitidos | 3.415 / 318 / 9 | 3.512 / 318 / 9 |
| Snapshots aprobados / fallidos | 74 / 316 | 74 / 316 |
| Suites con snapshot fallido | 68 | 68 |

La comparación de identidades (ruta relativa, nombre completo del test) arroja **318 fallos en común, 0 nuevos y 0 corregidos**. R7-07 aporta 10 suites y 97 tests adicionales, todos aprobados. Esto demuestra que no se agregó una identidad de fallo global, pero no convierte en sanos los tests que ya fallaban en la base ni certifica los flujos reales.

### Clasificación y revisión de snapshots

Los 316 snapshots fallidos reaparecen en la base exacta y se enumeran por suite en el inventario inferior. No se ejecutó -u ni se actualizó ningún snapshot en masa.

Tras normalizar las rutas de worktree, 307 mensajes de diff de snapshot son iguales a la base; uno conserva el mismo diff y difiere solo en frames de scheduling. Ocho diffs de las suites Helm (showing-details-for-helm-release, 6; upgrade-chart-new-tab, 2) tienen salida renderizada adicional en las vistas modificadas por R7-07. Esos casos también muestran el toast preexistente del fixture “Can not load Pods. Error: Failed to load /api/v1/pods”. Se dejan sin actualizar: aceptar snapshots contaminados por ese error ocultaría el contrato visual real. Deben revisarse selectivamente después de corregir el fixture/API mock; no se clasifican como regresión funcional probada ni como snapshot correcto.

Hay además dos assertions funcionales no-snapshot fallidas, idénticas en ambos worktrees:
- features/cluster/workloads/pods.test.tsx: el caso que espera spinner recibe un fallo al cargar /api/v1/pods; el fixture no mantiene esa llamada en estado pendiente. Es deuda de prueba/infraestructura del test; no demuestra que la ruta de runtime esté correcta.
- features/welcome/banners-from-extension.test.tsx: assertion busca el test ID antiguo no-welcome-banners-icon, mientras que la implementación de la base ya usa openlens-devops-brand-icon. Es una expectativa de test obsoleta.

Por lo tanto, la clasificación es **deuda heredada reproducida**, con ocho snapshots visuales de Helm que además requieren actualización deliberada tras aislar el fallo del fixture. No se afirma que cada fallo global sea inocuo ni que todos los criterios funcionales R7-01 a R7-06 estén certificados.

## Cobertura funcional dirigida

| Caso | Evidencia |
|---|---|
| Historial vacío, error/403 y orden de revisiones | tests de revision-history-model y revision-history |
| A/B, aislamiento de cluster/namespace/release y respuesta tardía | tests de values-diff-model |
| Ocultar por defecto, revelar explícito y limpiar al cerrar/cambiar contexto | tests de values-diff y harness Playwright sintético |
| Revisión positiva estricta, inválida y argumentos --revision | parser, servicio y ruta de values |
| Draft-07 con keywords adversariales; schema boolean, refs; nunca éxito con keyword/ref no soportados | schema-validator y UI de validación |
| Schema ausente, inválido, symlink, límites, flags y limpieza de temporal | get-helm-chart-schema |
| Mensajes de Helm | pruebas de redacción de URL autenticada, bearer y nombres de credenciales habituales |

## Límites y riesgos abiertos

- El empaquetado Electron y Playwright en la app real no se ejecutaron.
- No hubo integración real de helm pull, repositorio remoto/offline ni clúster Kubernetes. Las condiciones de archivo y CLI se verificaron con pruebas de unidad.
- No se probó Helm 3.11 empaquetado; el binario local es Helm v4 y no equivale al del producto.
- helm pull --untar puede consumir disco antes de aplicar el límite del schema (2 MiB), de entradas (5.000) y profundidad (64); no hay límite de extracción total ni timeout. **Bloqueante de seguridad para certificación global**.
- Ajv usa RegExp de JavaScript para pattern sin timeout; el tamaño de Values no se limita en el renderer. No se mitiga ReDoS o payloads grandes.
- La redacción de salida CLI es heurística. El diff nuevo permanece oculto hasta acción explícita, pero el editor de upgrade existente sigue mostrando el YAML en claro.
- El origen del chart puede no ser inequívoco al derivar repo/chart/version del release instalado; los errores se degradan a schema no disponible.
- Riesgos heredados de R4-09 (incluido lens-k8s-proxy sin mTLS y el aislamiento de renderer diferido) no se tocaron ni se consideran resueltos.
- No se ejecutaron build completo, inspección visual de temas/resoluciones, ni pruebas de compatibilidad de app empaquetada.

## Checkpoint e integración

El checkpoint selectivo local de R7-07 es d199c38 (sin push); este reporte registra sus gates y límites. El worktree de R7-08 permanece sin consolidar (cambios sin commit sobre la misma base), por lo que la integración R7-09 **no está habilitada**. No se creó ni modificó un worktree de integración, no se empaquetó R7-RC y no se tocaron los binarios R5-09/R6-RC.

## Inventario exhaustivo de suites con snapshots fallidos

El inventario proviene de los resultados JSON de Jest para la base y el worktree R7-07. Cada suite listada falló igual en ambos; los ocho diffs Helm descritos arriba son las excepciones de contenido revisadas. Los nombres son relativos a packages/core.

| Suite | Snapshots fallidos |
|---|---:|
| src/features/add-cluster/navigation-using-application-menu.test.tsx | 2 |
| src/features/application-update/child-features/application-update-using-application-menu/application-update-using-application-menu.test.ts | 1 |
| src/features/application-update/child-features/application-update-using-top-bar/installing-update-using-topbar-button.test.tsx | 2 |
| src/features/application-update/child-features/application-update-using-tray/installing-update-using-tray.test.ts | 6 |
| src/features/application-update/child-features/force-update/force-update.test.ts | 3 |
| src/features/application-update/child-features/periodical-checking-of-updates/periodical-checking-of-updates.test.ts | 1 |
| src/features/application-update/child-features/selection-of-update-stability/selection-of-update-stability.test.ts | 1 |
| src/features/application-update/hiding-preference-when-disabled.test.ts | 2 |
| src/features/application-update/installing-update.test.ts | 9 |
| src/features/catalog/custom-columns.test.tsx | 8 |
| src/features/catalog/entity-running.test.tsx | 2 |
| src/features/catalog/opening-entity-details.test.tsx | 9 |
| src/features/cluster/delete-dialog/delete-cluster-dialog.test.tsx | 5 |
| src/features/cluster/extension-api/disable-cluster-pages-when-cluster-is-not-relevant.test.tsx | 3 |
| src/features/cluster/extension-api/disable-sidebar-items-when-cluster-is-not-relevant.test.tsx | 3 |
| src/features/cluster/kube-object-details/extension-api/disable-kube-object-detail-items-when-cluster-is-not-relevant.test.tsx | 3 |
| src/features/cluster/kube-object-details/extension-api/reactively-hide-kube-object-detail-item.test.tsx | 2 |
| src/features/cluster/kube-object-menu/extension-api/disable-kube-object-menu-items-when-cluster-is-not-relevant.test.tsx | 3 |
| src/features/cluster/kube-object-status-icon/extension-api/disable-kube-object-statuses-when-cluster-is-not-relevant.test.tsx | 3 |
| src/features/cluster/kube-object-status-icon/show-status-for-a-kube-object.test.tsx | 6 |
| src/features/cluster/legacy-extension-adding-cluster-frame-components.test.tsx | 1 |
| src/features/cluster/namespaces/edit-namespace-from-new-tab.test.tsx | 16 |
| src/features/cluster/namespaces/edit-namespace-from-previously-opened-tab.test.tsx | 2 |
| src/features/cluster/order-of-sidebar-items.test.tsx | 2 |
| src/features/cluster/sidebar-and-tab-navigation-for-core.test.tsx | 7 |
| src/features/cluster/sidebar-and-tab-navigation-for-extensions.test.tsx | 9 |
| src/features/cluster/visibility-of-sidebar-items.test.tsx | 2 |
| src/features/cluster/workload-overview.test.tsx | 1 |
| src/features/cluster/workloads/overview/extension-api/disable-workloads-overview-details-when-cluster-is-not-relevant.test.tsx | 3 |
| src/features/cluster/workloads/pods.test.tsx | 3 |
| src/features/command-pallet/keyboard-shortcuts.test.tsx | 8 |
| src/features/custom-resources/view-with-extra-columns.test.ts | 1 |
| src/features/entity-settings/showing-settings-for-correct-entity.test.tsx | 4 |
| src/features/extension-special-characters-in-page-registrations.test.tsx | 2 |
| src/features/extensions/navigation-using-application-menu.test.ts | 2 |
| src/features/helm-charts/add-custom-helm-repository-in-preferences.test.ts | 12 |
| src/features/helm-charts/add-helm-repository-from-list-in-preferences.test.ts | 10 |
| src/features/helm-charts/installing-chart/installing-helm-chart-from-new-tab.test.ts | 21 |
| src/features/helm-charts/installing-chart/installing-helm-chart-from-previously-opened-tab.test.ts | 2 |
| src/features/helm-charts/installing-chart/opening-dock-tab-for-installing-helm-chart.test.ts | 9 |
| src/features/helm-charts/listing-active-helm-repositories-in-preferences.test.ts | 10 |
| src/features/helm-charts/remove-helm-repository-from-list-of-active-repository-in-preferences.test.ts | 4 |
| src/features/helm-charts/upgrade-chart/upgrade-chart-new-tab.test.ts | 7 |
| src/features/helm-releases/showing-details-for-helm-release.test.ts | 18 |
| src/features/hotbar/hovering-hotbar-menu.test.ts | 2 |
| src/features/namespaces/route-with-sub-namespaces.test.tsx | 3 |
| src/features/navigate-to-extension-page.test.tsx | 5 |
| src/features/navigating-between-routes.test.tsx | 2 |
| src/features/pod-logs/download-logs.test.tsx | 2 |
| src/features/preferences/closing-preferences.test.tsx | 8 |
| src/features/preferences/extension-adding-preference-tabs.test.tsx | 1 |
| src/features/preferences/hiding-of-empty-branches.test.tsx | 3 |
| src/features/preferences/navigation-to-application-preferences.test.tsx | 5 |
| src/features/preferences/navigation-to-editor-preferences.test.ts | 2 |
| src/features/preferences/navigation-to-extension-specific-preferences.test.tsx | 9 |
| src/features/preferences/navigation-to-kubernetes-preferences.test.ts | 2 |
| src/features/preferences/navigation-to-proxy-preferences.test.ts | 2 |
| src/features/preferences/navigation-to-telemetry-preferences.test.tsx | 5 |
| src/features/preferences/navigation-to-terminal-preferences.test.ts | 2 |
| src/features/preferences/navigation-using-application-menu.test.ts | 2 |
| src/features/preferences/navigation-using-tray.test.ts | 2 |
| src/features/preferences/urls-of-legacy-extensions.test.tsx | 5 |
| src/features/status-bar/status-bar-items-originating-from-extensions.test.tsx | 1 |
| src/features/top-bar/extension-api/extendability-using-extension-api.test.tsx | 4 |
| src/features/welcome/navigation-using-application-menu.test.ts | 3 |
| src/renderer/components/config-horizontal-pod-autoscalers/details.test.tsx | 2 |
| src/renderer/components/status-bar/status-bar.test.tsx | 11 |
| src/renderer/frames/cluster-frame/cluster-frame.test.tsx | 3 |
| **Total: 68 suites** | **316** |
