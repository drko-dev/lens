# H7.6.1 — Workloads en el docking global

**Estado:** PASS · **Rama:** `feature/global-docking-h7` · **Base:** `55bd034` · **Fecha:** 2026-11-03

GlobalPanelHost ahora aloja siete vistas de workloads: Pods, Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs y CronJobs. Todas reutilizan el motor de docking existente. No se creó ningún componente ni ninguna variante de docking por tipo.

## 1. Tipos incorporados

| Tipo | Componente Lens reutilizado | Ruta | Watch (API sintética) | Desacople |
|---|---|---|---|---|
| StatefulSets | `StatefulSets` (`workloads-statefulsets`) | `/statefulsets` | `/apis/apps/v1/namespaces/h7-synthetic/statefulsets` | No (acoplado) |
| DaemonSets | `DaemonSets` (`workloads-daemonsets`) | `/daemonsets` | `/apis/apps/v1/.../daemonsets` | No |
| ReplicaSets | `ReplicaSets` (`workloads-replicasets`) | `/replicasets` | `/apis/apps/v1/.../replicasets` | No |
| Jobs | `Jobs` (`workloads-jobs`) | `/jobs` | `/apis/batch/v1/.../jobs` | No |
| CronJobs | `CronJobs` (`workloads-cronjobs`) | `/cronjobs` | `/apis/batch/v1/.../cronjobs` | No |

Las vistas originales no se modificaron. Cada panel las monta sin cambios, con su selector de namespace, sus filtros y su búsqueda.

## 2. Arquitectura reutilizada

Se confirmó la auditoría H7.6: incorporar una vista requirió solo los puntos de extensión que ya existían.

1. **Descriptor:** `PanelKind` (`split-panel-types.ts`) y `PANEL_CATALOG` (`panel-catalog.ts`). Los cinco ítems nuevos están marcados `policyOnly: true`.
2. **Resolver:** `PanelContentResolver` usa un mapa `workloadListViews` (tipo → componente Lens). Pods y Deployments pasaron al mismo mapa, sin cambio de comportamiento.
3. **Catálogo del host:** `globalPanelPolicy.allowedKinds` se deriva de `globalPanelKinds` (`global-panel-store.ts`). Se mantiene `singleInstance: true`.
4. **Rutas:** la nueva `active-global-panel-kind.injectable.ts` concentra el mapa tipo → ruta. Es un `Record<GlobalPanelKind, …>`, así que un tipo sin ruta es un error de compilación. `should-use-global-panel-host` solo pregunta si hay un tipo activo.

El desacople ya era declarativo: `detachedListKinds` en `split-panel-store.ts` solo lista `pods` y `deployments`. Los tipos nuevos no lo ofrecen y no hizo falta tocarlo.

## 3. Catálogo y rutas

- **Fuente única:** `globalPanelKinds` alimenta la política del catálogo y el gate de rutas. Agregar un tipo es una línea en la lista más su ruta en el `Record`. No hay condiciones dispersas.
- **El host no se desmonta:** `ClusterFrameLayout` renderiza el mismo `<GlobalPanelHost />` mientras la ruta activa sea un workload alojado. React lo reconcilia en el lugar.
- **La ruta muestra su panel:** al navegar a una ruta alojada, `showRoutePanel` agrega su panel una vez, o lo restaura si estaba replegado. Si está desacoplado, no lo toca. El host lo ejecuta con un `reaction`.
- **Sin cambios de navegación:** con el flag apagado y en las rutas no alojadas se mantiene la navegación clásica. La navegación global de Lens no cambió.
- **Kubetail sin efectos colaterales:** el modal de catálogo de Kubetail no filtraba, así que los cinco tipos habrían aparecido ahí. Ahora un store sin política rechaza los ítems `policyOnly` y el modal de Kubetail pasa `isKindAllowed`. Su catálogo queda igual que antes.

## 4. Tests unitarios

Archivo: `packages/core/src/features/global-docking/renderer/__tests__/workloads-h7-6-1.test.tsx`. Cubre:

- La política aloja exactamente los siete tipos, con instancia única.
- Rechazo de Events, Kubetail, Terminal, Editor, Details y un tipo desconocido (`secrets`).
- Por cada tipo nuevo, un caso parametrizado: está en el catálogo como workload disponible, no es desacoplable y se abre una sola vez.
- Por cada tipo nuevo, el resolver monta el componente Lens correcto.
- El catálogo de Kubetail no cambia.
- Docking: rechaza el drop desde otro `clusterId`, agrupa en pestañas y divide los paneles.
- `showRoutePanel`: agrega una vez, restaura si está replegado e ignora los tipos no alojados.
- `ClusterFrameLayout` real con DI: navegar por las siete rutas monta el host una sola vez. Events se renderiza clásico, y con el flag apagado todas las rutas son clásicas.

**RED:** el módulo nuevo no existía. **GREEN:** `global-docking` y `split-panel` dan 18 suites y 175 tests en verde.

Un test existente se ajustó porque codificaba el catálogo anterior: H2 `PANEL_CATALOG.length` pasó de 7 a 12.

## 5. Playwright WL01–WL15

Suite: `open-lens/integration/h7-docking-e2e.mjs`, bloque H7.6.1. Usa mouse y teclado reales y verifica con DOM, geometría y contadores de la API sintética. Cada vista debe mostrar la tabla real de Lens con su fila sintética; un panel vacío falla.

