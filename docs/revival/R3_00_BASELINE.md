# OpenLens DevOps Revival — R3-00 Baseline Report
**Resguardo del trabajo, baseline R2 y arquitectura Kubernetes moderno**

- **Fecha:** 20 de Octubre de 2026
- **Rama:** `feat/openlens-devops-revival`
- **Git HEAD:** `8838ac308bf4cc70a9911f7cdbc28e919f83fb2a`
- **Ambiente de ejecución:** Node.js v20.20.2 / npm v10.8.2 / macOS ARM64 (Darwin 27.0.0)
- **Estado de salida:** APROBADO (Resguardo de documentación verificado fuera del repo, baseline R2 congelado, auditoría de arquitectura completada y matriz de compatibilidad establecida)

---

## 1. Protección del Trabajo y Registro de Respaldo

### A. Diagnóstico de Estado de Git
- **Rama actual:** `feat/openlens-devops-revival`
- **Git HEAD:** `8838ac308bf4cc70a9911f7cdbc28e919f83fb2a`
- **Espacio en disco:** 26 GiB disponibles en `/System/Volumes/Data`.
- **Condición crítica de `docs/revival`:**
  - Comando: `git ls-files docs/revival | wc -l` devolvió `0`.
  - Los 63 archivos de análisis, catálogo, evidencias y reportes de validación de R1 y R2 residían en estado *untracked*, expuestos a pérdida irreparable ante un `git clean -fd` o descarte accidental.

### B. Creación y Verificación del Respaldo Externo
Se ejecutó una copia de seguridad no destructiva en archivo comprimido tar.gz fechado, completamente fuera del árbol del repositorio:
- **Ruta principal de backup:**  
  `/Users/gustavomarcon/.openlens-devops-backups/docs-revival-backup-20261020-r3-00.tar.gz`
- **Ruta espejo en scratch:**  
  `/Users/gustavomarcon/.gemini/antigravity-cli/brain/ba84486b-9880-408b-b881-27b46f839ee5/scratch/backups/docs-revival-backup-20261020-r3-00.tar.gz`
- **Integridad y Verificación:**
  - **SHA-256:** `f4853a4bc5cbac613c9280fa42a8c99e669708b5b3cfc34111f3a06a64cae6aa`
  - **Tamaño:** 2.8 MB
  - **Entradas verificadas (`tar -ztvf`):** 67 elementos (todos los 63 archivos y directorios de evidencias y screenshots).
- **Procedimiento de restauración:**
  ```bash
  tar -xzf /Users/gustavomarcon/.openlens-devops-backups/docs-revival-backup-20261020-r3-00.tar.gz -C /Users/gustavomarcon/Documents/lens/lens/
  ```

### C. Propuesta de Commits Selectivos (Sin Ejecución Automática)
Para dotar al repositorio de un historial reproducible sin alterar el working tree sin consentimiento, se recomienda al usuario aplicar en su momento la siguiente serie lógica de commits:
1. `docs(revival): add R1 and R2 verification reports, roadmaps, and evidence`: seguimiento de `docs/revival/`.
2. `feat(core): implement R1 concurrency protection, inline secrets/configmaps, and safe proxy`: cambios de R1.
3. `feat(ux): implement R2 cluster appearance, diff editor, logs search, terminal resilience, and csv export`: cambios de R2.

---

## 2. Registro de Baseline R2

- **Binario de Referencia:**  
  `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`
- **Integridad del empaquetado:**  
  `Contents/Resources/app.asar` SHA-256: `f9b2c6f7d1d14789954886d36459f1e254dfedf98bafafa53af3120d7f12629d`
- **Identidad de Aplicación:**
  - `name`: `"OpenLens DevOps"`
  - `appId`: `"dev.drko.openlens-devops"`
  - `userData`: aislado en `~/Library/Application Support/OpenLens DevOps` (no colisiona con Lens comercial ni OpenLens vanilla).
- **Procesos en Ejecución:** Instancia previa en `/Users/gustavomarcon/Documents/lens/lens/open-lens/dist/mac-arm64/OpenLens DevOps.app` (PIDs protegidos, sin interrupciones).
- **Batería de Pruebas de Regresión Aprobada:**
  - **Release 2:** 16 suites / 101 tests (100% PASS).
  - **Release 1:** 11 suites / 105 tests (100% PASS).
  - **Total:** 27 suites / 206 pruebas automatizadas passing.

---

## 3. Auditoría de Arquitectura para Nuevas Integraciones

### A. Descubrimiento de APIs y Conexión de Clúster
- **`request-api-resources.injectable.ts`:**
  - Ejecuta `request-core-api-versions` (`/api`, retornando `['v1']`) y `request-non-core-api-versions` (`/apis`, descubriendo todos los grupos activos: `apps`, `batch`, `networking.k8s.io`, `discovery.k8s.io`, `gateway.networking.k8s.io`, etc.).
  - Aplica `withConcurrencyLimit(5)` y reintentos exponenciales con `backoffCaller`.
  - Tratamiento de fallos parciales: si un grupo de APIs falla o retorna 403, emite una advertencia no bloqueante (`broadcastConnectionUpdate`), permitiendo que el resto del clúster funcione normalmente.
