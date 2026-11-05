# H8.0 — Auditoría Técnica del Servidor MCP Existente

**Fecha:** 2026-11-05
**Hito:** H8.0 — Fundaciones de Arquitectura y Seguridad
**Historia:** H8-001
**Estado:** REVISADO / PENDIENTE DE ENDURECIMIENTO

---

## 1. Resumen Ejecutivo

OpenLens DevOps cuenta con una implementación preliminar del protocolo Model Context Protocol (MCP) en `packages/core/src/main/mcp/` y `packages/core/src/common/mcp/`.
Esta auditoría confirma que **el servidor MCP actual es un cascarón de validación sintáctica JSON-RPC desconectado en runtime de los clústeres de Kubernetes**. No existe backend operativo activo, y la interfaz de usuario presenta un estado no comprobado ("Ready") que no refleja la realidad del sistema.

Sin embargo, el código contiene mecanismos valiosos de framing, limitación de concurrencia, timeouts y redacción de datos que deben ser **reutilizados y reforzados** en H8, evitando la creación de un servidor paralelo.

---

## 2. Inventario de Componentes Auditados

| Archivo | Rol | Estado Observado | Clasificación |
| :--- | :--- | :--- | :--- |
| `packages/core/src/main/mcp/mcp-server.ts` | Servidor JSON-RPC 2.0 y ejecutor de herramientas | Implementa framing stdio, redacción de secretos, timeouts (5s), límite de concurrencia (4) y validación regex de argumentos. Requiere `McpServerContext`. | **IMPLEMENTADO / REVISADO** |
| `packages/core/src/main/mcp/bin/mcp-stdio.ts` | Entrypoint ejecutable CLI para stdio | Instancia `new OpenLensMcpServer()` sin `context` cuando corre como standalone. | **IMPLEMENTADO (INCOMPLETO)** |
| `packages/core/src/common/mcp/types.ts` | Definición de herramientas y lista de prohibiciones | Declara 7 herramientas permitidas y un Set `FORBIDDEN_WRITE_TOOLS`. | **IMPLEMENTADO / REVISADO** |
| `packages/core/src/renderer/components/mcp-settings/mcp-settings.tsx` | Vista de configuración en el Renderer | Muestra banner estático "Ready (Local stdio)" con dot verde y comando con ruta absoluta desactualizada. | **IMPLEMENTADO (DEFECTUOSO)** |
| `packages/core/src/main/mcp/__tests__/mcp-server.test.ts` | Pruebas unitarias de protocolo | Valida initialize, ping, tools/list, tools/call y errores JSON-RPC con mock context. | **PROBADO** |
| `packages/core/src/main/mcp/__tests__/mcp-security-hardening.test.ts` | Pruebas unitarias de seguridad | Valida fail-closed, redacción de tokens/claves, timeouts, límites de tamaño y denegación de mutaciones. | **PROBADO** |

---

## 3. Matriz de Herramientas Existentes vs. Capacidades Reales

El archivo `types.ts` expone 7 herramientas. Su comportamiento real frente al cluster es el siguiente:

| Herramienta | Verbo K8s | Scope | Parámetros Clave | Límites Impuestos | Estado de Backend | Riesgo de Seguridad Detectado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `list_clusters` | Interno Lens | Catálogo global | `includeOffline` (bool) | Max 50 clusters | **DESCONECTADO** (Retorna `NOT_CONFIGURED` si no hay context) | Bajo. Filtra por `authorizeCluster(clusterId)`. |
| `get_cluster_info` | Interno / Read | Clúster | `clusterId` (string) | 1 objeto | **DESCONECTADO** | Bajo. Redacta secretos si el context responde. |
| `list_resources` | `list` | Clúster o Namespace | `clusterId`, `resourceKind`, `namespace`, `limit` | Max 50 items | **DESCONECTADO** | **CRÍTICO**. `resourceKind` admite cualquier string `^[A-Za-z][A-Za-z0-9.-]*$`. Si el usuario tiene permisos, permite listar `secrets`, `serviceaccounts` o recursos RBAC. |
| `get_resource` | `get` | Clúster o Namespace | `clusterId`, `resourceKind`, `name`, `namespace` | 1 objeto | **DESCONECTADO** | **ALTO**. Aunque redacta `.data` si `kind === "secret"`, no bloquea la solicitud de Secrets a nivel de gateway. |
| `get_pod_logs` | `get pods/log` | Pod / Contenedor | `clusterId`, `podName`, `namespace`, `container`, `tailLines` | Max 100 líneas | **DESCONECTADO** | Medio. Tailing acotado, pero no integrado con streams continuos de Kubetail ni filtros de timestamp. |
| `get_events` | `list events` | Clúster o Namespace | `clusterId`, `namespace`, `limit` | Max 50 eventos | **DESCONECTADO** | Bajo. Eventos de advertencia son útiles para diagnóstico. |
| `estimate_cluster_costs` | Lectura métricas | Clúster | `clusterId` | 1 cálculo local | **DESCONECTADO** | Bajo. Operación puramente determinística. |

