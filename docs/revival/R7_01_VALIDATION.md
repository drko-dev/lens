# OpenLens DevOps Revival — R7-01 Certificación y Validación

**Hito:** R7-01 — Mantenimiento Seguro de Nodos y Shell del Sistema  
**Rama:** `feat/r7-devops-capabilities`  
**Base:** `731fb1ff4bf4b3cc1fb74972f1cb6428acdce6e0`  
**Fecha:** 2026-10-23  
**Resultado:** PASS — con evidencia de comportamiento, no solo presencia visual.

---

## 1. Matriz de Validación

| Disciplina | Alcance | Resultado |
|---|---|---|
| TypeScript | `packages/core` (`npx tsc --noEmit -p packages/core/tsconfig.json`) | **0 errores** |
| ESLint | `src/main/shell-session`, `src/main/ipc`, `setup-ipc-main-handlers`, `renderer/components/nodes`, cargadores y error tipado | **0 errores, 0 warnings** |
| Jest | Node Shell, Drain, cargadores, menú de nodos (7 suites) | **78/78 PASS** |
| Playwright E2E | App empaquetada ARM64 con fixtures Kubernetes sintéticos | **16/16 checkpoints PASS** |
| Auditoría de seguridad | Tres defectos del gate final | **Corregidos y cubiertos** |

---

## 2. TypeScript

Comando:

```bash
npx tsc --noEmit -p packages/core/tsconfig.json
```

Resultado: `exit 0`, sin diagnósticos.

---

## 3. ESLint

Comando:

```bash
cd packages/core
PROD=true npx eslint --ext js,ts,tsx --max-warnings=0 \
  src/main/shell-session \
  src/main/ipc \
  src/main/electron-app/runnables/setup-ipc-main-handlers \
  src/renderer/components/nodes \
  src/renderer/components/workloads-pods/load-pods-from-all-namespaces.injectable.ts \
  src/renderer/utils/cluster-data-load-error.ts
```

Resultado: `exit 0`, sin errores ni warnings.

---

## 4. Jest

Comando:

```bash
cd packages/core
npx jest \
  src/main/shell-session/node-shell-session \
  src/renderer/components/nodes/node-menu.test.tsx \
  src/renderer/components/nodes/drain-dialog \
  --verbose
```

Resultado:

```text
PASS src/main/shell-session/node-shell-session/node-shell-authorization-handler.test.ts   (16 tests)
PASS src/main/shell-session/node-shell-session/confirm-production-node-shell.test.ts     (4 tests)
PASS src/main/shell-session/node-shell-session/open-node-shell.test.ts                   (7 tests)
PASS src/main/shell-session/node-shell-session/node-shell-ipc-registration.test.ts       (1 test)
PASS src/renderer/components/nodes/drain-dialog/load-from-all-namespaces.test.ts         (6 tests)
PASS src/renderer/components/nodes/node-menu.test.tsx                                    (14 tests)
PASS src/renderer/components/nodes/drain-dialog/drain-dialog.test.tsx                   (30 tests)

Test Suites: 7 passed, 7 total
Tests:       78 passed, 78 total
```

### 4.1 Registro del handler en startup

`node-shell-ipc-registration.test.ts` verifica que el handler
`node-shell:request-authorization` queda registrado al instanciarse la fábrica de sesión de Node
Shell, que ocurre durante el arranque de LensProxy. Si el registro fuera perezoso (dentro del
`open` asíncrono), el renderer pediría autorización antes de que exista un handler y PROD Node Shell
sería inutilizable.

### 4.2 Cobertura negativa de Node Shell

- Invocación IPC directa desde el renderer top-level: rechazada (`unauthorized-sender`).
- Invocación desde el frame de otro clúster: rechazada.
- `tabId` o `grantId` provisto por el renderer: rechazado (`invalid-request`).
- Firma vieja de tres argumentos: rechazada.
- Confirmación PROD cancelada: sin grant.
- Cambio de contexto durante la confirmación: sin grant.
- Nodo eliminado durante la confirmación: sin grant.
- Grant falsificado: rechazado.
- Reutilización: rechazada.
- Expiración a 60s: rechazada.
- Cambio de clúster, nodo u operación: rechazado.
- Grant no-PROD usado con exigencia de confirmación PROD: rechazado.

### 4.3 Cobertura de Drain

- Lista fresca vacía → Cordon + cero evictions + éxito.
- Consulta fresca fallida → aborto antes de Cordon + cero evictions.
- Pod eliminado entre preview y ejecución → no evictado.
- Pod migrado a otro nodo → no evictado.
- PDB nuevo / eliminado / reglas cambiadas / clasificación cambiada / presupuesto disminuido → aborto antes de Cordon.
- Consulta de PDB fallida → aborto antes de Cordon.
- Carga parcial o total → Drain bloqueado.
- Carga incompleta → snapshot post-carga y sin falsos “Pods nuevos”.

### 4.4 Cobertura de carga

- Pods: resultado vacío completo → resuelve.
- Pods: fallo parcial de namespace → rechaza con `partial: true`.
- Pods: fallo total → rechaza sin `partial`.
- PDB: resultado vacío completo → resuelve.
- PDB: fallo parcial → rechaza con `partial: true`.
- PDB: fallo total → rechaza sin `partial`.

