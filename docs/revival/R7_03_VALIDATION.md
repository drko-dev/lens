# OpenLens DevOps Revival — R7-03 Validación final

**Hito:** R7-03 — Control de Rollouts y Reversión de Cargas de Trabajo
**Fecha:** 2026-10-23
**Rama / base:** `feat/r7-devops-capabilities` / `11d47248774710b319912962ae780724c09031d6` (R7-02)
**Estado:** **Las validaciones específicas de R7-03 y E2E pasan. El gate global no está aprobado:** Jest completo de core y ESLint completo de core continúan fallidos. Se autorizó exclusivamente el checkpoint local de R7-03; no hay push ni certificación global.

## 1. TypeScript

| Paquete | Comando | Resultado |
|---|---|---|
| `packages/core` | `npx tsc --noEmit -p tsconfig.json` | PASS |
| `packages/kube-object` | `npx tsc --noEmit -p tsconfig.json` | PASS |

Se reconstruyó `@openlens/kube-object` antes de empaquetar para que Jest y la app usaran el modelo actual de `ControllerRevision`.

## 2. ESLint

- ESLint con `--max-warnings=0` sobre todos los archivos R7-03 modificados — core y kube-object —: **PASS, 0 errores / 0 warnings**.
- `npm run lint --workspace @openlens/kube-object -- --max-warnings=0`: **PASS**.
- `npm run lint --workspace @openlens/core -- --max-warnings=0`: **FAIL**, 298 errores y 14 warnings en el paquete core. Ninguno corresponde a los archivos R7-03 incluidos en la validación dirigida; el log completo es `docs/revival/logs/R7_03_FINAL_CORE_LINT_20261023.log`.

La validación dirigida del core incluye `controller-revision.api.ts`/`.injectable.ts`, `deployment.api.ts` y su test, exports, vistas de Deployment/DaemonSet/StatefulSet, `deployment-menu` y todo `workloads-deployments/rollout`; kube-object se validó con su lint de paquete completo.

Se eliminaron los 13 `no-non-null-assertion` de los fixtures R7-03. El lint global aún reporta 12 advertencias de esa regla en archivos no tocados por R7-03 y 2 `import/no-duplicates`; no se comprobó una ejecución global de ESLint en R7-02 y no se etiquetan como preexistentes.

## 3. Jest — alcance R7-03

```bash
cd packages/core
npx jest --runInBand --coverage=false \
  src/renderer/components/workloads-deployments \
  src/common/k8s-api/endpoints/deployment.api.test.ts
```

**PASS — 13 suites, 97 tests.** Incluye rollback, ownership/UID de Deployment y ReplicaSet, templates frescos, races/timers/polling, redacción, Pause/Resume y ControllerRevision UI. El test de modelo `ControllerRevision` en `packages/kube-object` también pasa: **1 suite / 2 tests**.

## 4. Jest — suite completa de core

```bash
cd packages/core
npx jest --runInBand --testPathIgnorePatterns integration
```

**Resultado del árbol R7-03 actual:**

- Suites: **54 failed, 286 passed, 340 total**.
- Tests: **260 failed, 9 skipped, 3215 passed, 3484 total**.
- Snapshots: **257 failed, 133 passed, 390 total**.
- Tiempo: **808.111 s**.

