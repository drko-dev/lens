# OpenLens DevOps Revival — R7-01 Diseño de Seguridad Operacional Hardened

**Hito:** R7-01 — Mantenimiento Seguro de Nodos y Shell del Sistema (Security Hardened)  
**Fecha de revisión final:** 2026-10-23  
**Rama:** `feat/r7-devops-capabilities`  
**Base consolidada:** Commit `731fb1ff4bf4b3cc1fb74972f1cb6428acdce6e0` (Release 6 consolidada)  
**Estado:** Gate final de seguridad corregido; pendiente de autorización de commit local.

---

## 1. Modelo de Amenazas y Clasificación de Riesgo

| Operación | Nivel de Riesgo | Vector de Amenaza Principal | Defensas Mandatorias |
|---|---|---|---|
| **Cordon** (`unschedulable: true`) | **ALTO** | Aislamiento de capacidad de scheduling; subdimensionamiento en clústeres al límite. | Strategic merge patch idempotente, detección semántica RBAC 403/409, aborto por cambio de contexto, confirmación reforzada en `PROD`. |
| **Uncordon** (`unschedulable: false`) | **ALTO** | Reactivación inmediata de programación hacia un nodo en mantenimiento. | Idempotencia, detección 403/409, aborto por cambio de contexto, confirmación obligatoria con banner de riesgo en `PROD`. |
| **Drain** (desalojo masivo) | **CRÍTICO** | Caída masiva de servicios, desalojo con datos incompletos, violación de PDB, destrucción de `emptyDir`, caída en clústeres mononodo. | Bloqueo por datos incompletos o parciales, revalidación fresca antes de Cordon, exclusión absoluta de DaemonSets, evaluación integral de selectores PDB, revalidación de PDB antes de Cordon, verificación fáctica de terminación, prohibición de uncordon automático. |
| **Node Shell** (terminal host) | **CRÍTICO** | Acceso root irrestricto al host (`nsenter -t 1`), evasión de sandboxes y PSA, elevación mediante IPC directa desde el renderer. | Deshabilitado por defecto, autorización emitida exclusivamente por el proceso principal, confirmación nativa en `PROD`, grant opaco de un solo uso con TTL 60s ligado a clúster/nodo/operación, validación del frame emisor, doble verificación de existencia del nodo y rechazo de identificadores provistos por el renderer. |

---

## 2. Arquitectura de Seguridad para Drain

### 2.1 Carga completa vs. carga parcial

Los cargadores cluster-wide devuelven promesas que permiten esperar y capturar fallos:

- `load-pods-from-all-namespaces.injectable.ts`
- `load-pdbs-from-all-namespaces.injectable.ts`

Reglas:

1. Una lista **vacía pero completa** es un resultado exitoso. Significa que no hay Pods desalojables; no significa fallo.
2. Una carga **parcial** (fallo de uno o más namespaces) se rechaza con `ClusterDataLoadError` y `partial: true`.
3. Una carga **total** fallida se rechaza con `ClusterDataLoadError` y `partial: false`.
4. El diálogo **no habilita Drain** hasta que ambos cargadores resuelven correctamente y `storesLoaded` es verdadero.
5. El snapshot de previsualización (`initialEmptyDirPodUids`, `initialUnmanagedPodUids`, `initialPdbSnapshots`) se toma **después** de la carga completa, nunca antes. Un snapshot tomado antes de tiempo haría que todo Pod preexistente pareciera “nuevo” durante la revalidación.
6. Una generación de carga invalida respuestas viejas si el operador cambia de nodo mientras se consulta (`loadGeneration`).

### 2.2 Consulta fresca antes de Cordon (sin fallback a datos obsoletos)

`revalidatePreFlight(nodeName)` ejecuta, en orden:

1. **Identidad del clúster:** aborta si `cluster.id` cambió.
2. **Existencia del nodo:** `nodeApi.get({ name })`; aborta si el nodo ya no existe.
3. **Consulta fresca de Pods:** `podApi.list({}, { fieldSelector: "spec.nodeName=<node>" })`.
   - Si la consulta **falla**, se aborta antes de Cordon.
   - **No** se sustituye por el snapshot previo.
   - **No** se usa una segunda consulta alternativa como sustituto silencioso.
4. **Consentimientos:** `emptyDir` y Pods huérfanos requieren consentimiento explícito; cargas nuevas sin consentimiento abortan.
5. **Revalidación de PDB:** `podDisruptionBudgetApi.list()` y comparación contra el snapshot.

`podsToEvict` es exclusivamente el resultado de la consulta fresca. Una lista fresca vacía produce un drain exitoso con Cordon y cero evictions.

### 2.3 Revalidación de PDB antes de Cordon

Antes de acordonar se comparan los PDB aplicables contra la previsualización:

