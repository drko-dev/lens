# OpenLens DevOps Revival — R7-05 Implementation Details

| Campo | Valor |
|---|---|
| Milestone | R7-05 — Visualizador y Matriz de NetworkPolicies |
| Worktree Directory | `/Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix` |
| Branch | `feat/r7-05-networkpolicy-matrix` |
| Base HEAD | `6ea8bb41eb9797939ecc6d9c0da6c902017cb6f4` |
| Date | 2026-10-24 |
| Status | **IMPLEMENTADO — PRECEDENCIA DE FRESCUEZ CORREGIDA — NO CERTIFICADO GLOBALMENTE** |
| Commit | **NINGUNO** (checkpoint local pendiente de autorización) |

---

## 1. Inventory of Code Modifications and Additions

### 1.1 Pure Engine Modules (`packages/core/src/renderer/components/network-policies/engine/`)
1. [`types.ts`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/network-policies/engine/types.ts): Data contracts including `PolicyVerdict`, `DataEvaluationState`, `EvaluatedPeer`, `EvaluatedConnection`, `PodIsolationStatus`, and `PolicyEvaluationContext`.
2. [`cidr.ts`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/network-policies/engine/cidr.ts): Bitwise CIDR matching for IPv4 (`BigInt(32)`) and IPv6 (`BigInt(128)`), subnet mask bounds validation, and `except` exclusion calculation.
3. [`selector.ts`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/network-policies/engine/selector.ts): Kubernetes LabelSelector matcher supporting `matchLabels` and `matchExpressions` (`In`, `NotIn`, `Exists`, `DoesNotExist`) and empty selector `{}` catch-all.
4. [`port-resolver.ts`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/network-policies/engine/port-resolver.ts): Numeric port matching, `endPort` range evaluation, container named port resolution against destination pod specs, and indeterminate fallback.
5. [`peer-evaluator.ts`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/network-policies/engine/peer-evaluator.ts): NetworkPolicy peer evaluation (`ipBlock`, `podSelector`, `namespaceSelector`, logical `AND` combination, logical `OR` alternatives).
6. [`engine.ts`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/network-policies/engine/engine.ts): Core orchestration evaluating pod isolation, additive policy union, dual-direction connection evaluation, granular port extraction for matrix display, and human-readable explanation generation.
7. [`index.ts`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/network-policies/engine/index.ts): Clean barrel export of all engine types and functions.
8. [`data-state.ts`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/network-policies/engine/data-state.ts): Derivación **fail-closed** del estado de evaluación a partir del estado real de los stores (`isLoaded`, `isLoading`, `failedLoading`, `lastError.statusCode === 403`) y de la conectividad real del clúster (`disconnected`, `online`, `accessible`). Un store ausente o no inicializado nunca se interpreta como "no hay datos": produce estado `unknown` → `INDETERMINATE`. Incluye el adaptador `toClusterConnectionState()` (acepta booleanos planos y `observable.box`), las **firmas de contenido** (`computeItemsSignature`) y el **rastreador de frescura** (`DataFreshnessTracker`).

### 1.2 Presentation Components & Integration
> Nota de arquitectura: la conectividad del clúster **no** es una propiedad de los stores. El modelo
> `Cluster` (common/cluster/cluster.ts) expone `disconnected`, `online`, `accessible` e `id`, y se
> inyecta en los componentes con `hostedClusterInjectable`. La propiedad ficticia `clusterDisconnected`
> fue eliminada de la API de los componentes.
1. [`network-policy-matrix.tsx`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/network-policies/matrix/network-policy-matrix.tsx): Reactive matrix component with search filter, namespace filter, direction filter, verdict filter, explanation tooltips, and RBAC 403 / partial data banners.
2. [`network-policy-matrix.scss`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/network-policies/matrix/network-policy-matrix.scss): Midnight Graphite stylesheet with 33px compact row height, accessible contrast badges, and responsive overflow controls.
3. [`network-policy-details.tsx`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/network-policies/network-policy-details.tsx): Drawer integration below Ingress/Egress spec cards with safe DI fallback (`props.podStore ?? podStore`).
4. [`pod-network-policies.tsx`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/workloads-pods/details/pod-network-policies.tsx): Pod Details drawer section showing Ingress and Egress isolation status badges, clickable links to selecting NetworkPolicies, and toggleable inline traffic matrix.
5. [`pod-network-policies.scss`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/workloads-pods/details/pod-network-policies.scss): Pod details styling matching OpenLens DevOps drawer aesthetics.
6. [`pod-details.tsx`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/workloads-pods/pod-details.tsx): Mounted `<PodNetworkPolicies pod={pod} />` directly below Pod resource metrics and above Pod volumes.

