# OpenLens DevOps — H8.2 Plan de Implementación
## Broker Seguro de Evidencias Kubernetes e Identidad Técnica en Electron Main

**Fecha:** 2026-11-05  
**Hito:** H8.2 — Broker de Evidencias e Identidad Técnica Kubernetes  
**Historias:** H8-010, H8-011, H8-012, H8-013  
**Rama activa:** `feature/h8-2-kubernetes-evidence-broker`  
**Baseline aprobado:** `3c068b7` (H8.1 RC1)  
**Release preservado:** `open-lens/dist/h8-rc1/`  
**Proyecto Engram:** `lens-v6-ui-corrections`  
**Estado:** PLANIFICADO Y EN EJECUCIÓN AUTÓNOMA  

---

## 1. Principio Arquitectónico y Modelo de Amenazas

En OpenLens DevOps, el operador humano frecuentemente dispone de credenciales de alto privilegio (`cluster-admin`) configuradas en su kubeconfig local.  
**Invariante de Seguridad Inquebrantable:**
> *Ningún asistente, agente de diagnóstico o modelo de IA debe heredar los privilegios del operador humano. Todo acceso al clúster debe someterse a una verificación estricta de doble identidad en Electron Main (Policy Enforcement Point - PEP).*

La fórmula formal de decisión por llamada es:
$$\text{Decision} = \text{USER\_AUTHZ} \land \text{AGENT\_AUTHZ} \land \text{CLUSTER\_SCOPE} \land \text{NAMESPACE\_SCOPE} \land \text{TOOL\_ALLOWLIST}$$

### Reglas Críticas del Modelo:
1. **Doble Identidad Obligatoria:** Requiere que tanto el usuario humano como la identidad técnica del agente (`ServiceAccount` `openlens-ai-investigator`) posean permisos efectivos para el recurso, verbo, subrecurso y namespace. Si cualquiera de las dos falla, la operación se deniega (`FAIL-CLOSED`).
2. **Sin Fallback Administrador:** Se prohíbe explícitamente el fallback que ejecuta herramientas de diagnóstico utilizando el kubeconfig administrador del usuario respaldado únicamente por un SSAR local. Sin identidad técnica independiente verificada, no hay acceso.
3. **Credenciales Confinadas en RAM de Main:** Los tokens emitidos mediante `TokenRequest` (con audiencia `openlens-ai-investigator` y TTL de 1 hora) se almacenan exclusivamente en memoria volátil de Electron Main. Jamás se exponen al Renderer, ni a modelos de IA, ni a servidores MCP externos.
4. **Invalidación Inmediata de Sesiones:** El cambio de clúster, usuario, namespace o alcance invalida inmediatamente la sesión y sus tokens.
5. **Cero Escrituras Kubernetes:** Las herramientas de diagnóstico son estrictamente de solo lectura. Quedan bloqueados todos los métodos mutadores, creación de tokens, secretos y subrecursos peligrosos (`exec`, `attach`, `port-forward`, `proxy`).

---

## 2. Desglose de Historias y Criterios de Aceptación (AC)

### Historia H8-010: Broker e Identidad Independiente
- **Objetivo:** Implementar `IncidentBrokerService` y `KubernetesTechnicalIdentityManager` en Electron Main como Policy Enforcement Point.
- **Entregables:**
  - `packages/core/src/main/incident-broker/incident-broker-service.ts`
  - `packages/core/src/main/incident-broker/technical-identity-manager.ts`
  - `packages/core/src/main/incident-broker/authorization-engine.ts`
  - `packages/core/src/common/incident/broker-types.ts`
- **Criterios de Aceptación:**
  1. Conjunción lógica de 5 factores comprobada antes de cada llamada.
  2. Gestión de `TokenRequest` con audiencia `openlens-ai-investigator` y expiración estricta.
  3. Tokens residen únicamente en RAM de Main.
  4. Invalidación de sesión ante cambio de clúster, usuario o namespace.
  5. Default deny: rechaza si falta cualquiera de las identidades.
  6. Pruebas unitarias e integración con API Server sintético que demuestran denegación cuando el usuario es admin pero el agente no tiene permisos, y viceversa.

### Historia H8-011: Herramientas de Diagnóstico de Solo Lectura
- **Objetivo:** Conectar `OpenLensMcpServer` con el broker mediante un `McpBrokerBridgeContext` tipado y seguro.
- **Entregables:**
  - `packages/core/src/main/incident-broker/mcp-broker-bridge.ts`
  - Endurecimiento de `packages/core/src/main/mcp/mcp-server.ts` con allowlist estricta de `resourceKind`.
- **Criterios de Aceptación:**
  1. Reutiliza `OpenLensMcpServer`; no crea un segundo servidor MCP ni autorización paralela.
  2. Allowlist estricta de recursos permitidos: `pods`, `deployments`, `services`, `configmaps`, `events`, `nodes`, `ingresses`, `persistentvolumeclaims`, `statefulsets`, `daemonsets`.
  3. Bloqueo total con código `-32001` de: `secrets`, `serviceaccounts`, `roles`, `clusterroles`, `rolebindings`, `clusterrolebindings`.
  4. Bloqueo de subrecursos mutadores y peligrosos (`exec`, `attach`, `port-forward`, `proxy`, `token-minting`).
  5. Verificación de cero escrituras efectuadas al mock del API Server.

