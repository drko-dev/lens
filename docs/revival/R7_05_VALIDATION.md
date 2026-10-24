# OpenLens DevOps Revival — R7-05 Validation & Certification Report

| Field | Value |
|---|---|
| Milestone | R7-05 — Visualizador y Matriz de NetworkPolicies |
| Worktree Directory | `/Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix` |
| Branch | `feat/r7-05-networkpolicy-matrix` |
| Base HEAD | `6ea8bb41eb9797939ecc6d9c0da6c902017cb6f4` |
| Date | 2026-10-24 |
| Status | **IMPLEMENTADO — PRECEDENCIA DE FRESCUEZ CORREGIDA — NO CERTIFICADO GLOBALMENTE** |
| Commit | **NINGUNO** (checkpoint local pendiente de autorización de auditoría independiente) |

---

## 1. Executive Summary

Milestone **R7-05** implements a pure, testable NetworkPolicy evaluation engine, a reactive
**NetworkPolicyMatrix** component in the NetworkPolicy drawer, and an isolation audit section in
**Pod Details**.

This cycle closed the findings of the independent audit:

1. **Estados reales de los stores** — la evaluación pasa a derivarse de `isLoaded` / `isLoading` /
   `failedLoading` reales de `PodStore`, `NamespaceStore` y `NetworkPolicyStore`
   (`engine/data-state.ts`). Un store ausente o no inicializado produce **INDETERMINATE**, nunca
   *Default Allow*. La propiedad ficticia `clusterDisconnected` fue eliminada: la conectividad
   proviene del modelo `Cluster` real (`disconnected` / `online` / `accessible`), inyectado con
   `hostedClusterInjectable`. Los resultados se invalidan al cambiar de clúster.
2. **Matriz sin omisiones silenciosas** — `buildPolicyMatrix()` ya no trunca candidatos externos
   en 150: evalúa todos los peers visibles (incluidos otros namespaces) y, cuando alcanza el
   presupuesto explícito de conexiones, devuelve un resultado marcado como **parcial** con la
   cantidad exacta de conexiones omitidas, que la UI muestra en un banner.
3. **Fidelidad de resultados** — se distingue el puerto declarado en contenedores del resto de
   puertos potencialmente accesibles (`portScope`: `declared` / `all` / `other`). La fila
   *otros puertos* nunca se reporta como permitida cuando la política sólo permite un subconjunto.
4. **Validación y documentación** — Jest dirigido y regresión, ESLint sin advertencias,
   TypeScript separando errores propios de preexistentes, Playwright sintético y `git diff --check`.

Ciclo siguiente (reactividad y conectividad real):

5. **Memoización reactiva** — la matriz ya no se memoiza por la *identidad* de los stores o de sus
   colecciones (que permanecen iguales mientras cambian sus contenidos MobX). La evaluación se
   memoiza por **firma de contenido** (membresía, instancias re-entregadas, labels y spec) y el
   estado de evaluación se deriva de lecturas reactivas en cada render.
6. **Conectividad real** — se distinguen tres situaciones distintas: desconexión explícita
   (`disconnected`), conexión en progreso (`online === false`) e inaccesibilidad
   (`accessible === false`). Un clúster inaccesible **no** se considera listo aunque
   `disconnected === false`.
7. **Datos obsoletos** — tras perder la conexión los stores conservan los últimos recursos: un
   rastreador de frescura marca esos datos como obsoletos y la evaluación pasa a indeterminada
   hasta que el store entrega recursos frescos (o hasta que cambia el clúster).

---

## 2. Test & Certification Levels

La validación se divide en cuatro niveles explícitos, sin declarar certificación global:

```
+-------------------------------------------------------------------------------+
|                      TIER 1: JEST UNIT TEST SUITES                             |
|  Motor de evaluación, selectores, CIDR bitwise, puertos, fail-closed,          |
|  derivación de estado de stores y escala (1.000 Pods).                         |
|  Resultado: 10 Suites / 149 Tests PASS (todas las suites R7-05).               |
+-------------------------------------------------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|              TIER 2: PLAYWRIGHT SINTÉTICO SOBRE HARNESS REACT                 |
|  Verificación en Chromium 1243 contra fixtures sintéticos en 127.0.0.1:45678. |
|  Resultado: 10/10 Checkpoints PASS | 0 mutaciones.                            |
+-------------------------------------------------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|          TIER 3: PLAYWRIGHT SOBRE APLICACIÓN ELECTRON EMPAQUETADA             |
|  NO EJECUTADO en este ciclo (preserva almacenamiento y evita builds sobre      |
|  deuda técnica heredada del monorepo).                                        |
+-------------------------------------------------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|           TIER 4: INTEGRACIÓN CON STORES KUBERNETES REALES                    |
|  Integración implementada con fail-closed (0 escrituras, 0 mutaciones).       |
|  Requiere un clúster real para certificar en producción.                      |
+-------------------------------------------------------------------------------+
```

