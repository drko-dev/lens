# H7.6.2 — Recursos Kubernetes y Networking en el docking global

**Estado:** PASS · **Rama:** `feature/global-docking-h7` · **Base:** `d103dd5` · **Fecha:** 2026-11-03

GlobalPanelHost aloja ahora **13 tipos**: los 7 workloads de H7.6.1 más Events, ConfigMaps, Services, Ingresses, PersistentVolumeClaims y Nodes. Además, navegar a un panel que ya existe activa su pestaña, aunque esté inactiva o replegada.

## 1. Corrección de navegación (commit `28b1a05`)

**Problema.** Si Deployments era una pestaña inactiva de un grupo, elegirlo en la barra lateral no lo mostraba.

**Corrección.** `showRoutePanel` (`global-panel-store.ts`) reutiliza operaciones existentes de `SplitPanelStore`:

| Estado del panel | Acción |
|---|---|
| No existe | `addPanel(kind)` (comportamiento anterior) |
| Replegado | `restorePanel` (que ya activa su pestaña) |
| Pestaña inactiva | `findParentGroup` (ahora exportado) + `setActiveTabInGroup` |
| Activo o suelto | Ninguna |

No se agregó un algoritmo de selección nuevo. El host no se remonta y la navegación clásica con el flag apagado no cambió.

**Defecto encontrado y corregido en el mismo commit.** `splitLeafInTree` ignoraba los destinos que estaban dentro de un grupo de pestañas. Por eso `addPanel` no hacía nada, sin avisar, si el destino (o el primer panel) era una pestaña agrupada; afectaba tanto al catálogo como a la navegación. Ahora el panel nuevo se ubica junto al grupo completo.

Riesgo: `splitLeafInTree` es compartido con Kubetail. Allí la operación antes no tenía efecto y ahora agrega el panel. Los tests de Kubetail (split-panel) siguen en verde.

## 2. Tipos incorporados (Fase B: auditoría)

| Tipo | Ruta | Componente Lens reutilizado | API | Watch / polling | Al desmontar |
|---|---|---|---|---|---|
| Events | `/events` | `Events` (vista completa de la ruta) | `/api/v1/…/events` | watch | libera watch |
| ConfigMaps | `/configmaps` | `ConfigMaps` | `/api/v1/…/configmaps` | watch | libera watch |
| Services | `/services` | `Services` | `/api/v1/…/services` | watch | libera watch |
| Ingresses | `/ingresses` | `Ingresses` | `networking.k8s.io/v1` (`fallbackApiBases` → consulta del APIGroup) | watch | libera watch |
| PVCs | `/persistent-volume-claims` | `PersistentVolumeClaims` | `/api/v1/…/persistentvolumeclaims` | watch | libera watch |
| Nodes | `/nodes` | `NodesRoute` | `/api/v1/nodes` (clúster) + `POST /metrics` | watch + `interval(30 s)` | `componentWillUnmount` detiene el intervalo |

- **Namespace:** los recursos namespaced respetan el selector de namespace de la vista original. Nodes es de nivel clúster.
- **Secrets:** queda excluido de forma explícita, porque requiere una revisión de información sensible.
- **Desacople:** ningún tipo nuevo ofrece desacople. `detachedListKinds` sigue limitado a Pods y Deployments.

## 3. Arquitectura y rutas (Fase C)

- **Fuente única:** `globalPanelKinds` tiene ahora los 13 tipos. `active-global-panel-kind.injectable.ts` agrega las 6 rutas a su `Record` exhaustivo; no hay condiciones dispersas.
- **Catálogo:** los 5 ítems nuevos (todos menos Events, que ya existía para Kubetail) son `policyOnly`, así que el catálogo de Kubetail no cambia.
- **Events:** Kubetail lo sigue mostrando `compact` (10 filas). Dentro del host, el contexto `RouteViewsContext` (`panel-content-resolver.tsx`, provisto por `GlobalPanelHost`) monta la vista completa, igual que la ruta. No se duplicó ningún componente.
- **Sin cambios:** el motor de docking no se modificó.

## 4. Defecto de Disconnect con Nodes (main)

**Observado.** En la primera corrida de RN16, con Nodes abierto, apareció un `lens-k8s-proxy` nuevo después de Disconnect. El log de main lo confirma:

