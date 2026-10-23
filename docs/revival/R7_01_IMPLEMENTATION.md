# OpenLens DevOps Revival — R7-01 Implementación Técnica (Security Hardened)

**Hito:** R7-01 — Mantenimiento Seguro de Nodos y Shell del Sistema  
**Rama:** `feat/r7-devops-capabilities`  
**Base:** `731fb1ff4bf4b3cc1fb74972f1cb6428acdce6e0`  
**Fecha:** 2026-10-23  
**Estado:** Correcciones del gate final implementadas y verificadas.

---

## 1. Resumen Ejecutivo

R7-01 agrega `Cordon`, `Uncordon`, `Drain` y `Node Shell` con defensas de nivel producción. El gate final corrigió tres defectos detectados por revisión directa:

1. **Node Shell PROD:** el renderer ya no puede registrar autorizaciones por IPC. El proceso principal emite un grant opaco, ligado al frame emisor, clúster, nodo, operación y confirmación nativa, y lo registra antes de responder. El `tabId` es el grant emitido por main.
2. **Drain sin fallback a Pods obsoletos:** la lista fresca es la única fuente de eviction. Una lista fresca vacía es éxito; una consulta fresca fallida aborta antes de Cordon.
3. **Carga y revalidación de PDB:** los cargadores devuelven promesas que distinguen carga completa de parcial; Drain permanece deshabilitado hasta completar ambas consultas; los PDB se revalidan antes de Cordon y cualquier cambio relevante cancela la operación.

---

## 2. Node Shell — Autorización controlada por Main

### 2.1 Flujo

```text
node-menu (cluster frame)
  -> authorizeNodeShell({ clusterId, nodeName })        [renderer]
  -> ipc "node-shell:request-authorization"             [main]
       - isClusterFrameSender(event, clusterId)
       - getClusterById + nodeShellEnabled
       - verifyNodeExists
       - confirmProductionNodeShell (solo PROD)
       - revalidate context + node
       - registry.issue({ clusterId, nodeName, operation, productionConfirmed })
  <- { granted: true, tabId: <opaque grant id> }
  -> createNodeTerminalTab({ nodeName, tabId })
  -> WebSocket shell -> registry.consume({ grantId: tabId, clusterId, nodeName, operation, requireProductionConfirmation: true })
```

### 2.2 Propiedades de seguridad

- El renderer solo envía `{ clusterId, nodeName }`.
- Se rechazan `tabId`, `grantId` y argumentos extra en la invocación IPC.
- El frame emisor debe ser el frame del clúster (`https://<clusterId>.lens.app:<port>`), nunca el renderer top-level ni otro clúster.
- El grant se registra antes de la respuesta; no hay ventana entre autorización y creación de pestaña.
- `tabId` es generado por main (32 bytes aleatorios, base64url).
- TTL 60s, consumo único, eliminación incluso ante mismatch de contexto.
- `productionConfirmed` impide que un grant emitido en un clúster no-PROD se use si el clúster pasa a PROD.
- Se verifica el nodo antes del diálogo y después de la confirmación.
- Node Shell deshabilitado por defecto permanece obligatorio en handler y backend.
- El canal viejo `node-shell:authorize-prod` ya no se registra.

---

## 3. Drain — Consulta fresca y revalidación de PDB

### 3.1 Cargadores

- `load-pods-from-all-namespaces.injectable.ts`
- `load-pdbs-from-all-namespaces.injectable.ts`

Ambos:

- devuelven una promesa que se puede esperar;
- recolectan fallos por namespace y rechazan con `ClusterDataLoadError`;
- distinguen `partial: true` de `partial: false`;
- verifican `isLoaded` y `failedLoading` después del `await`, sin confiar en flags mutables reseteados por un éxito parcial;
- consideran una lista vacía como éxito completo.

`ClusterDataLoadError` vive en `src/renderer/utils/cluster-data-load-error.ts`.

### 3.2 `DrainNodeDialog`

- `loadGeneration` descarta respuestas de cargas viejas si cambió el nodo.
- El snapshot de previsualización se toma **después** de la carga completa.
- `dataStatus` queda en `loading` hasta que `storesLoaded` es verdadero; el botón Drain permanece deshabilitado.
- `revalidatePreFlight` ya no usa fallback a Pods previos ni a una segunda consulta silenciosa. Si la consulta fresca falla, aborta antes de Cordon.
- `podsToEvict = freshTargetPods`. Lista vacía → Cordon + notificación de éxito sin evictions.
- PDB: se detectan PDB nuevos, eliminados, cambios de selector/reglas, cambios de clasificación y disminución de `disruptionsAllowed`.
- El sondeo de terminación tampoco usa una lista alternativa si falla la consulta; reporta error y el nodo permanece cordoned.

---

## 4. Archivos