### Historia H8-012: Pipeline de Sanitización y Evidencias
- **Objetivo:** Integrar obligatoriamente `EvidenceSanitizer` (de H8-008) en el pipeline de salida del Broker antes de que los datos alcancen a consumidores externos o la UI.
- **Entregables:**
  - `packages/core/src/main/incident-broker/broker-sanitization-pipeline.ts`
  - Integración con `evidence-repository.ts` e IPC.
- **Criterios de Aceptación:**
  1. Pipeline: `K8s API -> Broker Authz -> Execution -> Sanitizer -> Safe Evidence -> SQLite/UI`.
  2. Clasificación de contenido, truncado a límites seguros y generación de metadatos de redacción.
  3. Manifiestos y logs tratados como datos no confiables: neutralización de directivas de prompt injection y delimitación segura.
  4. Ni errores ni logs de auditoría filtran tokens, contraseñas o certificados.
  5. Indicadores visibles en la evidencia sobre campos redactados o truncados.

### Historia H8-013: Presupuestos de Investigación, Auditoría y Revocación
- **Objetivo:** Implementar límites configurables de ejecución por incidente, cancelación inmediata y registro de auditoría local.
- **Entregables:**
  - `packages/core/src/main/incident-broker/investigation-budget-manager.ts`
  - `packages/core/src/main/incident-broker/broker-audit-logger.ts`
  - Migración SQLite `004_broker_audit_log.sql` para auditoría local persistente.
- **Criterios de Aceptación:**
  1. Presupuesto por incidente: límite de tools ejecutadas, requests K8s, líneas/bytes de logs, tiempo de ejecución y concurrencia.
  2. Detección de límite agotado: detención inmediata de operaciones y solicitud de autorización explícita para ampliar.
  3. Revocación/cancelación de sesión: descarta respuestas tardías de la red e impide que actualicen incidentes cerrados.
  4. Registro de auditoría sanitizado en SQLite: timestamp, incidentId, actor, clusterId, namespace, toolName, decision, durationMs.

---

## 3. Matriz de Pruebas Adversariales de Seguridad

Todas las pruebas se ejecutan sobre un API Server sintético que registra cada HTTP request recibido:
1. `TEST-SEC-01`: Usuario `cluster-admin` + Agente no autorizado $\rightarrow$ **DENIED** (cero llamadas de lectura al recurso).
2. `TEST-SEC-02`: Usuario sin permisos + Agente autorizado $\rightarrow$ **DENIED** (cero llamadas de lectura al recurso).
3. `TEST-SEC-03`: Intento de consulta en namespace ajeno al scope del incidente $\rightarrow$ **DENIED**.
4. `TEST-SEC-04`: Intento de consulta en cluster ajeno al incidente $\rightarrow$ **DENIED**.
5. `TEST-SEC-05`: Cambio de clúster o namespace durante investigación en vuelo $\rightarrow$ **SESSION_INVALIDATED**.
6. `TEST-SEC-06`: Token expirado (TTL vencido) $\rightarrow$ **TOKEN_EXPIRED** y rechazo fail-closed.
7. `TEST-SEC-07`: Solicitud de `resourceKind: "secrets"` o `serviceaccounts` $\rightarrow$ **FORBIDDEN (-32001)**.
8. `TEST-SEC-08`: Intento de subrecurso peligroso (`exec`, `attach`, `port-forward`, `proxy`) $\rightarrow$ **FORBIDDEN**.
9. `TEST-SEC-09`: Inyección de directivas de evasión / prompt injection en logs $\rightarrow$ **SANITIZED**.
10. `TEST-SEC-10`: Manifiesto con secretos embebidos $\rightarrow$ **REDACTED / FORBIDDEN**.
11. `TEST-SEC-11`: Concurrencia excedida $\rightarrow$ **CONCURRENCY_LIMIT (-32002)**.
12. `TEST-SEC-12`: Respuesta de red tardía tras cancelación/revocación $\rightarrow$ **DISCARDED** (sin mutación en base de datos).
13. `TEST-SEC-13`: Verificación estricta de **CERO peticiones POST/PUT/PATCH/DELETE** recibidas en el API Server sintético durante toda la sesión diagnóstica.

---

## 4. Secuencia de Trabajo y Commits

1. **Commit 1:** `docs(h8): establish H8.2 Kubernetes evidence broker implementation plan`
2. **Commit 2:** `feat(h8): implement incident broker authorization engine and technical identity manager (H8-010)`
3. **Commit 3:** `feat(h8): connect read-only diagnostic tools to broker with strict resource allowlist (H8-011)`
4. **Commit 4:** `feat(h8): integrate pre-model sanitization pipeline and untrusted data defenses (H8-012)`
5. **Commit 5:** `feat(h8): implement investigation budgets, session revocation, and audit logging (H8-013)`
6. **Commit 6:** `test(h8): add comprehensive adversarial security test suite for evidence broker`
7. **Commit 7:** `docs(h8): summarize H8.2 evidence broker architecture, matrix, and verification report`
