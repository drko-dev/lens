# OpenLens DevOps Revival — R3-07 Validation Report
**Servidor MCP Local de Solo Lectura por Stdio (Integración Segura para Asistentes y Agentes)**

- **Fecha:** 20 de Octubre de 2026
- **Rama:** `feat/openlens-devops-revival`
- **Ambiente de compilación:** Node.js v20.20.2 / npm v10.8.2 / macOS ARM64 (Darwin 27.0.0)
- **Hash / Binario empaquetado:** `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`
  - **SHA-256 app.asar:** `6ada0eeffa15a86a1daa88a057a93de6f65b9470afcb3fa4c9d2d8e48ea9a870`
- **Estado de salida:** APROBADO (8 tests unitarios específicos de R3-07 al 100% PASS + 49 tests en suite integral R3 PASS + Test de cliente stdio externo verificado + Typecheck 0 errores + Monorepo build 40 paquetes exitosa + Verificación Playwright en paquete macOS ARM64 real con captura de pantalla)

---

## 1. Resumen de Implementación

En el marco del Hito **R3-07**, se implementó el **Servidor MCP (Model Context Protocol) Local e Independiente**, funcionando mediante entrada/salida estándar (`stdio`), permitiendo a herramientas externas, IDEs y agentes conectarse de forma transparente sin requerir cuentas de Lens, dependencias de nube propietaria ni elevación de privilegios mutativos:

### A. Protocolo JSON-RPC 2.0 y Arquitectura Stdio (`mcp-server.ts` & `types.ts`)
- **Implementación del protocolo MCP:**
  - Cumplimiento de la especificación MCP 2024-11-05 sobre JSON-RPC 2.0.
  - Soporte de métodos de ciclo de vida:
    - `initialize`: handshake con declaración de capacidades (`capabilities.tools`) e identidad del servidor (`openlens-devops-mcp` v6.5.3-devops).
    - `notifications/initialized`: notificación asíncrona de cliente listo.
    - `ping`: verificación de conectividad y latencia (retorna `{}`).
    - `tools/list`: catálogo dinámico de herramientas permitidas con esquemas JSON Schema de argumentos.
    - `tools/call`: ejecución segura de herramientas con parámetros tipados.

### B. Salvaguarda Estricta de Solo Lectura y Denegación Activa
- **Lista blanca (Allowlist) de 7 herramientas de solo lectura:**
  1. `list_clusters`: Lista clústeres configurados con clasificación de entorno y estado online/offline.
  2. `get_cluster_info`: Metadatos del clúster (versión K8s, estado RBAC, APIs disponibles).
  3. `list_resources`: Consulta de recursos Kubernetes con límite estricto de seguridad (cap a 50 ítems para evitar saturación de contexto).
  4. `get_resource`: Inspección de un recurso individual por namespace y nombre.
  5. `get_pod_logs`: Extracción de logs recientes de contenedores con límite de 100 líneas.
  6. `get_events`: Obtención de eventos recientes de Kubernetes ordenados cronológicamente.
  7. `estimate_cluster_costs`: Estimación de costos y run-rate basada en el motor R3-06.
- **Denegación Proactiva de Operaciones de Escritura y Shell (Código de Error -32001):**
  - Toda llamada a `delete_resource`, `apply_resource`, `edit_resource`, `pod_exec`, `create_port_forward` o `open_terminal` es rechazada inmediatamente con error JSON-RPC `-32001`:
    > *"Operation Forbidden: tool '<name>' is mutative. OpenLens DevOps MCP Server operates strictly in read-only mode. Write, delete, apply, shell, and port-forward actions are prohibited."*
- **Redacción de Credenciales y Secretos:**
  - La función `redactSensitiveData` sanitiza automáticamente el campo `data` y `stringData` de Secrets, así como claves `token`, `password`, `client-key-data` o `authorization`.

### C. Punto de Entrada CLI Stdio (`bin/mcp-stdio.ts`)
- Proceso ejecutable independiente que lee desde `process.stdin` y responde a `process.stdout` delimitado por saltos de línea (protocolo line-delimited JSON-RPC).
- Manejo robusto de errores de parseo, desconexión limpia ante `SIGINT` / `SIGTERM`.

### D. Interfaz Gráfica y Panel de Control (`mcp-settings.tsx` & `/mcp`)
- **Pestaña en Menú de Configuración:** Accesible bajo `Preferences › MCP Server` (`/mcp`, `configSidebarItemId` orden 110).
- **Pancarta de Estado Activo (`data-testid="mcp-server-status-banner"`):**
  > *"Local Read-Only MCP Server: Provides Model Context Protocol stdio interface for external AI assistants and IDEs. All mutations (write, apply, delete, shell, port-forward) are strictly prohibited (Error code -32001). No Lens cloud account required."*
- **Badges de Herramientas Permitidas:** Visualización en vivo de los 7 métodos permitidos con el distintivo `Read-Only` y chips de denegación para operaciones mutativas.
- **Instrucciones de Conexión:** Snippet de configuración JSON para Claude Desktop / Cursor / Antigravity indicando comando y argumentos stdio.