---

## 4. Hallazgos Críticos y Brechas Identificadas

### 4.1. Ausencia de Backend en Runtime (Fail-Closed Verificado)
En `mcp-server.ts`:
```typescript
if (!this.context) {
  throw new McpServerError(-32003, "NOT_CONFIGURED: No Kubernetes backend is configured.");
}
```
Cuando un cliente externo (ej. Claude Desktop o un script de terminal) ejecuta `mcp-stdio.ts`, el proceso arranca, responde al handshake `initialize` y a `tools/list`, pero **cualquier invocación a `tools/call` falla inmediatamente con el código -32003**. No existe actualmente en Electron Main ninguna fábrica o servicio que instancie `OpenLensMcpServer` inyectándole un `McpServerContext` conectado al `ClusterManager` de Lens.

### 4.2. UI Engañosa en Configuración
En `mcp-settings.tsx`:
```tsx
<div className="banner-title">
  <span className="dot" style={{ background: "#10b981" }} />
  OpenLens DevOps MCP Server: Ready (Local stdio)
</div>
<div className="command-box">
  node /Users/gustavomarcon/Documents/lens/lens/packages/core/dist/main/mcp/bin/mcp-stdio.js
</div>
```
- El estado "Ready" es puro texto estático sin comprobación reactiva del estado del proceso.
- La ruta del comando está quemada (`/Users/gustavomarcon/Documents/lens/lens/...`) y apunta a un path inexistente en el workspace canónico (`lens-v6-ui-corrections`).

### 4.3. Vulnerabilidad en la Selección de Recursos (`resourceKind`)
El validador de `list_resources` y `get_resource` verifica únicamente formato sintáctico:
```typescript
const RESOURCE_KIND_PATTERN = /^[A-Za-z][A-Za-z0-9.-]*$/;
```
No existe una lista blanca de tipos de recursos permitidos. Si el backend simplemente reenviara la consulta al API de Kubernetes con las credenciales del usuario, un cliente IA podría solicitar:
- `resourceKind: "secrets"`
- `resourceKind: "serviceaccounts"`
- `resourceKind: "clusterrolebindings"`
- Subrecursos peligrosos si la API los admite como resourceKind.

### 4.4. Autorización Unidimensional
El contexto actual solo expone:
```typescript
authorizeCluster?: (clusterId: string, signal: AbortSignal) => boolean | Promise<boolean>;
```
Esto valida únicamente si el clúster está en el catálogo accesible, pero **no valida namespace, identidad del solicitante ni permisos por herramienta o recurso**.

---

## 5. Decisiones de Reutilización y Endurecimiento

1. **NO crear un servidor paralelo:** Se preservará `OpenLensMcpServer` como el motor de ejecución JSON-RPC.
2. **Implementar `McpServerContext` en Electron Main:** Se creará un puente en Main (`McpBridgeContext`) gobernado por el nuevo `IncidentBrokerService`.
3. **Allowlist estricta de `resourceKind`:**
   Permitidos exclusivamente: `pods`, `deployments`, `services`, `configmaps`, `events`, `nodes`, `ingresses`, `persistentvolumeclaims`, `statefulsets`, `daemonsets`.
   Bloqueados con código `-32001 (Operation Forbidden)`: `secrets`, `serviceaccounts`, `roles`, `clusterroles`, `rolebindings`, `clusterrolebindings`.
4. **Corrección de UI:** Corregir `mcp-settings.tsx` para que consulte el estado real del servidor y genere dinámicamente la ruta correcta del binario en base a `app.getPath("exe")` o la instalación real.

---

## 6. Estado de Tareas H8-001

- [x] Inventario de `mcp-server.ts`, `mcp-stdio.ts`, `types.ts` y UI completado (**REVISADO**).
- [x] Matriz de permisos, verbos y brechas documentada (**REVISADO**).
- [x] Confirmación de comportamiento fail-closed sin backend (**PROBADO por tests unitarios existentes**).
- [ ] Endurecimiento de allowlist de `resourceKind` (**PENDIENTE de implementación en H8.2**).
- [ ] Corrección de la UI `mcp-settings.tsx` (**PENDIENTE de implementación en H8.2**).