Ninguna suite de los componentes de Rollout/Deployment modificados por R7-03 falla en esta ejecución. Los siguientes paths son la lista exacta de suites fallidas del run; **salvo los dos casos comparados en §4.1, no se afirma que sean preexistentes**:
- `src/common/utils/sync-box/sync-box.test.ts`
- `src/features/add-cluster/navigation-using-application-menu.test.tsx`
- `src/features/application-update/child-features/application-update-using-application-menu/application-update-using-application-menu.test.ts`
- `src/features/application-update/child-features/application-update-using-top-bar/installing-update-using-topbar-button.test.tsx`
- `src/features/application-update/child-features/application-update-using-tray/installing-update-using-tray.test.ts`
- `src/features/application-update/child-features/force-update/force-update.test.ts`
- `src/features/application-update/child-features/periodical-checking-of-updates/periodical-checking-of-updates.test.ts`
- `src/features/application-update/child-features/selection-of-update-stability/selection-of-update-stability.test.ts`
- `src/features/application-update/hiding-preference-when-disabled.test.ts`
- `src/features/application-update/installing-update.test.ts`
- `src/features/catalog/custom-columns.test.tsx`
- `src/features/catalog/entity-running.test.tsx`
- `src/features/catalog/opening-entity-details.test.tsx`
- `src/features/cluster/delete-dialog/delete-cluster-dialog.test.tsx`
- `src/features/cluster/namespaces/edit-namespace-from-new-tab.test.tsx`
- `src/features/cluster/namespaces/edit-namespace-from-previously-opened-tab.test.tsx`
- `src/features/cluster/workloads/pods.test.tsx`
- `src/features/command-pallet/keyboard-shortcuts.test.tsx`
- `src/features/custom-resources/view-with-extra-columns.test.ts`
- `src/features/entity-settings/showing-settings-for-correct-entity.test.tsx`
- `src/features/extension-special-characters-in-page-registrations.test.tsx`
- `src/features/extensions/navigation-using-application-menu.test.ts`
- `src/features/helm-charts/add-custom-helm-repository-in-preferences.test.ts`
- `src/features/helm-charts/add-helm-repository-from-list-in-preferences.test.ts`
- `src/features/helm-charts/installing-chart/installing-helm-chart-from-new-tab.test.ts`
- `src/features/helm-charts/installing-chart/installing-helm-chart-from-previously-opened-tab.test.ts`
- `src/features/helm-charts/installing-chart/opening-dock-tab-for-installing-helm-chart.test.ts`
- `src/features/helm-charts/listing-active-helm-repositories-in-preferences.test.ts`
- `src/features/helm-charts/remove-helm-repository-from-list-of-active-repository-in-preferences.test.ts`
- `src/features/helm-charts/upgrade-chart/upgrade-chart-new-tab.test.ts`
- `src/features/helm-releases/showing-details-for-helm-release.test.ts`
- `src/features/hotbar/hovering-hotbar-menu.test.ts`
- `src/features/namespaces/route-with-sub-namespaces.test.tsx`
- `src/features/navigate-to-extension-page.test.tsx`
- `src/features/navigating-between-routes.test.tsx`
- `src/features/preferences/closing-preferences.test.tsx`
- `src/features/preferences/extension-adding-preference-tabs.test.tsx`
- `src/features/preferences/hiding-of-empty-branches.test.tsx`
- `src/features/preferences/navigation-to-application-preferences.test.tsx`
- `src/features/preferences/navigation-to-editor-preferences.test.ts`
- `src/features/preferences/navigation-to-extension-specific-preferences.test.tsx`
- `src/features/preferences/navigation-to-kubernetes-preferences.test.ts`
- `src/features/preferences/navigation-to-proxy-preferences.test.ts`
- `src/features/preferences/navigation-to-telemetry-preferences.test.tsx`
- `src/features/preferences/navigation-to-terminal-preferences.test.ts`
- `src/features/preferences/navigation-using-application-menu.test.ts`
- `src/features/preferences/navigation-using-tray.test.ts`
- `src/features/preferences/urls-of-legacy-extensions.test.tsx`
- `src/features/status-bar/status-bar-items-originating-from-extensions.test.tsx`
- `src/features/top-bar/extension-api/extendability-using-extension-api.test.tsx`
- `src/features/welcome/banners-from-extension.test.tsx`
- `src/features/welcome/navigation-using-application-menu.test.ts`
- `src/renderer/components/config-horizontal-pod-autoscalers/details.test.tsx`
- `src/renderer/components/status-bar/status-bar.test.tsx`

### 4.1 Comparación dirigida contra R7-02