---

## 3. Jest Unit Test Results

Comando:

```bash
cd packages/core && npx jest \
  src/renderer/components/network-policies \
  src/renderer/components/workloads-pods/__tests__/pod-network-policies.test.tsx
```

### Test Suites Breakdown

| Test Suite | Tests | Result |
|---|---|---|
| `engine/__tests__/cidr.test.ts` | 11 | **PASS** |
| `engine/__tests__/selector.test.ts` | 9 | **PASS** |
| `engine/__tests__/port-resolver.test.ts` | 13 | **PASS** |
| `engine/__tests__/engine.test.ts` | 38 | **PASS** |
| `engine/__tests__/data-state.test.ts` | 34 | **PASS** |
| `network-policies/__tests__/network-policy-details.test.tsx` | 3 | **PASS** |
| `network-policies/__tests__/network-policy-matrix.test.tsx` | 13 | **PASS** |
| `network-policies/__tests__/network-policy-matrix-transitions.test.tsx` | 16 | **PASS** (nuevo) |
| `workloads-pods/__tests__/pod-network-policies.test.tsx` | 8 | **PASS** |
| `workloads-pods/__tests__/pod-network-policies-transitions.test.tsx` | 4 | **PASS** (nuevo) |
| **Total R7-05** | **149** | **PASS (100%)** |

### Regresión sobre `src/renderer`

```bash
cd packages/core && npx jest src/renderer
```

Resultado: **133 suites / 1059 tests — 131 suites PASS, 2 suites FAIL (13 snapshots)**.

Los 2 suites con fallos son deriva de snapshots preexistente, **sin ninguna dependencia de R7-05**:

| Suite | Causa | Evidencia de preexistencia |
|---|---|---|
| `components/status-bar/status-bar.test.tsx` | Snapshot de la barra de estado desalineado | Sin imports de R7-05; archivos no modificados por este hito |
| `components/config-horizontal-pod-autoscalers/details.test.tsx` | Snapshot de clases CSS en el bloque `metrics` | Sin imports de R7-05; archivos no modificados por este hito |

### Verified Specifications

- **Selector Engine:** `matchLabels`, `matchExpressions` (`In`, `NotIn`, `Exists`, `DoesNotExist`) y
  selector vacío `{}`.
- **Peer Evaluator:** `AND` lógico en un peer, `OR` lógico entre peers, validación contra objetos
  `Namespace` reales, placeholders de namespace sin labels → indeterminate, peer vacío `{}`
  (inválido según el esquema `networking.k8s.io/v1`) → **indeterminate**.
- **CIDR Engine:** matching bitwise IPv4/IPv6 y `ipBlock.except` con aritmética BigInt.
- **Port Resolver:** puertos nombrados contra containers, rangos `endPort`, protocolos TCP/UDP/SCTP,
  fallback indeterminate cuando el puerto destino no está especificado contra una regla restringida.
- **Isolation Engine:** Default Deny Ingress/Egress, Default Allow, agregación aditiva de políticas
  y verificación de doble dirección (`Egress_src ∧ Ingress_dst`).
- **Data State:** derivación fail-closed del estado de evaluación a partir del estado real de los
  stores y de la conectividad real del clúster, con causa explícita
  (`cluster-disconnected`, `cluster-connecting`, `cluster-inaccessible`, `store-permission-denied`,
  `store-partial`, `store-loading`, `store-unavailable`).
- **Reactividad (nuevo):** firmas de contenido por colección y seguimiento de frescura **por store**;
  las pruebas de transición mantienen las MISMAS instancias observables mientras cambian sus estados.
- **Frescura por store (nuevo):** cada store se rastrea por separado. Un store sólo se certifica
  como fresco por una entrega de **sus propios** recursos o por una **recarga confirmada** de ese
  store (`isLoading` true → false). Un cambio exclusivo de otro store nunca lo certifica. Tras un
  cambio de clúster, cada store exige su propia recarga confirmada antes de volver a ser
  evaluable.
- **Matriz (nuevo):** presupuesto explícito de conexiones, resultado marcado como parcial con el
  conteo exacto de omisiones, y dimensión de puertos *otros puertos*.
- **Resilience & Scale:** fail-closed en `loading`, `disconnected`, `permission-denied` (RBAC 403),
  `partial-data` y `unknown`; benchmark de 1.000 Pods y de 1.000 Pods concentrados en un único
  namespace.

---

## 4. Targeted Static Analysis (ESLint & TypeScript)

### 4.1 ESLint dirigido