- **`cluster-connection.injectable.ts` y Control de Visibilidad:**
  - Valida permisos de usuario por namespace vía `requestNamespaceListPermissions` (`createCanIInjectable`).
  - Puebla reactivamente `cluster.resourcesToShow` con los identificadores canónicos `group/apiName` o `apiName`.
  - El injectable `should-show-resource` consulta en tiempo real si `cluster.resourcesToShow.has(...)`. Si el clúster carece del recurso o el usuario carece de permisos RBAC para listarlo, la sección de la interfaz se oculta limpiamente sin arrojar errores.

### B. Gestión de CRDs y Stores Dinámicos
- **`ApiManager` (`packages/core/src/common/k8s-api/api-manager`):**
  - Mapea de forma reactiva `apiBase` a instancias de `KubeApi`.
  - Soporta registro dinámico de APIs externas y CRDs (`defaultCrdStores`), creando stores genéricos bajo demanda.
  - No requiere codificar un controlador en background para cada CRD; las vistas pueden montarse consumiendo `KubeObject` y `KubeObjectStore` genéricos.

### C. Estado Actual de Endpoints Core de Kubernetes
| Endpoint / Recurso | Archivo en Codebase | Versiones soportadas | Diagnóstico |
|---|---|---|---|
| **PodSecurityPolicy** | `pod-security-policy.api.ts` | `policy/v1beta1` | Obsoleto/removido en K8s 1.25+. Debe retirarse del sidebar y navegación principal manteniendo lectura de fallback segura. |
| **HorizontalPodAutoscaler** | `horizontal-pod-autoscaler.api.ts` | `autoscaling/v2`, `v2beta2`, `v2beta1`, `v1` | Implementa `allowedUsableVersions` y `checkPreferredVersion: true`. Totalmente funcional. |
| **PodDisruptionBudget** | `pod-disruption-budget.api.ts` | `policy/v1`, `policy/v1beta1` | Configurado con `checkPreferredVersion: true`. Negocia correctamente v1 y v1beta1. |
| **Eviction** | `pod.api.ts` (`evict()`) | Subrecurso `/eviction` | Soporta desalojo seguro de Pods respetando PDB. |
| **Endpoints (Core)** | `endpoint.api.ts` | `v1` | Presente, pero es la API antigua; falta `EndpointSlice`. |
| **EndpointSlice** | *Inexistente en codebase* | — | Debe incorporarse bajo `discovery.k8s.io/v1`. |

### D. Métricas y Observabilidad Existente
- Subsistema extensible basado en `PrometheusProvider` (`packages/core/src/main/prometheus/`):
  - Proveedores actuales: `lens-prometheus-provider`, `operator-prometheus-provider`, `stacklight-prometheus-provider`, `helm-prometheus-provider`.
  - Agregar soporte para **VictoriaMetrics** y **OpenCost** se integra naturalmente implementando nuevos injectables con `prometheusProviderInjectionToken` y adaptadores REST locales, sin requerir servicios en la nube ni telemetría SaaS.

### E. Auditoría del Servidor MCP
- Búsqueda exhaustiva en dependencias y código fuente: **CERO** líneas de servidor MCP existentes.
- Diagnóstico: El servidor MCP fue postergado durante R2 (que se enfocó en UX y robustez).
- Resolución: El servidor MCP stdio **solo lectura** se programa formalmente para **R3-07**, asegurando que opere de manera desacoplada y con cuotas estrictas por clúster.

---

## 4. Matriz Técnica de Capacidades de Release 3

