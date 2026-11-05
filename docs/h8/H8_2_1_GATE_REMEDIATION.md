# OpenLens DevOps — H8.2.1 Gate Remediation Report
## Broker Hardening, Cluster Scope Isolation, and Positive Allowlists

**Fecha:** 2026-11-05  
**Fase:** Fase 0 — H8.2.1 Remediation Gate  
**Rama:** `feature/h8-3-ai-diagnostics`  
**Baseline:** `29330be`  
**Estado:** **GATE SUPERADO Y APROBADO (64/64 Tests en Verde)**  

---

## 1. Resumen Ejecutivo

Antes de iniciar la integración de proveedores y modelos de Inteligencia Artificial en H8.3, se completaron de forma estricta las cuatro correcciones de seguridad requeridas en el mediador de evidencias (Broker):

1. **Aislamiento Real entre Clústeres (Item A):** Se eliminó la verificación tautológica en el motor de autorización incorporando `targetClusterId` explícito en `AuthorizationRequest` y comprobaciones pre-vuelo en `McpBrokerBridge`. Se comprobó mediante pruebas directas que cualquier invocación con un `clusterId` ajeno al incidente genera `CLUSTER_SCOPE_VIOLATION` con **cero llamadas a `KubernetesApiExecutor`**.
2. **Sanitización Obligatoria en el Pipeline de Salida (Item B):** Se integró `BrokerSanitizationPipeline` directamente en todos los métodos de `McpBrokerBridge`. Ninguna herramienta diagnóstica puede devolver contenido crudo a los consumidores o modelos IA. Se aseguró la redacción de contraseñas sobre cualquier esquema URI (`redis://`, `postgres://`, etc.) preservando la validez sintáctica de payloads JSON.
3. **Aislamiento de Sesiones Concurrentes (Item C):** Se eliminó el riesgo de la variable global mutable `activeSessionId` implementando instancias vinculadas inmutables `new McpBrokerBridge(broker, k8sExecutor, sessionId)`. Dos investigaciones simultáneas sobre clústeres distintos operan en aislamiento absoluto sin contaminación cruzada.
4. **Allowlist Positiva de Recursos y Verbos (Item D):** Se establecieron listas blancas positivas estrictas (`POSITIVE_ALLOWED_TOOLS`, `POSITIVE_ALLOWED_RESOURCE_KINDS`, `POSITIVE_ALLOWED_VERBS`, `POSITIVE_ALLOWED_SUBRESOURCES`). Cualquier recurso o subrecurso fuera de la lista blanca es rechazado de forma positiva antes de tocar el API Server.

---

## 2. Detalle de Correcciones Implementadas

### A. Aislamiento Real entre Clústeres
- **Archivo:** `packages/core/src/common/incident/broker-types.ts`, `authorization-engine.ts`, `mcp-broker-bridge.ts`.
- **Cambio:**
  ```typescript
  // En authorization-engine.ts:
  if (targetClusterId && targetClusterId !== scope.clusterId) {
    return makeDecision(
      false,
      "CLUSTER_SCOPE_VIOLATION",
      `Cross-cluster access violation: requested '${targetClusterId}' but investigation is locked to cluster '${scope.clusterId}'.`,
    );
  }
  ```
- **Comprobación:** Pruebas directas en `h8-2-1-integration-fixes.test.ts` demuestran que llamar a `getResources`, `getResourceDetails`, `getLogs`, `getEvents` o `getClusterInfo` con un `alienClusterId` arroja error de forma síncrona sin disparar peticiones HTTP a la infraestructura.

### B. Sanitización Obligatoria Previa al Consumo
- **Archivo:** `packages/core/src/main/incident-broker/mcp-broker-bridge.ts`, `broker-sanitization-pipeline.ts`, `evidence-sanitizer.ts`.
- **Cambio:** Todo resultado devuelto por `k8sExecutor` pasa obligatoriamente por `BrokerSanitizationPipeline.processK8sOutput`. Se implementó `sanitizeObjectFields` para redactar objetos estructurados preservando formato JSON válido, y soporte universal para URIs en `urlPasswordRegex`.
- **Comprobación:** Manifiestos de ConfigMaps con contraseñas y logs con credenciales Redis y directivas `[INST]` se entregan 100% redactados y neutralizados a cualquier cliente superior.

### C. Aislamiento Concurrente de Sesiones
- **Archivo:** `packages/core/src/main/incident-broker/mcp-broker-bridge.ts`, `incident-broker-service.ts`.
- **Cambio:**
  ```typescript
  export class McpBrokerBridge implements McpServerContext {
    constructor(
      private readonly broker: IncidentBrokerService,
      private readonly k8sExecutor: KubernetesApiExecutor,
      private readonly boundSessionId?: string,
    ) {}
  ```
  El método `setActiveSessionId` arroja excepción si se intenta mutar una instancia vinculada. Cada investigación instancia su propio bridge aislado.

### D. Allowlist Positiva de Seguridad
- **Archivo:** `packages/core/src/common/incident/broker-types.ts`, `authorization-engine.ts`.
- **Recursos Permitidos Positivamente:** `pods`, `deployments`, `services`, `configmaps`, `events`, `nodes`, `ingresses`, `persistentvolumeclaims`, `statefulsets`, `daemonsets`, `replicasets`, `jobs`, `cronjobs`.
- **Subrecursos Permitidos:** `log`, `status`.
- **Verbos Permitidos:** `get`, `list`, `watch`.
- Cualquier otro tipo de recurso no inventariado (ej. `helmreleases`, `certificatesigningrequests`) se rechaza de inmediato con `RESOURCE_FORBIDDEN`.

---

## 3. Estado de Pruebas Automatizadas

Se ejecutaron 8 suites completas de pruebas unitarias, de integración y adversariales:
- `src/main/incident-broker/__tests__/h8-2-1-integration-fixes.test.ts`: **9 tests PASS**
- `src/main/incident-broker/__tests__/adversarial-security.test.ts`: **13 tests PASS**
- `src/main/incident-broker/__tests__/incident-broker-service.test.ts`: **12 tests PASS**
- `src/main/incident-broker/__tests__/technical-identity-manager.test.ts`: **3 tests PASS**
- `src/main/incident-broker/__tests__/mcp-broker-bridge.test.ts`: **7 tests PASS**
- `src/main/incident-broker/__tests__/broker-sanitization-pipeline.test.ts`: **6 tests PASS**
- `src/main/incident-broker/__tests__/investigation-budget-manager.test.ts`: **4 tests PASS**
- `src/main/incident-storage/__tests__/evidence-sanitizer.test.ts`: **10 tests PASS**

**Resultado Total:** **64 tests passed / 64 total (100% PASS)**.

---

## 4. Veredicto del Gate

> **VEREDICTO: GATE H8.2.1 SUPERADO.**  
> El mediador de Kubernetes en Electron Main cuenta ahora con aislamiento real no tautológico de clústeres, sanitización universal en el pipeline de datos, inmutabilidad de sesiones concurrentes y validación positiva de allowlists. Queda formalmente autorizado avanzar a las historias de IA (H8-014 a H8-018).
