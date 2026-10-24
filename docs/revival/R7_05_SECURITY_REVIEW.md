# OpenLens DevOps Revival — R7-05 Security Review

| Campo | Valor |
|---|---|
| Milestone | R7-05 — Visualizador y Matriz de NetworkPolicies |
| Worktree Directory | `/Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix` |
| Branch | `feat/r7-05-networkpolicy-matrix` |
| Review Date | 2026-10-24 |
| Security Status | **IMPLEMENTADO — PRECEDENCIA DE FRESCUEZ CORREGIDA — NO CERTIFICADO GLOBALMENTE** (100% Read-Only, Fail-Closed, Non-Mutating) |

---

## 0. Ámbito de Certificación y Separación de Niveles

Para garantizar transparencia operacional y auditoría independiente, las pruebas se clasifican estrictamente en 4 niveles:
1. **Jest Unit Tests:** 10 suites / 149 tests PASS (todas las suites de R7-05). Valida CIDR bitwise, LabelSelector, resolución de puertos, semántica de peers, derivación de estado de stores, firmas de contenido, frescura de datos y fail-closed.
2. **Playwright sobre Harness React Sintético:** 10/10 checkpoints PASS en navegador Chromium con fixtures locales (`127.0.0.1:45678`). Cero mutaciones. Re-ejecutado tras las correcciones de auditoría.
3. **Playwright sobre Electron Empaquetado:** No ejecutado para preservar almacenamiento y no recompilar el monorepo.
4. **Integración con Stores Kubernetes Reales:** Integrada con estado real de stores (`isLoaded`/`isLoading`/`failedLoading`) y con el estado real de conexión del clúster (modelo `Cluster`). Fail-closed ante 403, loading, desconexión, datos parciales y store ausente/no inicializado. Requiere validación en clúster real antes de certificación global.

**Regresión del monorepo (paquete `core`):** 133 suites / 1059 tests — 131 PASS, 2 FAIL por deriva de
snapshot preexistente (`status-bar`, `config-horizontal-pod-autoscalers`), sin dependencia alguna con
R7-05. Detalle en `R7_05_VALIDATION.md` §3.

## 1. Threat Modeling & Scope Boundaries

The primary objective of R7-05 is to diagnose Kubernetes network policy connectivity **without introducing security risks, cluster state drift, or mutation hazards**.

### 1.1 Strictly Prohibited Actions (Zero-Tolerance Checklist)
- [x] **NO POST requests:** No creation of synthetic NetworkPolicies, Pods, or test resources.
- [x] **NO PUT/PATCH requests:** Zero mutation to existing `networking.k8s.io/v1` or workload specifications.
- [x] **NO DELETE requests:** Zero deletion or cleanup routines touching cluster objects.
- [x] **NO Exec/Attach commands:** No probing commands executed inside user pods (e.g., `nc`, `curl`, `ping`).
- [x] **NO CNI Configuration tampering:** No interaction with node daemons or CNI interfaces.
- [x] **NO Automatic Remediation:** The tool analyzes and presents; it never auto-generates or applies policies without operator control.

---

## 2. Verification of Read-Only Operations

During the Playwright automated E2E audit (`docs/revival/scripts/verify-r7-05-networkpolicy-matrix.cjs`), a local synthetic Kubernetes API server captured all HTTP interactions across all test checkpoints.

### HTTP Method Audit Results:
- **Total Requests Recorded:** 4
- **GET / LIST / WATCH Requests:** 4 (100%)
- **POST Requests:** 0
- **PUT Requests:** 0
- **PATCH Requests:** 0
- **DELETE Requests:** 0
- **Mutation Violation Count:** **0**

---

## 3. RBAC 403 & Partial Data Resilience

A critical security vulnerability in diagnostic tools is generating false-positive "Security Allowed" or "Security Blocked" assertions when the underlying data is incomplete or access is denied.

### Defensive Design Guarantees:
- **Store ausente o no inicializado ⇒ INDETERMINATE:** la evaluación nunca se apoya en "no hay
  políticas" cuando el listado es desconocido; un store que nunca cargó produce estado `unknown`.
