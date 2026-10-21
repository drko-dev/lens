# R4-02 — Triage diferencial de la regresión unitaria

**Fecha:** 2026-10-20/21  
**Baseline R3:** `feat/openlens-devops-revival`, `22fbe983f5a6b4059eccbee15c906fbc5447c3d4`  
**R4:** `feat/r4-workspace-security`, `22fbe983f5a6b4059eccbee15c906fbc5447c3d4` + cambios locales  
**Node:** `v20.20.2` en ambos worktrees  
**Dictamen:** **27/27 suites y los 145 nombres de tests fallidos coinciden entre R3 y R4. No se encontró una regresión nueva atribuible al delta local. R4-01 y R4-02 continúan PARCIALES.**

## Método y protección del baseline

1. Se repitió la suite unitaria completa de R4 con `--no-cache --ci`, sin `-u` ni escritura de snapshots, y se guardó temporalmente el JSON de Jest bajo `lens-r4/docs/revival/`.
2. Los 27 paths fallidos de ese JSON se ejecutaron en R3 con los mismos flags y Node `v20.20.2`, usando `--runTestsByPath`. Los 27 paths existían en R3. La ejecución terminó con exit 1 por los fallos esperados.
3. Un comparador revisó por path cada nombre de test fallido, `actual`, `expected` y mensaje. Al normalizar la raíz absoluta del checkout, todos coincidieron. La única diferencia textual sin normalizar fue `/lens-r4/` frente a `/lens/` en el component stack de una falla de snapshot; el DOM y el fallo eran iguales.
4. El `git status --porcelain=v1 --untracked-files=normal` de R3 fue idéntico antes y después. Se conservaron sin cambios los artefactos no versionados que ya existían allí. No hubo `jest -u`, build, empaquetado, cambios de código, commits ni operaciones Kubernetes.

### Recuentos

| Ejecución | Suites | Tests | Snapshots |
|---|---:|---:|---:|
| R4 full, `--no-cache`, Node 20.20.2 | 270: 243 PASS / 27 FAIL | 2711: 2557 PASS / 145 FAIL / 9 skipped | 390: 255 PASS / 135 FAIL |
| R3, solo los 27 paths fallidos de R4 | 27: 0 PASS / 27 FAIL | 428: 276 PASS / 145 FAIL / 7 skipped | 135 FAIL |
| R4, esos mismos 27 paths extraídos del resultado full | 27: 0 PASS / 27 FAIL | 428: 276 PASS / 145 FAIL / 7 skipped | 135 FAIL |

La corrida completa R4 anterior registrada en `R4_02_VALIDATION.md` tenía 269 suites y 2702 tests. La nueva corrida `--no-cache` incluyó una suite aprobada de 9 tests (`workspace-tabs/common/__tests__/workspace-history.test.ts`); no se conservó el JSON anterior para determinar por qué no aparecía entonces. La diferencia no afecta el conjunto fallido: las 27 suites y 145 fallas se mantuvieron.

## Lista exacta de las 27 suites fallidas

Las columnas indican número de tests fallidos en R3 y R4. En todos los casos coincidieron también los nombres completos de las pruebas fallidas.