```
[CLUSTER]: disconnected
Authentication proxy started {"meta":{…"disconnected":true…}}
```

**Causa.** Una petición `/metrics` que sigue en curso ejecuta la detección de Prometheus. La detección carga el kubeconfig del proxy, y eso vuelve a levantar `lens-k8s-proxy` de un clúster ya desconectado.

**Corrección.** Se aplicó en el punto de entrada de métricas, no en el proxy compartido:
- `prometheus-handler.ts`: si el clúster está desconectado, no carga el kubeconfig del proxy.
- `add-metrics-route.injectable.ts`: los reintentos de métricas se cortan si el clúster se desconectó mientras tanto.

`k8sRequest` y `kube-auth-proxy-server` no se tocaron, porque la conexión los usa mientras `disconnected` todavía es `true`.

**Test.** `prometheus-handler-disconnected.test.ts`: RED (cargaba el kubeconfig), luego GREEN. El fixture de `prometheus-handler.test.ts` ahora modela un clúster conectado (`disconnected=false`); el único llamador real de `getPrometheusDetails` es la ruta de métricas, que solo se usa con el clúster conectado.

## 5. Polling de Nodes

El renderer hace el `POST /metrics` por Node, no por Chromium, así que Playwright no lo ve. Por eso se mide en la API sintética: cada poll ejecuta la detección de Prometheus contra el clúster, con 9 peticiones por poll en este mock.

| Medición (RN15) | Resultado |
|---|---|
| 65 s visible, después de 3 movimientos | 18 peticiones = **2,0 polls** (un solo timer de 30 s) |
| 35 s replegado | 0 |
| Restaurar | 9 (vuelve a consultar) |
| 35 s cerrado | 0, y watch de Nodes 0 |
| Después de Disconnect (RN16, desde t+2 s) | 0 |

**Métricas sintéticas.** El mock no emula Prometheus, así que Nodes muestra sus filas y condiciones sin barras de uso. Es el mismo comportamiento que tiene Lens en un clúster sin Prometheus.

## 6. API sintética (Fase E)

`open-lens/integration/h7/synthetic-kube-api.mjs`:

- **Recursos:** un objeto válido por recurso: `h7-event.1`, `h7-config`, `h7-svc`, `h7-ingress`, `h7-pvc` y `h7-node`. Secrets se mantiene vacío.
- **Grupos:** el grupo `networking.k8s.io` responde en su APIGroup, en su APIResourceList y en `/ingresses`.
- **`labelSelector` (igualdad):** antes se ignoraba, y la detección de Prometheus "encontraba" `h7-svc` y le enviaba `POST query_range`. Fueron 552 rechazos 405, contados como escrituras. Ahora no hay falso Prometheus y quedan 0 escrituras.
- **Contadores separados:** watches iniciados (`started`), activos (`open`), cancelados (`cancelled`), polling (`polling`) y escrituras rechazadas (`rejected`).

## 7. Tests unitarios

| Archivo | Cubre |
|---|---|
| `route-navigation-h7-6-2.test.ts` | Pestaña inactiva, replegada, inexistente, navegación repetida, otras pestañas intactas, alta junto a un grupo |
| `resources-h7-6-2.test.tsx` | 13 tipos; registro e instancia única de los 6; resolución a la vista Lens de la ruta; Events compacto en Kubetail; Secrets y herramientas rechazados |
| `prometheus-handler-disconnected.test.ts` | Clúster desconectado sin proxy; clúster conectado usa el proxy |

Global docking, split-panel y main (prometheus/cluster) dan **23 suites y 228 tests en verde**.

Los tests existentes que usaban Events como tipo "no alojado" pasaron a usar `secrets`, `terminal` o `kubetail`. El tamaño del catálogo en H2 pasó de 12 a 17.

## 8. Playwright

