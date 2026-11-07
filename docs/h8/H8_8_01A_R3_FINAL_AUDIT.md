# H8.8-01a-R3 — Corrección Final de Seguridad y Preparación para Integración

**Fecha:** 2026-11-07  
**Rama:** `feature/h8-8-01a-secure-ai-transport`  
**Base Commit:** `62dc1c51`  
**Estado:** PASS — Cierre total de hallazgos R3-01 a R3-04.  
**Auditoría:** Resolución de hallazgos de tercera auditoría independiente de seguridad (R3-01 a R3-04).

---

## 1. Resumen Ejecutivo

La tercera revisión independiente de **H8.8-01a** auditó el transporte seguro y confirmó cuatro puntos clave:
- **R3-01 (P0):** Prohibición absoluta de reintentos automáticos para solicitudes `POST`. Se corrigió la fuga donde `idempotent: true` habilitaba reintentos en `POST`, eliminando el riesgo de duplicación de solicitudes facturables o tokens de inferencia.
- **R3-02 (P0):** Delimitación honesta del `PreconnectAuthorizationTicket`. Se documentó formalmente que el ticket valida una atestación lógica a nivel de contrato coordinador/motor, sin constituir prueba física de DNS pinning a nivel de socket del sistema operativo. El motor de red real permanece **deshabilitado por defecto** (`DisabledRealNetworkEngine`).
- **R3-03 (P0):** Deadline global único aplicado a toda la operación (validación, dispatch, lectura completa de streaming, decodificación y cierre). Se garantiza corte y cancelación oportuna del stream sin bloqueos indefinidos si `cancel()` o el iterador no responden.
- **R3-04 (P1):** Respuestas de redirección (301, 302, 303, 307, 308) sin cabecera `Location` o con `Location` vacío son rechazadas expresamente mediante `TransportRedirectError`. HTTP 304 (Not Modified) no requiere `Location` y se procesa normalmente.

Todas las correcciones fueron implementadas, verificadas con 33 suites y 365 tests PASS, con cero errores TypeScript y compilación estricta de producción exitosa.

---

## 2. Detalle de Resoluciones Técnicas

### R3-01 (P0) — Prohibición Absoluta de Reintentos de POST
- **Causa Raíz:** En R2 se evaluaba `effectiveRequest.method === "GET" || effectiveRequest.idempotent === true`. Un llamador podía enviar `POST` con `idempotent: true` provocando múltiples dispatches ante un código 429.
- **Remediación:**
  ```typescript
  const isRetryEligible = effectiveRequest.method === "GET" && effectiveRequest.idempotent !== false;
  const maxRetries = isRetryEligible
    ? Math.min(Math.max(0, request.maxRetries ?? 0), MAX_ALLOWED_RETRIES)
    : 0;
  ```
  Para cualquier petición `POST`, `maxRetries` es obligatoriamente `0`, ignorando cualquier flag `idempotent: true`. Ante 429, 503, timeout o error de red, el transporte falla de inmediato en el intento 1 arrojando `TransportHttpError` con `retryAfterMs` expuesto.

### R3-02 (P0) — Límite Real del Ticket de Preconexión y Puerta de Seguridad H8.8-03
- **Clarificación Arquitectónica:** El `PreconnectAuthorizationTicket` demuestra que el motor invocó la función de validación del coordinador antes de retornar el resultado, pero en un motor de red real no previene por sí mismo que un socket físico se haya conectado antes o a una IP diferente.
- **Estado Actual:** El transporte HTTP real **NO está habilitado ni se declara seguro**. La aplicación opera exclusivamente con `DisabledRealNetworkEngine` (falla cerrado con `RealTransportDisabledError`) y pruebas con `MockAiTransport`.
- **Requisitos Obligatorios para el Futuro Motor Real (Security Gate H8.8-03):**
  1. Resolución DNS manual y controlada mediante `dns.promises.resolve*()`.
  2. Validación estricta de cada dirección IP contra la política SSRF antes de instanciar sockets.
  3. DNS pinning a nivel socket: conexión directa a la IP pre-aprobada vía `createConnection` o custom `lookup` en `https.Agent`.
  4. Preservación del hostname y Server Name Indication (SNI) originales para validación de certificados TLS.
  5. Desactivación absoluta de seguimiento automático de redirecciones (gestión manual y revalidación de cada salto).
  6. Proxies deshabilitados por defecto salvo configuración explícita autorizada.
  7. Cancelación activa de sockets subyacentes (`socket.destroy()`) ante `AbortSignal` o timeout.