| Suite (path relativo a `packages/core`) | R3 | R4 | Clasificación |
|---|---:|---:|---|
| `src/common/k8s-api/__tests__/api-manager.test.ts` | 2 | 2 | Heredado |
| `src/features/cluster/extension-api/disable-cluster-pages-when-cluster-is-not-relevant.test.tsx` | 3 | 3 | Heredado |
| `src/features/cluster/extension-api/disable-sidebar-items-when-cluster-is-not-relevant.test.tsx` | 3 | 3 | Heredado |
| `src/features/cluster/kube-object-details/extension-api/disable-kube-object-detail-items-when-cluster-is-not-relevant.test.tsx` | 3 | 3 | Heredado |
| `src/features/cluster/kube-object-details/extension-api/reactively-hide-kube-object-detail-item.test.tsx` | 2 | 2 | Heredado |
| `src/features/cluster/kube-object-menu/extension-api/disable-kube-object-menu-items-when-cluster-is-not-relevant.test.tsx` | 3 | 3 | Heredado |
| `src/features/cluster/kube-object-status-icon/extension-api/disable-kube-object-statuses-when-cluster-is-not-relevant.test.tsx` | 3 | 3 | Heredado |
| `src/features/cluster/kube-object-status-icon/show-status-for-a-kube-object.test.tsx` | 6 | 6 | Heredado |
| `src/features/cluster/legacy-extension-adding-cluster-frame-components.test.tsx` | 1 | 1 | Heredado |
| `src/features/cluster/namespaces/edit-namespace-from-new-tab.test.tsx` | 21 | 21 | Heredado |
| `src/features/cluster/namespaces/edit-namespace-from-previously-opened-tab.test.tsx` | 2 | 2 | Heredado |
| `src/features/cluster/order-of-sidebar-items.test.tsx` | 2 | 2 | Heredado |
| `src/features/cluster/sidebar-and-tab-navigation-for-core.test.tsx` | 7 | 7 | Heredado |
| `src/features/cluster/sidebar-and-tab-navigation-for-extensions.test.tsx` | 9 | 9 | Heredado |
| `src/features/cluster/visibility-of-sidebar-items.test.tsx` | 2 | 2 | Heredado |
| `src/features/cluster/workload-overview.test.tsx` | 1 | 1 | Heredado |
| `src/features/cluster/workloads/overview/extension-api/disable-workloads-overview-details-when-cluster-is-not-relevant.test.tsx` | 3 | 3 | Heredado |
| `src/features/cluster/workloads/pods.test.tsx` | 3 | 3 | Heredado |
| `src/features/custom-resources/view-with-extra-columns.test.ts` | 1 | 1 | Heredado |
| `src/features/helm-charts/installing-chart/installing-helm-chart-from-new-tab.test.ts` | 24 | 24 | Heredado |
| `src/features/helm-charts/installing-chart/installing-helm-chart-from-previously-opened-tab.test.ts` | 2 | 2 | Heredado |
| `src/features/helm-charts/installing-chart/opening-dock-tab-for-installing-helm-chart.test.ts` | 9 | 9 | Heredado |
| `src/features/helm-charts/upgrade-chart/upgrade-chart-new-tab.test.ts` | 7 | 7 | Heredado |
| `src/features/helm-releases/showing-details-for-helm-release.test.ts` | 18 | 18 | Heredado |
| `src/features/namespaces/route-with-sub-namespaces.test.tsx` | 3 | 3 | Heredado |
| `src/features/pod-logs/download-logs.test.tsx` | 2 | 2 | Heredado |
| `src/renderer/frames/cluster-frame/cluster-frame.test.tsx` | 3 | 3 | Heredado |
| **Total** | **145** | **145** | **27 heredadas / 0 nuevas** |

## Clasificación y prioridad de deuda heredada

- **Regresiones nuevas de R4: 0 encontradas.** Ninguna de las 145 pruebas fallidas aparece solo en R4; la comparación normalizada no encontró diferencias de salida que expliquen un fallo R4-only. Por lo tanto, no se modificó código ni snapshots para silenciar estos resultados.
- **P1 — comportamiento no visual (10 tests en 3 suites):** Helm, 3 fallas en edición de configuración (Monaco no aparece y el estado habilitado/deshabilitado del botón no coincide); edición de namespace, 5 fallas en expectativas del patch al guardar; `api-manager`, 2 fallas donde el registro de CRD/extensión colisiona con `VulnerabilityReportApi`/`VulnerabilityReportStore`. Están presentes en R3 y deben investigarse como deuda de la línea consolidada antes de usar estas pruebas como gate verde. Para `api-manager`, priorizar el aislamiento/contrato del test y no cambiar producción solo para ajustarlo.
- **P2 — drift visual (135 snapshots en 26 suites):** el HTML real y los snapshots incompatibles son iguales en R3 y R4 después de normalizar paths. Revisar con los responsables qué UI consolidada es intencional y luego actualizar snapshots de forma selectiva; no usar `jest -u` global.
- **Inestables: 0 fallas clasificadas como flaky.** No se observó variación entre R3 y R4. Solo hubo una diferencia de recolección de +1 suite/+9 tests aprobados entre reportes R4; no es una falla y queda registrada, pero el JSON anterior no existe para explicar la diferencia histórica.

## Comandos reproducibles

Full R4:

```bash
cd /Users/gustavomarcon/Documents/lens/lens-r4/packages/core
nvm exec 20.20.2 npm run test:unit -- --runInBand --no-cache --ci --silent --watch=false --json --outputFile=../../docs/revival/.r4-02-full-node20-results.json
```

R3: se ejecutó `npm run test:unit -- --runTestsByPath <los 27 paths de la tabla> --runInBand --no-cache --ci --silent --watch=false --json`, con `outputFile` apuntando solo al worktree R4. Para trazabilidad, los reportes quedan en `docs/revival/.r4-02-full-node20-results.json`, `docs/revival/.r4-02-r3-27-node20-results.json` y `docs/revival/.r4-02-r3-27-node20.log`; no están en el checkout R3.

## Alcance que permanece abierto

Esta comparación cubre **solo** las 27 suites fallidas del último resultado de R4; no es una ejecución completa de las 270 suites en R3 ni acredita regresión global verde. R4 mantiene sus 27 suites/145 tests fallidos, aunque sean heredados. El shell y las funciones de R4 no se cambian por fallos que reproducen el mismo resultado en R3. R4-01 y R4-02 continúan **PARCIALES** hasta satisfacer sus demás criterios.