---

## 2. Registro de Pruebas Unitarias e Integración de Protocolo

### A. Suite de Pruebas Unitarias (`mcp-server.test.ts`)
Se ejecutó la suite completa en `packages/core`:
- `initialize successfully with server identity and capabilities`: PASS.
- `handles ping and notifications cleanly`: PASS.
- `lists all allowlisted read-only tools and no write tools`: PASS.
- `executes list_clusters safely with read-only declaration`: PASS.
- `caps list_resources to maximum 50 items`: PASS.
- `prohibits delete_resource and returns -32001 Forbidden error`: PASS.
- `prohibits pod_exec and shell operations`: PASS.
- `redacts tokens, passwords, and secret data fields`: PASS.
**Resultado:** 8 tests evaluados, 8 PASS (100%).

### B. Prueba de Cliente MCP Stdio en Proceso Real (`verify-r3-07-mcp-client.cjs`)
Se simuló la conexión de un cliente MCP real interactuando con el servidor stdio:
- **Handshake `initialize`:** Respondió `{ name: 'openlens-devops-mcp', version: '6.5.3-devops' }`.
- **Descubrimiento `tools/list`:** Detectó 7 herramientas permitidas.
- **Ejecución `list_clusters`:** Retornó 1 clúster disponible sin mutaciones.
- **Ejecución `estimate_cluster_costs`:** Retornó run-rate horario y mensual calculado.
- **Intento de mutación `delete_resource`:** Bloqueado con error `-32001 Operation Forbidden`.
- **Intento de acceso interactivo `pod_exec`:** Bloqueado con error `-32001 Operation Forbidden`.
**Resultado:** Protocolo validado al 100%.

### C. Regresión Integral de Release 3
Se ejecutaron simultáneamente las 7 suites correspondientes a R3:

| Suite de Pruebas | Archivo | Pruebas | Resultado |
|---|---|:---:|:---:|
| **R3-07 MCP Server (stdio)** | `mcp-server.test.ts` | 8 | PASS |
| **R3-06 Observability & Cost Modeling** | `r3-06-metrics-cost.test.ts` | 5 | PASS |
| **R3-05 Applications, Trivy & Images** | `r3-05-apps-trivy.test.ts` | 7 | PASS |
| **R3-04 GitOps Integration** | `r3-04-gitops.test.ts` | 7 | PASS |
| **R3-03 Admission Policies & DRA** | `r3-03-admission-policies-dra.test.ts` | 8 | PASS |
| **R3-02 EndpointSlice & Gateway API** | `r3-02-endpointslices-gateway.test.ts` | 8 | PASS |
| **R3-01 API Compatibility & RBAC** | `r3-01-api-compatibility.test.ts` | 6 | PASS |
| **Total Evaluado R3** | — | **49** | **100% PASS** |

---

## 3. Calidad de Código y Compilación

1. **Typecheck TypeScript:**
   - Comando: `npx tsc -p packages/core/tsconfig.json --noEmit`
   - Salida: 0 errores, código de salida 0.
2. **Compilación Monorepo (Lerna / Nx):**
   - Comando: `npm run build`
   - Salida: 40 proyectos compilados exitosamente sin fallos.
3. **Empaquetado macOS ARM64 Aislado:**
   - Comando: `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --arm64 --publish never -c.directories.output=dist-stage -c.mac.identity=null`
   - Salida: `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`
   - SHA-256 de `app.asar`: `6ada0eeffa15a86a1daa88a057a93de6f65b9470afcb3fa4c9d2d8e48ea9a870`.
   - Proceso productivo en ejecución protegido (PID no alterado).

---

## 4. Verificación Automatizada de GUI en Paquete Real (Playwright)

- **Script:** `docs/revival/scripts/verify-r3-07-mcp-gui.cjs`
- **Ambiente:** macOS ARM64 aislado (`HOME` y `CICD` en `/tmp/openlens-r3-07-mcp-*`, `KUBECONFIG=/dev/null`).
- **Pruebas en Pantalla Real Validadas:**
  - Apertura del binario empaquetado real en staging.
  - Navegación a `/mcp`.
  - Verificación de la pancarta de estado `[data-testid="mcp-server-status-banner"]`.
  - Verificación del selector de clúster de contexto y chips de herramientas allowlisted.
  - Captura de pantalla generada: [`docs/revival/screenshots/r3-07-mcp-server-view.png`](./screenshots/r3-07-mcp-server-view.png).

---

## 5. Conclusión y Estado de Aceptación

El Hito **R3-07** queda **completado y certificado**:
- Servidor MCP local e independiente sobre stdio implementado sin dependencias externas ni cuentas Lens.
- Salvaguarda inviolable de solo lectura con denegación activa (código -32001) para toda operación de mutación o shell.
- Redacción estricta de secretos y credenciales.
- Panel de preferencias `/mcp` plenamente funcional y documentado.
- 100% probado en unit tests, integración con cliente stdio, typecheck, build y GUI real.