```bash
cd packages/core && npx eslint --max-warnings 0 \
  src/renderer/components/network-policies/engine \
  src/renderer/components/network-policies/matrix \
  src/renderer/components/network-policies/network-policy-details.tsx \
  src/renderer/components/network-policies/__tests__/network-policy-matrix.test.tsx \
  src/renderer/components/workloads-pods/details/pod-network-policies.tsx \
  src/renderer/components/workloads-pods/__tests__/pod-network-policies.test.tsx \
  src/renderer/components/workloads-pods/pod-details.tsx
```

**Resultado: 0 errores, 0 advertencias.**

### 4.2 TypeScript — errores propios vs. preexistentes

```bash
cd packages/core && npx tsc --noEmit -p tsconfig.json
```

**Resultado: 0 errores en archivos de R7-05.** Permanecen **14 errores preexistentes**, todos en
código de `workloads-deployments` / `workloads-deployments/rollout` / `controller-revision.api.ts`,
ajenos a este hito:

| Error | Archivos |
|---|---|
| `TS2305: Module '"@openlens/kube-object"' has no exported member 'ControllerRevision'` | `common/k8s-api/endpoints/controller-revision.api.ts`, `workloads-deployments/rollout/controller-revisions.tsx` (+ test) |
| `TS2339: Property 'paused' / 'revisionHistoryLimit' does not exist on type 'DeploymentSpec'` | `deployment-details.tsx`, `deployment-menu.tsx` (+ test), `deployment-replicasets.tsx`, `rollout/dialog.tsx`, `rollout/prepare-rollback.ts` |

**Causa raíz verificada** (`tsc --traceResolution`): el paquete `@openlens/kube-object` se resuelve
a **dos** artefactos distintos según el archivo importador — el `dist` del propio worktree para
`packages/core/src/common/k8s-api/...` y el `dist` del repositorio principal
(`/Users/gustavomarcon/Documents/lens/packages/kube-object/dist`) para el resto. El `dist` del
repositorio principal pertenece a un upstream más viejo y no contiene `ControllerRevision` ni
`DeploymentSpec.paused`. Es una condición de **hoisting/resolución de tipos del monorepo**, no un
defecto introducido por R7-05; reproducida compilando **sin** los archivos de R7-05 (mismos 14
errores). No se modificó `lens-r4` para resolverlo, por restricción explícita del hito.

### 4.3 `git diff --check`

```bash
git diff --check   # incluye untracked vía --intent-to-add
```

**Resultado: limpio (0 whitespace errors).**

---

## 5. Playwright Synthetic Harness Verification & Screenshot Evidence

| Campo | Valor |
|---|---|
| Test Runner | `docs/revival/scripts/verify-r7-05-networkpolicy-matrix.cjs` |
| Browser | Google Chrome for Testing (Chromium 1243) |
| Environment | Synthetic Kubernetes API Server on `127.0.0.1:45678` |
| Evidence Directory | `docs/revival/evidence/r7-05/` |
| Ejecución | Re-ejecutada **después** de las correcciones de auditoría |

| Checkpoint | Status | Description | Captured Artifact |
|---|---|---|---|
| **01. Matrix Render** | PASS | Full traffic matrix rendered with headers, badges, and disclaimer | `01-network-policy-matrix-all.png` |
| **02. Pod Search Filter** | PASS | Text search filter isolates matching Pod connections | `02-filter-by-pod.png` |
| **03. Direction & Verdict Filter** | PASS | Dropdown filters restrict rows to Ingress Allowed | `03-filter-by-direction-verdict.png` |
| **04. Rule Explanation Inspection** | PASS | Detail tooltips explain matched policy name and rule logic | `04-rule-explanation-detail.png` |
| **05. Pod Details (Backend Pod)** | PASS | Shows Ingress Isolation and links to selecting policies | `05-pod-details-isolation-backend.png` |
| **06. Pod Details (Quarantined Pod)** | PASS | Shows dual Ingress + Egress Default Deny isolation | `06-pod-details-isolation-worker.png` |
| **07. Expandable Traffic Matrix** | PASS | Inline toggle opens embedded matrix scoped to focused Pod | `07-pod-traffic-matrix-expanded.png` |
| **08. Indeterminate Handling** | PASS | Unresolvable named ports yield strict Indeterminate verdict | `08-indeterminate-connection.png` |
| **09. RBAC 403 Simulation** | PASS | Displays warning banner and prevents false allowed results | `09-rbac-partial-data-state.png` |
| **10. Zero Mutations Audit** | PASS | Verified 100% read-only operations (0 mutations out of 4 requests) | `10-zero-mutations-audit.png` |

---

## 6. Verification Metadata (`R7_05_VERIFICATION.json`)

- `docs/revival/evidence/r7-05/R7_05_VERIFICATION.json`
- `docs/revival/R7_05_VERIFICATION.json`

---

## 7. Matriz de resolución de hallazgos de auditoría