| ID | Escenario | Evidencia |
|---|---|---|
| RN01–RN06 | Abrir cada recurso desde la barra lateral | Panel único con su fila sintética, 1 watch y `clusterId` A |
| RN07 | Catálogo | 2 abiertos + 11 ofrecidos = 13; sin Secrets ni herramientas |
| RN08 | Navegar entre recursos | Mismo nodo DOM del host; 1 watch por recurso |
| RN09 | Pestaña inactiva desde la barra lateral | `tabs[pods,*deployments]`; 3 navegaciones = 1 watch iniciado; 1 panel |
| RN10 | Panel replegado desde su ruta | Se restaura y queda activo; StatefulSets intacto |
| RN11 | Arrastre a 4 lados y agrupación | Indicador y geometría correctos; `clusterId` intacto tras los movimientos |
| RN12 | Reordenar y mover con teclado | Orden `ingresses,services`; Pods agrupado con Ingresses vía Tab, Enter y flechas |
| RN13 | Replegar, cerrar y reabrir | Watch 0 al replegar y al cerrar; restaurar y reabrir consultan una vez cada uno |
| RN14 | Identidad | 4 encabezados índigo de 2 px, 28 px, PROD |
| RN15 | Polling de Nodes | Ver §5 |
| RN16 | Disconnect | 0 watches, 0 iframes, 0 proxies nuevos y 0 polling hasta t+40 s |

**Corridas:**

| Corrida | Resultado |
|---|---|
| RN09 + RN10 | 1/1, luego RN10 aislado PASS (el test usaba el botón `+` de una pestaña inactiva) |
| RN01–RN16 | 14/2 (RN15 sin medición posible desde Chromium; RN16 con defecto real de main) |
| RN15 + RN16 (main corregido) | 1/1 (RN15 superó el timeout de 150 s; mock sin `labelSelector`) |
| RN15 + RN16 | 2/2 |
| **Completa `2026-11-03T11-40-42`** | **103 PASS / 0 FAIL / 0 SKIP / 0 BLOCKED** |

- **Corrida completa:** 0 escrituras rechazadas (A 0, B 0); 194 errores de consola, todos de HMR del dev server, 0 propios.
- **Ajustes del harness:** RN15 tiene timeout propio de 300 s mediante un quinto parámetro opcional de `run`, `prun` y `drun`. D13 y WL06 ahora esperan el catálogo ampliado.
- **Artefactos:** video y trazas completos en `qa-artifacts/h7-playwright/2026-11-03T11-40-42/`.

## 9. Evidencia visual

En `docs/evidence/h7-6-2/`: `rn02-configmaps.jpg`, `rn04-ingresses.jpg`, `rn06-nodes.jpg`, `rn07-catalog-13.jpg`, `rn11-resources-tabs.jpg` y `rn14-identity-prod.jpg`.

Las evidencias de hitos anteriores que la suite volvió a capturar se restauraron con `git checkout`.

## 10. Recursos

| Momento | Disco libre | Swap usado / total | RAM libre |
|---|---|---|---|
| Inicio | 21 GiB | 9,4 / 10 GiB | 48 % |
| Antes de la regresión | 20,02 GiB | 10,7 / 12 GiB | 49 % |
| Tras la limpieza autorizada | 23,03 GiB | — | — |

- **Limpieza (autorizada por el usuario):** 5 índices `.db` de `~/.cache/codebase-memory-mcp` (~1,05 GB, regenerables). Se conservó `_config.db`, que está en uso por los servidores MCP.
- **Compilaciones (una a la vez, Node 24.22.2):**

  | Bundle | Tiempo | RSS |
  |---|---|---|
  | `lens-app-renderer`, primera | 31 s | 1,2 GB |
  | `lens-app-renderer`, segunda | 17 s | 1,5 GB |
  | `lens-app-main` | 25 s | 1,4 GB |

  Todas con los mismos 42 errores TS que ya existían. No se generó DMG ni ZIP.
- **Electron:** una instancia de QA a la vez.

## 11. Limitaciones

- **Métricas de Nodes:** sin Prometheus sintético, no hay barras de uso.
- **Desacople:** no está disponible para los 6 recursos nuevos ni para los 5 workloads de H7.6.1.
- **Secrets:** sin incorporar; necesita una revisión de seguridad propia.
- **Polling:** RN15 mide el polling por las peticiones de detección que llegan al clúster, no por el `POST /metrics` del renderer.
- **Componentes con estado:** Terminal, Editor YAML, Details y Kubetail siguen fuera del host. Son candidatos para H7.6.3 porque tienen PTY, edición y streams.
- **Siguiente hito:** H7.6.3 (no iniciado).