- **Permisos no certificables sobre listados incompletos:** con `partial-data`, un permiso que
  provenga de un *Default Allow* (ninguna política listada selecciona el Pod) se degrada a
  `indeterminate`; sólo sobreviven los permisos respaldados por una regla explícitamente listada,
  porque las políticas ausentes únicamente pueden *agregar* permisos, nunca revocarlos.
- **Conectividad auténtica:** el estado de desconexión proviene del modelo `Cluster` real
  (`hostedClusterInjectable`), no de una propiedad ad-hoc de los stores.
- **Invalidación por cambio de clúster:** el `clusterId` forma parte del contexto de evaluación; al
  cambiar de clúster se descartan filtros, paginación y resultados previos.
- **Omisiones cuantificadas:** el presupuesto explícito de conexiones de la matriz nunca trunca en
  silencio; la UI declara cuántas conexiones no se evaluaron.
- **Conectividad real:** un clúster inaccesible (`accessible === false`) no se trata como listo
  aunque `disconnected === false`; la desconexión explícita, la conexión en progreso y la
  inaccesibilidad son estados distintos y cada uno tiene su propio aviso.
- **Datos obsoletos:** tras perder la conexión, los recursos que los stores conservan no se
  presentan como permisos definitivos; la evaluación degrada a indeterminada hasta recibir
  recursos frescos. El seguimiento es **por store**: la frescura de las NetworkPolicies no puede
  certificarse mediante cambios exclusivos de Pods o Namespaces, y cada store debe confirmar su
  propia recarga antes de volver a ser evaluable. Una conexión perdida mantiene el estado
  obsoleto **sin excepciones** (ni un cambio de contenido ni una carga finalizada durante el corte
  pueden certificarlo) y una carga fallida o abortada jamás certifica datos frescos.
- **Sin resultados obsoletos por memoización:** la evaluación se invalida cuando cambian los
  contenidos de los stores, aunque conserven la identidad de instancia y de colección.

1. **RBAC 403 on Pods:**
   - When the user lacks RBAC permissions to list pods (`lastError.statusCode === 403` or `failedLoading === true`), the component displays the prominent alert banner:
     `Acceso restringido (RBAC 403): Permisos insuficientes para listar recursos necesarios. La evaluación se presenta como indeterminada.`
   - No speculative connections are marked as `allowed`.
2. **RBAC 403 on Namespaces:**
   - If namespaces cannot be listed, `namespaceSelector` evaluation cannot verify namespace labels.
   - Any rule dependent on `namespaceSelector` evaluates as `indeterminate`.
   - The UI displays: `Datos parciales: La lista de Namespaces o Pods no está completa.`
3. **Unresolvable Named Ports:**
   - If a rule references a named port (e.g. `http-api`) that is missing from the destination pod's container definitions, the flow is categorized as `indeterminate`, rather than defaulted to open or closed.

---

## 4. Operational Limitations & Reality Disclaimer

A fundamental architectural principle of R7-05 is informing operators that **"Permitido por políticas" does not guarantee physical network connectivity**.

The UI displays this warning persistently:
> **Aviso de limitaciones:** "Permitido por políticas" refleja únicamente las reglas declaradas en las NetworkPolicies de Kubernetes y no equivale a conectividad física real garantizada (los plugins CNI, enrutamiento de Services, firewalls de host o Service Mesh pueden aplicar restricciones adicionales).

### Factors Beyond NetworkPolicy Scope:
1. **CNI Implementation:** If the cluster runs a CNI plugin that does not support NetworkPolicies (such as basic Flannel without Canal/Calico), Kubernetes will accept NetworkPolicies without enforcing them.
2. **Service ClusterIP Routing:** Traffic routed through a `Service` is subject to kube-proxy / iptables / IPVS translation; egress rules must allow traffic to the Service CIDR or Pod IPs depending on CNI implementation.
3. **Node & Host Firewalls:** Cloud security groups (AWS SG, GCP VPC firewall, Azure NSG) and host iptables rules can drop packets independently.
4. **Service Meshes (mTLS):** Istio, Linkerd, or Cilium Service Mesh can reject connections at Layer 7 despite Layer 3/4 NetworkPolicy authorization.

By explicitly stating these boundaries in the UI and documentation, operators are protected from false operational confidence during critical incident triage.