| # | Hallazgo | Resolución | Evidencia |
|---|---|---|---|
| 1 | Store ausente o no inicializado podía producir *Default Allow* | `engine/data-state.ts`: estado `unknown` → `INDETERMINATE`; tests negativos en componente y motor | `data-state.test.ts` (15 tests), `network-policy-matrix.test.tsx` (store ausente y store no inicializado) |
| 2 | Propiedad ficticia `clusterDisconnected` | Conectividad tomada del modelo `Cluster` real vía `hostedClusterInjectable` (`disconnected`/`online`/`accessible`) | `network-policy-matrix.test.tsx` y `pod-network-policies.test.tsx` (banner de desconexión con `cluster` real) |
| 3 | Resultados no invalidados al cambiar de clúster | `clusterId` en el contexto de evaluación + reset de filtros y paginación al cambiar de clúster | `network-policy-matrix.test.tsx` ("invalidates the results when the cluster changes") |
| 4 | Truncado silencioso de 150 candidatos externos | Candidatos sin truncar; presupuesto explícito con resultado marcado `isPartial` y conteo exacto de omisiones | `engine.test.ts` ("does not silently drop peer pods of other namespaces", "honours an explicit connection budget exactly", "evaluates 1,000 Pods concentrated in a single namespace") |
| 5 | Puerto declarado vs. puertos potencialmente accesibles | `portScope` (`declared`/`all`/`other`); la fila *otros puertos* nunca afirma permiso parcial | `engine.test.ts` ("evaluates the 'other ports' dimension without certifying a partial permission"), `network-policy-matrix.test.tsx` ("distinguishes container declared ports from the remaining accessible ports") |
| 6 | Namespace placeholder sin labels evaluado como "no coincide" | Placeholder de `NamespaceStore` (sin uid) → `indeterminate` | `engine/peer-evaluator.ts` + suite del motor |
| 7 | Falta de pruebas negativas (datos parciales, RBAC, cambio de clúster) | 6 tests negativos nuevos en motor y componentes | `engine.test.ts`, `data-state.test.ts`, `network-policy-matrix.test.tsx`, `pod-network-policies.test.tsx` |
| 9 | Memoización por identidad: stores y colecciones con identidad estable producían resultados obsoletos | La evaluación se memoiza por **firma de contenido**; el estado se deriva de lecturas reactivas en cada render | `network-policy-matrix-transitions.test.tsx` (8 transiciones) |
| 10 | `disconnected === false` se interpretaba como clúster listo | Se distinguen desconexión explícita, conexión en progreso e inaccesibilidad | `data-state.test.ts`, `network-policy-matrix-transitions.test.tsx`, `pod-network-policies-transitions.test.tsx` |
| 11 | Permisos definitivos con datos obsoletos tras perder conexión | `DataFreshnessTracker` fuerza estado indeterminado hasta recibir recursos frescos o cambiar de clúster | `network-policy-matrix-transitions.test.tsx` ("does not certify permissions from stale data…") |
| 12 | La firma conjunta de frescura certificaba los stores con un cambio exclusivo de otro store | Seguimiento **por store** con señales verificables de carga (`isLoading` true → false) y contenido; el `clusterId` se aísla por store | `data-state.test.ts` ("never certifies a store through a change exclusive to another store"), `network-policy-matrix-transitions.test.tsx` (8 pruebas de frescura por store) |
| 13 | `updateStore()` podía devolver `stale = false` con `connectionLost = true` (por cambio de contenido o por una carga finalizada durante el corte) y una carga fallida podía certificar datos frescos | Precedencia corregida: la conexión perdida mantiene `stale = true` sin excepciones, la señal de carga se descarta durante el corte y una carga fallida/abortada nunca certifica | `data-state.test.ts` ("keeps the data stale when the content changes while the connection is lost", "keeps the data stale when a load finishes during the disconnection", "does not certify a store when the reload failed"), `network-policy-matrix-transitions.test.tsx` (3 reproducciones a nivel de componente) |
| 8 | Documentación declarando certificación | Estado honesto: *NO CERTIFICADO GLOBALMENTE*, tiers explícitos, errores preexistentes differentiated | Este documento + `R7_05_SECURITY_REVIEW.md` |

---

## 8. Limitaciones declaradas

- No se ejecutó Tier 3 (Electron empaquetado) ni Tier 4 (clúster real).
- La evaluación sigue siendo **declarativa**: los plugins CNI, el enrutamiento de Services, los
  firewalls de host y los Service Meshes pueden aplicar restricciones adicionales.
- El presupuesto de 2.000 conexiones por construcción de matriz es un límite **explícito y
  visible**; acota el volumen evaluado, nunca la veracidad de lo evaluado.
- La resolución de tipos de `@openlens/kube-object` depende del hoisting del monorepo (ver §4.2).