Como una reproducción completa de core en R7-02 era costosa, se compararon **dos suites concretas**, sin generar otra build: un worktree sparse de `packages/core` en HEAD certificado R7-02 y el árbol R7-03, con las mismas dependencias instaladas. Comando en ambos árboles:

```bash
npx jest --runInBand --coverage=false --runTestsByPath \
  src/features/custom-resources/view-with-extra-columns.test.ts \
  src/features/cluster/workloads/pods.test.tsx
```

| Suite | R7-02 HEAD | Árbol R7-03 | Hallazgo comprobado |
|---|---|---|---|
| `custom-resources/view-with-extra-columns.test.ts` | 1 snapshot/test failed; 3 tests passed | El mismo resultado | La diferencia muestra `density-compact`; no es regresión de R7-03. |
| `cluster/workloads/pods.test.tsx` | 4 tests failed, 2 passed; 3 snapshots fallidos | El mismo resultado | La carga genera notificación por `fetch` no sobrescrito, además de los snapshots. |

El cambio de densidad relevante para listados/catálogos se generalizó en **Release 6 / R6-04 (`e6de38e`)**. El mecanismo de preferencia de densidad ya existía en **R5-09 (`6012f4a`)**; no se atribuye el estado observado a R7-01. Esta comparación demuestra solamente los casos de la tabla, **no los otros 255 snapshots ni las 52 suites restantes**. No se actualizaron snapshots ni se ejecutó `jest -u`.

## 5. Build experimental y E2E vigente

Se comprobó el espacio antes de empaquetar: **10 GiB libres**. Se generó/refrescó una sola build experimental macOS ARM64; no se creó una segunda build para comparar.

- Stage: `open-lens/dist-r7-03-stage` — **639 MiB**.
- `app.asar`: **305 MiB**.
- Build Core, Webpack y empaquetado: PASS. Logs `R7_03_FINAL_CORE_BUILD_20261023.log`, `R7_03_FINAL_WEBPACK_20261023.log`, `R7_03_FINAL_PACKAGING_20261023.log`.

**Playwright R7-03:** PASS, **14/14 checkpoints**, contra esa build. Evidencia vigente: `docs/revival/evidence/r7-03/R7_03_VERIFICATION.json`, capturas 01–11 y `docs/revival/logs/R7_03_FINAL_E2E_20261023.log`.

Cubre ControllerRevision con campos raíz de Kubernetes, ReplicaSet recreado/eliminado sin PATCH, Dry-Run tardío y contexto/cierre/reapertura, rollback, polling con errores persistentes, Pause y Resume con conflictos concurrentes, confirmación PROD real y ausencia de PATCH al cancelar. Se usaron únicamente fixtures HTTP sintéticos en `127.0.0.1`; no se operó ningún clúster real.

**Regresión R7-02 sobre la misma build:** PASS, **18/18 checkpoints**. Evidencia: `docs/revival/evidence/r7-03/r7-02-regression/R7_02_REGRESSION_VERIFICATION.json` y capturas 01–12. No se afirma PASS de una ejecución E2E anterior a esta build.

## 6. Historia y disposición

- Densidad compacta: la ruta relevante de listados se integró en Release 6; no se atribuye a R7-01. Los snapshots fallidos no se actualizaron.
- Suite global core: **sigue fallida**, con inventario arriba y una comparación R7-02 acotada explícitamente.
- ESLint global core: **sigue fallido** con 298 errores / 14 warnings; los archivos R7-03 validan con `--max-warnings=0`.
- R7-03 **no está globalmente certificado**. El checkpoint local autorizado no equivale a aprobación de release ni certifica las suites/lint globales.
- Las pruebas se ejecutaron sobre el árbol de trabajo basado en `11d47248774710b319912962ae780724c09031d6`. El checkpoint selectivo no incorpora documentos R4, `.omc/`, `.codegraph/`, logs históricos, kubeconfigs ni builds; no se hizo push.