### 1.3 Test Suites & Verification Harness
1. [`cidr.test.ts`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/network-policies/engine/__tests__/cidr.test.ts): 11 Jest unit tests for IPv4/IPv6 CIDR math, boundary masks, and exception sets.
2. [`selector.test.ts`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/network-policies/engine/__tests__/selector.test.ts): 9 Jest unit tests for `matchLabels`, `matchExpressions`, and empty `{}` catch-all.
3. [`port-resolver.test.ts`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/network-policies/engine/__tests__/port-resolver.test.ts): 11 Jest unit tests for TCP/UDP/SCTP, named ports, `endPort` ranges, and missing container fallbacks.
4. [`engine.test.ts`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/network-policies/engine/__tests__/engine.test.ts): 38 Jest unit tests covering Default Deny, additive aggregation, cross-namespace rules, dual-direction authorization, missing metadata, explicit evaluation budget, partial disclosure, the `other ports` dimension and scalability (1.000 Pods, incluidos 1.000 Pods concentrados en un namespace).
5. [`data-state.test.ts`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/network-policies/engine/__tests__/data-state.test.ts): 15 Jest unit tests for store load-state derivation and fail-closed evaluation-state precedence.
6. [`network-policy-matrix.test.tsx`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/network-policies/__tests__/network-policy-matrix.test.tsx): 13 Jest tests for matrix UI rendering, filters, RBAC resilience, absent/uninitialized stores, cluster-switch invalidation, partial-analysis disclosure and the declared-vs-other ports distinction.
7. [`network-policy-details.test.tsx`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/network-policies/__tests__/network-policy-details.test.tsx): 3 regression Jest tests.
8. [`pod-network-policies.test.tsx`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/packages/core/src/renderer/components/workloads-pods/__tests__/pod-network-policies.test.tsx): 8 Jest tests for Pod Details isolation badges, absent/uninitialized store handling and matrix toggle.
8. [`verify-r7-05-networkpolicy-matrix.cjs`](file:///Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix/docs/revival/scripts/verify-r7-05-networkpolicy-matrix.cjs): End-to-end Playwright runner verifying all 10 milestones checkpoints and validating zero API mutations.

---

## 2. Key Algorithms and Data Flow

### 2.1 Pod Isolation Determination
A Pod is evaluated as isolated if any active NetworkPolicy in the same namespace matches its `spec.podSelector`:
```ts
export function getPodIsolationStatus(pod: Pod, policies: NetworkPolicy[]): PodIsolationStatus {
  const ns = pod.getNs();
  const selectingPolicies: NetworkPolicy[] = [];
  let isIngressIsolated = false;
  let isEgressIsolated = false;

  for (const policy of policies) {
    if (policy.getNs() !== ns) continue;
    if (isPodSelectedByPolicy(pod, policy)) {
      selectingPolicies.push(policy);
      const types = getEffectivePolicyTypes(policy);
      if (types.includes("Ingress")) isIngressIsolated = true;
      if (types.includes("Egress")) isEgressIsolated = true;
    }
  }

  return { isIngressIsolated, isEgressIsolated, selectingPolicies };
}
```

### 2.2 Veredicto por dirección y certificabilidad (`allowedVia`)

Cada dirección (Egress del origen, Ingress del destino) devuelve un veredicto junto con su
origen semántico:

| `allowedVia` | Significado | ¿Certificable con datos parciales? |
|---|---|---|
| `matched-rule` | Una regla de una política **listada** coincidió | **Sí** — las políticas ausentes sólo pueden *agregar* permisos, nunca revocarlos |
| `default-allow` | El Pod no aparece aislado porque ninguna política listada lo selecciona | **No** — una política ausente podría seleccionarlo y bloquearlo |
| `not-applicable` | La dirección no aplica a ese peer (IP/externo) | Sí (semántico, no dependiente de datos) |

Con `state === "partial-data"`, el veredicto combinado sólo queda `allowed` cuando **ambas**
direcciones son certificables; en caso contrario el resultado es `indeterminate` con la razón
explicita. Éste es el mecanismo que impide afirmar un permiso sobre listados incompletos.

### 2.3 Memoización reactiva (firmas de contenido)

Los stores de Kubernetes conservan la identidad de la instancia y de su colección aunque cambien sus
contenidos, por lo que una memoización por identidad sirve datos obsoletos. La evaluación se
memoiza con una **firma de contenido** calculada sobre la colección:

| Parte de la firma | Detecta |
|---|---|
| Longitud de la colección | Altas y bajas de recursos |
| Token por instancia | Recursos re-entregados por el store (recargas) aunque conserven id y `resourceVersion` |
| `id@resourceVersion` | Actualizaciones servidas por el API server |
| Labels | Cambios de selectores aplicables |
| Spec (sólo NetworkPolicies) | Cambios de reglas de la política |

El estado de evaluación y la conectividad se derivan en cada render mediante lecturas reactivas
(el componente es un `observer`), de modo que un cambio de `isLoaded`, `isLoading`,
`failedLoading`, `lastError` o de los flags del cluster re-renderiza la vista aunque las
referencias permanezcan iguales.

**Frescura por store.** La frescura se rastrea de forma independiente para `PodStore`,
`NamespaceStore` y `NetworkPolicyStore`:

| Señal verificable | Efecto |
|---|---|
| Firma de contenido de **ese** store (conexión sana) | El store entregó recursos nuevos: deja de estar obsoleto |
| `isLoading` true → false de **ese** store, sin fallo | Recarga verificada: deja de estar obsoleto aunque el contenido sea idéntico |
| `failedLoading` / `lastError` presentes | Carga fallida o abortada: **nunca** certifica datos frescos |
| Pérdida de conexión (`disconnected` u `online === false`) | **Todos** los stores pasan a obsoletos y **no** pueden salir de ese estado mientras la conexión siga perdida |
| Cambio de `clusterId` | **Todos** los stores pasan a obsoletos y cada uno exige su propia recarga confirmada |

**Precedencia.** La conexión perdida manda sobre cualquier otra señal: durante el corte, ni un
cambio de contenido ni una carga que finaliza (señal `isLoading` true → false) pueden limpiar la
obsoleticidad, y la señal de carga se descarta para que el store deba iniciar una recarga nueva
tras la reconexión. Una carga fallida o abortada tampoco certifica. Al recuperar la conexión se
exige una **actualización válida del propio store** o una **recarga exitosa verificada**.

Un cambio exclusivo de un store (por ejemplo, sólo Pods) no puede certificar la frescura de otro:
la evaluación permanece indeterminada hasta que ese store confirme su propia recarga.

### 2.4 Conectividad real y frescura de los datos

El modelo `Cluster` expone tres señales distintas que se interpretan por separado:

| Señal | Significado | Estado derivado |
|---|---|---|
| `disconnected === true` | Desconexión explícita (el usuario la desactivó o se perdió el enlace) | `disconnected` |
| `online === false` | El clúster todavía no respondió: conexión en progreso | `loading` |
| `accessible === false` | El clúster responde pero el acceso no fue concedido | `permission-denied` |

`disconnected === false` **no** implica que el clúster esté listo. Tras perder la conexión, los
stores conservan los últimos recursos: `DataFreshnessTracker` los marca como obsoletos (y también
cuando cambia la identidad del clúster) y la evaluación degrada a `unknown` → `INDETERMINATE`
hasta que el store entrega recursos frescos.

### 2.5 Dual-Direction Flow Authorization
When evaluating whether Pod $S$ can communicate with Pod $D$ on port $P$ and protocol $T$:
1. If $S$ is **Egress isolated**, inspect all policies selecting $S$. If no rule permits outbound traffic to $D$ on $(P, T)$, egress is **blocked**.
2. If $D$ is **Ingress isolated**, inspect all policies selecting $D$. If no rule permits inbound traffic from $S$ on $(P, T)$, ingress is **blocked**.
3. If both directions permit traffic (or were not isolated), traffic evaluates as **`allowed`**.
4. If missing namespace metadata or unresolvable named ports prevent verification, the flow strictly evaluates as **`indeterminate`**.

---

## 3. Performance & Memory Management

1. **Sin truncado silencioso de candidatos:**
   - `buildPolicyMatrix()` evalúa **todos** los peers visibles (incluidos otros namespaces): una
     política con reglas de scope de namespace sigue denegando (o permite) el tráfico desde otros
     namespaces, y ocultar esas filas falsearía la política efectiva.
2. **Presupuesto explícito de conexiones:**
   - `DEFAULT_MAX_MATRIX_CONNECTIONS = 2000` (configurable por prop `maxConnections`). Al alcanzar
     el presupuesto, la construcción se detiene y el resultado se marca `isPartial: true` con
     `partialReason` y el conteo exacto (`totalPossibleConnections`, `totalEvaluated`). La UI
     muestra el banner *Análisis parcial* con esa información. No hay omisiones invisibles.
3. **Memoización del aislamiento por pasada de evaluación:**
   - `getIsolationStatus()` cachea `PodIsolationStatus` por Pod durante una pasada, evitando
     recalcular `matchesSelector` contra todas las políticas por cada conexión evaluada.
4. **Memoized Namespace Lookup:**
   - Pre-indexa `context.namespaces` en un `Map<string, Namespace>` para eliminar búsquedas
     lineales repetidas durante la evaluación de peers.
5. **Paginación real en la UI:**
   - 50 filas por página con paginación efectiva, filtros (texto, namespace, dirección, veredicto)
     y contador de conexiones filtradas sobre el total evaluado.
6. **Alcance por namespace:**
   - El filtro de namespace se propaga como `scopeNamespace` al motor, que evalúa sólo ese alcance
     y declara en `partialReason` cuántos Pods quedaron fuera por el recorte explícito.