| ID | Escenario | Resultado y evidencia |
|---|---|---|
| WL01–WL05 | Abrir cada tipo desde la barra lateral | PASS. Panel único dentro del host, 1 watch por tipo, `clusterId` del host igual al del encabezado |
| WL06 | Los siete desde el catálogo | PASS. Ofrece exactamente los 5 que faltan; 7 paneles con datos; catálogo final vacío; Pods 1 watch |
| WL07 | Navegar entre workloads | PASS. El mismo nodo DOM del host en las 7 rutas; 1 watch por tipo |
| WL08 | Arrastrar StatefulSets sobre Jobs, 4 lados | PASS. Indicador y geometría correctos en izquierda, derecha, arriba y abajo |
| WL09 | Agrupar como pestañas | PASS. `tabs[replicasets,daemonsets,*cronjobs]` |
| WL10 | Cambiar y reordenar pestañas | PASS. La pestaña inactiva libera su watch (0/1) en 3 ciclos; reordenado `daemonsets,replicasets` |
| WL11 | Replegar y restaurar | PASS. Replegado da 0 watches y banda visible; restaurar consulta de nuevo exactamente una vez |
| WL12 | Cerrar y reabrir | PASS. Cerrar da 0 watches, sin banda; el catálogo vuelve a ofrecer CronJobs |
| WL13 | Identidad | PASS. 4 encabezados con acento rosa de 2 px, 28 px de alto, badge PROD y `data-production=true`; la banda replegada conserva el color |
| WL14 | Desacople no disponible | PASS. Pods y Deployments tienen botón; los 5 nuevos no; 0 ventanas abiertas |
| WL15 | Disconnect | PASS. Antes: 7 watches. Después, en t+0/2/5/10/20 s: 0 watches, 0 iframes y 0 proxies nuevos |

### Problemas encontrados y corregidos

1. **Jobs y CronJobs vacíos en la primera corrida (7 FAIL).** `JobApi` y `CronJobApi` usan `checkPreferredVersion` y consultan `/apis/batch` (objeto APIGroup), que el mock respondía con 404. Se agregó la respuesta APIGroup para `apps` y `batch` en `synthetic-kube-api.mjs`. Era un defecto del mock, no del producto: un clúster real responde esa ruta.
2. **WL09.** El test soltaba sobre una pestaña inactiva, que no se renderiza. Ahora apunta al grupo. Era un defecto del test.
3. **D13 (H7.2).** Codificaba "solo Pods y Deployments". Ahora espera los cinco tipos nuevos.

## 6. Regresión completa

| Corrida | Resultado |
|---|---|
| WL01–WL15 (1.ª) | 8 PASS / 7 FAIL (mock sin APIGroup) |
| WL01–WL15 (2.ª) | 14 PASS / 1 FAIL (WL09, test) |
| WL09 aislado | PASS |
| **Completa `2026-11-03T10-27-41`** | **87 PASS / 0 FAIL / 0 SKIP / 0 BLOCKED** |

- Escrituras Kubernetes rechazadas por el mock: A 0, B 0.
- Errores de consola: 162, todos de websockets HMR del dev server; 0 propios.
- Artefactos completos (video, trazas, capturas): `qa-artifacts/h7-playwright/2026-11-03T10-27-41/`.

## 7. Evidencia visual (versionada)

En `docs/evidence/h7-6-1/`:

- `wl01-statefulsets-from-sidebar.jpg`
- `wl06-seven-workloads.jpg`
- `wl09-workload-tabs.jpg`
- `wl11-collapsed-replicasets.jpg`
- `wl13-identity-prod.jpg`

La suite vuelve a capturar evidencias de hitos anteriores en cada corrida. Se restauraron con `git checkout` para no reescribir la evidencia histórica.

## 8. Watches y Disconnect

- Cada tipo abre exactamente 1 watch namespaced y no hay duplicados al navegar, mover o agrupar (WL06–WL10).
- **Mover un panel lo remonta:** WL08 registra 4 watches iniciados en 4 movimientos, con 1 abierto al final. Es el mismo comportamiento que ya tenían Pods y Deployments: el contador de referencias de `KubeWatchApi` cierra el anterior. No se cambió el mecanismo de suscripciones.
- **Pestaña inactiva, replegar y cerrar** liberan el watch. Restaurar y reabrir vuelven a consultar una sola vez.
- **Disconnect** con tres paneles nuevos abiertos deja el clúster desconectado: no hay iframe oculto ni reactivación (WL15). El fix de H7.6 Preflight cubre los tipos nuevos sin cambios.

## 9. Recursos

| Momento | Disco libre | Swap usado / total |
|---|---|---|
| Inicio | 22 GiB | 9,6 / 11,2 GiB |
| Antes de compilar | 23 GiB | 9,5 / 10,0 GiB |
| Cierre | 21 GiB | 10,1 / 11,0 GiB |

- **RAM al cierre:** 48 % de memoria libre (`memory_pressure`).
- **Compilación:** una sola, del renderer de core con Node 24.22.2. Tardó 17 s, con 1,5 GB de RSS y los mismos 42 errores TS que ya existían; no se compiló main.
- **Electron:** una instancia a la vez y sin limpiezas.
- **Al cerrar:** no quedan Electron de QA ni listeners en 18443/18444.

## 10. Limitaciones y siguiente etapa

- **Desacople de los cinco tipos nuevos:** no está disponible porque no tienen renderer seguro de ventana. Requiere extender `detachedListKinds` y el renderer de Main, con su propia validación.
- **Pestaña ya agrupada:** si la ruta navegada corresponde a un panel que es pestaña inactiva de un grupo, la ruta no la activa; el panel sigue disponible en su grupo. Queda para una etapa posterior si se requiere.
- **Persistencia del layout por clúster:** pendiente para H7.7.
- **Fuera del host:** Events, Secrets, Terminal, Editor, Details y Kubetail.
- **Siguiente hito:** H7.6.2 (no iniciado).