---

## 5. Playwright E2E dirigido

Script: `docs/revival/scripts/verify-r7-01-node-ops.cjs`  
Ejecutable: `open-lens/dist-r7-01-stage/mac-arm64/OpenLens DevOps.app`  
Entorno: ARM64, fixtures sintéticos locales en `127.0.0.1`; **sin clústeres reales**.

### 5.1 Salida

```text
=== OpenLens DevOps Revival — R7-01 E2E Verification ===
✓ Node Shell authorization handler registered at startup.
✓ Catalog loaded successfully.
✓ Single-node cluster outage warning certified.
✓ Typing gate protection certified.
✓ Node Shell disabled by default certified.
✓ Disabled Node Shell produced no privileged pod creation.
✓ PROD hazard banner displayed.
✓ emptyDir consent checkbox detected.
✓ Unmanaged pod consent checkbox detected.
✓ PDB 0-allowed disruption warning detected.
✓ Workload & PDB verified status badge detected.
✓ DaemonSets permanently excluded certified.
✓ Fresh empty pod list completed as cordon-only drain (no stale eviction).
✓ Pod deleted between preview and execution was not evicted.
✓ Pod migrated to another node was not evicted.
✓ Changed PDB status aborted the drain before Cordon.
✓ Failed fresh pod query aborted before Cordon with no eviction.

>>> ALL R7-01 PLAYWRIGHT VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<
```

### 5.2 Registro del handler en la app empaquetada

Antes de cargar el renderer, el script consulta el registro interno de `ipcMain` en el proceso
principal y verifica que `node-shell:request-authorization` esté registrado. Esto cubre el modo de
falla crítico: si el registro fuera perezoso, el renderer pediría autorización antes de que exista
un handler y PROD Node Shell nunca funcionaría.

### 5.3 Evidencia mutacional

`R7_01_VERIFICATION.json` registra las únicas mutaciones dirigidas observadas:

```json
"directedMutations": [
  "PATCH /api/v1/nodes/prod-worker-2",
  "PATCH /api/v1/nodes/prod-worker-3",
  "PATCH /api/v1/nodes/prod-worker-4"
]
```

Interpretación:

- Los tres Cordon corresponden a los casos exitosos: lista fresca vacía, Pod eliminado y Pod migrado.
- **No hay ningún POST de eviction** en la sección dirigida.
- **No hay PATCH para `prod-worker-1`** en los casos de PDB cambiado ni de consulta fallida: ambos abortaron antes de Cordon.
- El clic sobre Node Shell deshabilitado no produjo ningún `POST /pods` (no se creó Pod privilegiado).

### 5.4 Evidencia visual

| Archivo | Checkpoint |
|---|---|
| `01-catalog-view.png` | Catálogo con clusters DEV y PROD. |
| `02-nodes-view-dev.png` | Vista de nodos DEV. |
| `03-single-node-outage-warning.png` | Advertencia de indisponibilidad total mononodo. |
| `04-drain-typing-gate-locked.png` | Barrera de tipeo bloqueada. |
| `05-drain-typing-gate-unlocked.png` | Barrera de tipeo desbloqueada. |
| `06-node-shell-disabled-by-default.png` | Node Shell deshabilitado por defecto. |
| `07-prod-drain-preflight-pdb-emptydir.png` | Preflight PROD con PDB, emptyDir y Pod huérfano. |
| `08-pdb-change-aborts-before-cordon.png` | PDB cambiado: aborto antes de Cordon. |
| `09-pod-query-failure-aborts-before-cordon.png` | Consulta fresca fallida: aborto antes de Cordon. |

---

## 6. Limitaciones declaradas

- La confirmación de Node Shell en PROD es un diálogo nativo del proceso principal. Playwright no lo autoaprueba para no falsear la barrera de seguridad. Las pruebas negativas de autorización se ejecutan en Jest, donde se puede invocar el handler con eventos de frame sintéticos.
- Playwright verifica el efecto observable del control deshabilitado: ningún Pod privilegiado creado. No declara PASS por la sola presencia del botón.
- La Eviction API real no se invoca en E2E: el fixture simula el servidor. La autoridad final de eviction sigue siendo Kubernetes en producción.

---

## 7. Dictamen

Los tres defectos del gate final quedaron corregidos y verificados:

1. **Node Shell PROD:** la autorización es emitida y registrada exclusivamente por main, ligada al frame emisor, clúster, nodo y operación; el renderer no puede autoautorizarse ni elegir el identificador; el grant es de un solo uso con TTL y se registra antes de crear la pestaña.
2. **Drain:** no existe fallback a Pods previos; una lista fresca vacía es éxito y una consulta fresca fallida aborta antes de Cordon.
3. **PDB:** la carga distingue completa de parcial; Drain no se habilita sin consultas completas; los PDB se revalidan antes de Cordon y cualquier cambio relevante exige nueva confirmación.

**R7-01 queda listo para autorización de commit local.** No se realizó commit ni push.