| Archivo | Rol |
|---|---|
| `packages/core/src/common/cluster-types.ts` | `nodeShellEnabled?: boolean` en `ClusterPreferences`. |
| `packages/core/src/common/k8s-api/endpoints/node.api.ts` | `cordon` / `uncordon` vía strategic merge patch. |
| `packages/core/src/main/ipc/is-cluster-frame-sender.ts` | Validación compartida del frame emisor (extraída de R4-09). |
| `packages/core/src/main/shell-session/node-shell-session/node-shell-auth-registry.ts` | Grants main-owned: emisión, TTL, consumo único, vínculo de contexto y operación. |
| `packages/core/src/main/shell-session/node-shell-session/node-shell-authorization-handler.ts` | Handler IPC `node-shell:request-authorization`; validación de emisor, clúster, nodo, confirmación y revalidación. |
| `packages/core/src/main/shell-session/node-shell-session/node-shell-auth-registry.injectable.ts` | Wiring de DI, handler y selector del frame emisor. |
| `packages/core/src/main/shell-session/node-shell-session/open.injectable.ts` | Inyección eager del registry (registro del handler en startup) y consumo del grant antes de crear el Pod. |
| `packages/core/src/main/shell-session/node-shell-session/confirm-production-node-shell.injectable.ts` | Confirmación nativa PROD (sin cambios de comportamiento). |
| `packages/core/src/renderer/components/nodes/authorize-node-shell.injectable.ts` | Solicitud IPC tipada; valida la respuesta y exige `tabId` emitido por main. |
| `packages/core/src/renderer/components/nodes/node-menu.tsx` | Solicita autorización, valida cambio de contexto y crea la pestaña con el `tabId` de main. |
| `packages/core/src/renderer/components/dock/terminal/create-node-terminal-tab.injectable.ts` | Pestaña de terminal de nodo. |
| `packages/core/src/renderer/components/kube-object-menu/kube-object-menu-items/node-menu.injectable.ts` | Registro del menú de nodo. |
| `packages/core/src/renderer/utils/cluster-data-load-error.ts` | Error tipado que distingue carga parcial de total. |
| `packages/core/src/renderer/components/workloads-pods/load-pods-from-all-namespaces.injectable.ts` | Cargador de Pods con promesa y detección de carga parcial. |
| `packages/core/src/renderer/components/nodes/drain-dialog/load-pdbs-from-all-namespaces.injectable.ts` | Cargador de PDB con promesa y detección de carga parcial. |
| `packages/core/src/renderer/components/nodes/details.tsx` | Captura el rechazo del cargador para evitar unhandled rejection. |
| `packages/core/src/renderer/components/nodes/drain-dialog/drain-dialog.tsx` | Revalidación fresca, snapshot post-carga, PDB y ejecución endurecida. |
| `packages/core/src/renderer/components/nodes/drain-dialog/drain-dialog.scss` | Banners y estilos de estado. |
| `packages/core/src/renderer/components/nodes/drain-dialog/drain-dialog.test.tsx` | 30 pruebas de drain, incluyendo lista fresca vacía, consulta fallida, Pod eliminado, Pod migrado y PDB. |
| `packages/core/src/renderer/components/nodes/drain-dialog/load-from-all-namespaces.test.ts` | 6 pruebas de carga completa/parcial/total. |
| `packages/core/src/renderer/components/nodes/node-menu.test.tsx` | 14 pruebas de menú, incluida la autorización PROD y el rechazo de `tabId` sin grant. |
| `packages/core/src/main/shell-session/node-shell-session/node-shell-authorization-handler.test.ts` | 16 pruebas negativas de IPC, emisor, grant, reutilización, expiración y cambio de contexto. |
| `packages/core/src/main/shell-session/node-shell-session/node-shell-ipc-registration.test.ts` | Verifica el registro del handler durante el startup. |
| `packages/core/src/common/node-shell-channels.ts` | Canal IPC y operación compartidos entre main y renderer. |
| `packages/core/src/main/shell-session/node-shell-session/open-node-shell.test.ts` | 7 pruebas del backend de Node Shell. |
| `packages/core/src/main/shell-session/node-shell-session/confirm-production-node-shell.test.ts` | 4 pruebas del diálogo nativo. |
| `docs/revival/scripts/verify-r7-01-node-ops.cjs` | Verificación Playwright dirigida con fixtures sintéticos. |

---

## 5. Regresiones añadidas (mapa de cobertura)

### Node Shell

- Invocación IPC directa desde top-level → rechazada.
- Invocación desde el frame de otro clúster → rechazada.
- `tabId`/`grantId` provisto por el renderer → rechazado.
- Llamada con la firma vieja de tres argumentos → rechazada.
- Confirmación PROD cancelada → sin grant.
- Cambio de contexto durante el diálogo → sin grant.
- Nodo eliminado durante el diálogo → sin grant.
- Grant falsificado / desconocido → rechazado.
- Reutilización → rechazada.
- Expiración a 60s → rechazada.
- Cambio de clúster, nodo u operación → rechazado.
- Grant no-PROD usado con exigencia de confirmación PROD → rechazado.

### Drain

- Lista fresca vacía → Cordon, cero evictions, éxito.
- Consulta fresca fallida → aborto antes de Cordon, cero evictions.
- Pod eliminado entre preview y ejecución → no se evicta.
- Pod migrado a otro nodo → no se evicta.
- PDB eliminado / con reglas cambiadas / con clasificación cambiada / con presupuesto disminuido / nuevo → aborto antes de Cordon.
- Consulta de PDB fallida → aborto antes de Cordon.
- Carga parcial o total → Drain deshabilitado.
- Carga incompleta → snapshot se toma después, sin falsos “Pods nuevos”.

---

## 6. No objetivos respetados

- Sin cambios en R5-09 ni R6-RC.
- Sin inicio de R7-02.
- Sin funcionalidades nuevas fuera de las correcciones del gate.
- Sin operaciones contra clústeres reales.
- Sin commit ni push.