### R3-03 (P0) — Deadline Global Único y Cancelación de Streaming
- **Causa Raíz:** El deadline y la carrera contra `timeoutOrAbortPromise` envolvían únicamente la llamada a `this.engine.dispatch()`. Si el stream retornado por el motor se bloqueaba esperando el siguiente fragmento, la promesa quedaba pendiente indefinidamente.
- **Remediación:**
  - El deadline único (`overallDeadline = startTime + overallTimeoutMs`) y el `attemptAbortController` envuelven la ejecución completa: `dispatch`, validación del ticket y consumo de `readBoundedStream`.
  - En `readBoundedStream`: la obtención de cada fragmento mediante `iterator.next()` compite activamente (`Promise.race`) contra la señal de aborto.
  - La cancelación del stream (`stream.cancel()`) se ejecuta de manera cooperativa protegida con un timeout acotado (`safelyCancelStream`), impidiendo que un `cancel()` bloqueado o colgado detenga la resolución del error de timeout hacia el llamador público.

### R3-04 (P1) — Redirecciones HTTP sin Location y Validación Estricta
- **Causa Raíz:** Respuestas 302 sin cabecera `Location` eran tratadas como respuestas normales sin validar el destino.
- **Remediación:**
  - Se introdujo `TransportRedirectError extends AiTransportError`.
  - Para los códigos de redirección `[301, 302, 303, 307, 308]`, se exige obligatoriamente un encabezado `Location` no vacío.
  - Si falta o está vacío: lanza `TransportRedirectError`.
  - Si es malformado o apunta a HTTP, localhost, IP privada o metadata: lanza `SsrfSecurityViolationError`.
  - HTTP 304 (Not Modified) no requiere `Location` y es procesado como respuesta válida.
  - Cero auto-following de redirecciones en el transporte offline.

---

## 3. Matriz de Evidencias de Pruebas

| Suite | Componente | Tests | Estado |
|---|---|---|---|
| `secure-ai-transport.test.ts` | Transporte seguro, POST zero-retry, deadline streaming, redirecciones, R3 suites | 58 | PASS |
| `transport-security-policy.test.ts` | SSRF, alternativas IP, rebinding, redirecciones | 28 | PASS |
| `ai-ipc.test.ts`, `ai-profile-manager.test.ts`, `h8-3-1-integration-gate.test.ts`, etc. | Perfiles IA, Vault, Consentimiento inmutable, Contexto efímero | 64 | PASS |
| `incident-storage` | Repositorio, SQLite WAL, sanitizador, purga | 74 | PASS |
| `incident-broker` | Doble identidad RBAC, límites, herramientas de solo lectura | 54 | PASS |
| `incident-scanner` | Escáner local, reglas deterministas, deduplicación | 66 | PASS |
| `incident-workbench` | Panel de incidentes, visualización, diagnóstico mock | 21 | PASS |
| **Total General** | **Todas las suites de regresión H8** | **365** | **PASS** |

---

## 4. Estado de Producción y Git

- **Worktree:** `/private/var/tmp/lens-h8-8-01a-secure-ai-transport-20261107`
- **Rama:** `feature/h8-8-01a-secure-ai-transport`
- **TypeScript:** 0 errores (`tsc --noEmit` en `@openlens/core` exitoso con código 0).
- **Webpack Core:** Compilado en modo producción (`@openlens/core@6.5.3 published in store`).
- **Webpack OpenLens:** Compilado en modo producción (`open-lens@6.5.3-dev compiled successfully`).
- **Restricciones Git respetadas:** Sin push, sin merge, sin rebase, 14 commits previos intactos.