- PDB que aplicaba y **ya no existe** → abortar y exigir nueva confirmación.
- Cambio de `selector`, `minAvailable` o `maxUnavailable` → abortar.
- Cambio de clasificación (`allowed` / `blocked` / `unknown`) → abortar.
- Disminución de `disruptionsAllowed` → abortar.
- PDB **nuevo** que ahora aplica a un Pod objetivo → abortar.

Si la consulta de PDB falla, se aborta antes de Cordon. La Eviction API sigue siendo la autoridad final para aceptar o rechazar cada desalojo; la revalidación agrega una barrera previa, no la reemplaza.

### 2.4 Exclusión de DaemonSets y verificación fáctica

- Los DaemonSets quedan permanentemente excluidos (`targetPods = allPods.filter(p => !isDaemonSet(p))`).
- Tras Cordon se envían las evictions y se sondea la salida real de los Pods del nodo.
- Si la consulta de sondeo falla, la operación se reporta como error y el nodo permanece cordoned.
- Ante timeout o fallo posterior al Cordon, el nodo **permanece cordoned**. Nunca se ejecuta Uncordon automático.

---

## 3. Hardening de Node Shell

### 3.1 Principio de diseño

El renderer **no puede autorizar**. Solo puede **solicitar** una autorización. El proceso principal:

1. valida que la solicitud provenga del frame del clúster correcto;
2. valida que el clúster exista y tenga Node Shell habilitado;
3. verifica la existencia del nodo;
4. ejecuta la confirmación nativa cuando el clúster es `PROD`;
5. revalida clúster, preferencia y nodo después de la confirmación;
6. emite un grant opaco, lo registra y **recién entonces** responde.

Canal IPC: `node-shell:request-authorization`.

El canal anterior `node-shell:authorize-prod` ya no se registra. Una invocación directa al canal viejo no obtiene handler y no crea autorización.

### 3.2 Validación del emisor

La solicitud debe originarse en el frame del clúster que se está operando:

- `senderFrame.parent !== null` (no el renderer top-level).
- Origen exacto `https://<clusterId>.lens.app:<lensProxyPort>`.

Se reutiliza el mismo criterio de `isClusterFrameSender` usado por la infraestructura IPC desde R4-09. Un frame del clúster A no puede solicitar autorización para el clúster B.

### 3.3 Grant de un solo uso

`NodeShellAuthRegistry` (solo main) mantiene grants con:

- `grantId`: 32 bytes aleatorios, codificados en base64url. Es generado por main y se usa como `tabId` de la terminal.
- `clusterId`, `nodeName`, `operation`: vínculo exacto a la operación aprobada.
- `productionConfirmed`: verdadero solo si una confirmación nativa de `PROD` lo aprobó.
- `createdAt`: TTL de 60 segundos.

`consume()` elimina el grant en el primer intento, incluso si el contexto no coincide. No hay reintentos contra el mismo grant.

### 3.4 Orden de la operación (sin carrera)

```text
Renderer                         Main
   |  request { clusterId, nodeName }
   |------------------------------->|
   |                                | valida frame emisor
   |                                | valida clúster/preferencia
   |                                | verifica nodo
   |                                | confirmación nativa (PROD)
   |                                | revalida contexto + nodo
   |                                | registry.issue(...)
   |<-------------------------------| { granted, tabId }
   | createNodeTerminalTab({ nodeName, tabId })
   |                                |
   | WebSocket open(tabId, nodeName)|
   |------------------------------->| registry.consume(grantId=tabId, cluster, node, operation)
```

El grant se registra **antes** de que el renderer pueda crear la pestaña. El `tabId` es el identificador emitido por main; un `tabId` elegido por el renderer no tiene grant y es rechazado.

### 3.5 Defensa en profundidad en el backend

`openNodeShellSessionInjectable` mantiene:

1. `cluster.preferences.nodeShellEnabled === true`.
2. En `PROD`, `registry.consume(...)` con `requireProductionConfirmation: true`.
3. Verificación de existencia del nodo antes de crear el Pod privilegiado.

`NodeShellSession` vuelve a comprobar el nodo para determinar el sistema operativo antes de abrir el proceso.

---

## 4. Cordon y Uncordon

Sin cambios respecto del diseño previo:

1. Strategic merge patch sobre `spec.unschedulable`.
2. Tratamiento semántico de 403 y 409.
3. Aborto por cambio de contexto de clúster.
4. Confirmación obligatoria en `PROD` también para Uncordon.

---

## 5. Invariantes del gate final

- El renderer nunca registra autorizaciones.
- El proceso principal es la única autoridad de concesión.
- La autorización se registra antes de iniciar la sesión.
- El grant está ligado a clúster, nodo, operación y confirmación de producción.
- Expira a los 60s y es de un solo uso.
- Node Shell sigue deshabilitado por defecto.
- Una consulta fresca vacía de Pods es éxito; una consulta fresca fallida aborta antes de Cordon.
- Nunca se usan Pods del snapshot previo para evictar.
- Drain no se habilita con datos parciales o incompletos.
- Los PDB se revalidan antes de Cordon y cualquier cambio relevante exige nueva confirmación.