| Hito | Recurso / Tecnología | Grupo API / CRD | Versiones a negociar | Scope | Dependencia / Prerrequisito | Permisos K8s mínimos | Enfoque de Implementación | Riesgo / Esfuerzo |
|---|---|---|---|---|---|---|---|:---:|
| **R3-01** | **Core API Modernization** (Retiro PSP, negociación HPA/PDB) | `policy`, `autoscaling` | `policy/v1`, `autoscaling/v2` | Ambos | Core K8s API | `get, list, watch` | Configurar `allowedUsableVersions` en KubeApi; ocultar PSP en clusters >= 1.25 | Bajo / S |
| **R3-02** | **EndpointSlice** | `discovery.k8s.io` | `v1`, `v1beta1` | Namespaced | Core K8s | `endpointslices: [get, list, watch]` | Model KubeObject `EndpointSlice` + relación Service ↔ Slices | Medio / M |
| **R3-02** | **Gateway API** | `gateway.networking.k8s.io` | `v1`, `v1beta1` | Ambos | CRD Gateway API | `gatewayclasses, gateways, httproutes: [get, list, watch]` | CRD discovery dinámico; vistas opcionales de Gateways y Routes | Medio / M-L |
| **R3-03** | **Admission Policies & CEL** | `admissionregistration.k8s.io` | `v1`, `v1beta1` | Cluster | K8s >= 1.26 | `validatingadmissionpolicies, bindings: [get, list]` | Visor de expresiones CEL y bindings (solo lectura) | Medio / M |
| **R3-03** | **Dynamic Resource Allocation (DRA)** | `resource.k8s.io` | `v1alpha2`, `v1b1` | Ambos | K8s >= 1.26 (alpha/beta) | `deviceclasses, resourceclaims: [get, list]` | Tabla de claims y clases de dispositivos | Bajo / S-M |
| **R3-04** | **GitOps: Argo CD** | `argoproj.io` | `v1alpha1` | Namespaced | CRD Argo CD | `applications, appprojects: [get, list, watch]` | Vista de salud de sync/reconciliación (solo lectura, sin mutación) | Medio / M |
| **R3-04** | **GitOps: Flux CD** | `*.toolkit.fluxcd.io` | `v1`, `v1beta2` | Namespaced | CRDs Flux | `kustomizations, helmreleases: [get, list, watch]` | Vista de reconciliación y estado de repositorios | Medio / M |
| **R3-05** | **Aplicaciones Lógicas** | `app.kubernetes.io/*` | Convención K8s | Namespaced | Labels estándar | Permisos de Pods/Deployments existentes | Agrupación semántica por label sin mutación | Bajo / S |
| **R3-05** | **Trivy Operator** | `aquasecurity.github.io` | `v1alpha1` | Namespaced | CRD Trivy | `vulnerabilityreports: [get, list]` | Matriz de vulnerabilidades por severidad con redacción de secretos | Medio / M |
| **R3-06** | **VictoriaMetrics & OpenCost** | REST API local | v1 / REST | Cluster | Servicio local | Acceso a métricas vía proxy de servicio | Proveedor Prometheus compatible y estimaciones de costo | Medio / M |
| **R3-07** | **MCP Stdio Server** | `@modelcontextprotocol/sdk` | Stdio v1 | Local | Node 20 | RBAC local del kubeconfig activo | Servidor stdio local solo lectura con comandos filtrados | Medio-Alto / L |
| **R3-08** | **Validación Integral R3** | Todas las anteriores | — | Global | R3-01..R3-07 | — | Regresión total, empaquetado ARM64 y Playwright automatizado | Medio / M |

---

## 5. Estrategia de Laboratorio Local y Pruebas Seguras

1. **Aislamiento absoluto:**
   - Cero conexión a clústeres productivos ajenos o externos.
   - Todo desarrollo y prueba se ejecutará contra servidores de prueba o fixtures de API fake (`V1APIResourceList` sintéticos) y, cuando corresponda, contra clústeres locales tipo `kind` o `minikube` expresamente configurados.
2. **Pruebas de ausencia y degradación controlada:**
   - Cada componente debe probarse bajo tres escenarios obligatorios:
     1. **Presencia:** El API/CRD existe y el usuario tiene permisos `get/list/watch`.
     2. **Ausencia:** El API/CRD no está instalado (404 / no listado en `/apis`). La interfaz no debe fallar ni exhibir errores; debe ocultarse o mostrar un estado deshabilitado informativo.
     3. **Falta de permisos (RBAC 403):** El API existe pero el usuario no tiene permisos. Se debe mostrar una alerta clara sin bloquear el resto de la aplicación.
3. **Invariantes de Seguridad heredadas de R1 y R2:**
   - Preservación de precondiciones de edición (`resourceVersion`).
   - Redacción estricta de Secrets en diffs, vistas y reportes CSV.
   - Indicadores visuales y alertas hazard de producción.

---

## 6. Actualización del Roadmap Provisional

Se propone reflejar en `ROADMAP_PROVISIONAL.md` las siguientes precisiones:
- **Etapa 2 (Release 2):** Se concluyó exitosamente orientada a experiencia de usuario, Diff Monaco, filtros rápidos y exportación CSV segura.
- **MCP Server:** Se traslada formalmente al hito **R3-07** como servidor local stdio de solo lectura, alineado con las capacidades modernas de API discovery desarrolladas en R3-01 a R3-06.

---

## 7. Criterio de Cierre de Hito R3-00

- [x] Resguardo verificable de toda la documentación previa completado en dos ubicaciones externas con hash SHA-256 idéntico.
- [x] Baseline R2 verificado (Node 20.20.2, app.asar hash `f9b2c6f7d1d14789954886d36459f1e254dfedf98bafafa53af3120d7f12629d`, 206 pruebas).
- [x] Auditoría completa de arquitectura (`request-api-resources`, `api-manager`, RBAC, CRDs, métricas, MCP).
- [x] Matriz técnica de capabilities y secuencia de ejecución detallada.
- [x] Cero código productivo alterado durante este hito preflight.

El Hito **R3-00** queda formalmente **CERRADO Y APROBADO**. El entorno se encuentra blindado y listo para iniciar **R3-01**.
