# H8.0 — Plan de Implementación del Primer Incremento Funcional (H8.1)

**Fecha:** 2026-11-05
**Hito:** H8.0 — Fundaciones de Arquitectura y Seguridad
**Objetivo:** Plan de acción detallado para ejecutar H8.1 con máxima seguridad y sin regresiones sobre H7
**Estado:** REVISADO / LISTO PARA APROBACIÓN

---

## 1. Estrategia de Git y Ajuste del Entorno

### 1.1. Punto de Partida
- **Rama base:** `origin/develop` actualizado, conteniendo el commit de merge del PR #2:
  `00750261947b2dbaf890b0242e05ee081c733009` (verificado mediante `git fetch origin develop`).
- **Nueva rama autorizada para H8:**
  `feature/h8-ai-incident-workbench` (a crearse a partir de `origin/develop`).

### 1.2. Ajuste del Lanzador y Directivas Gemini
El script [`scripts/ai/start-gemini-h7.sh`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/scripts/ai/start-gemini-h7.sh#L13) y [`GEMINI.md`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/GEMINI.md#L8) actualmente validan de forma estricta la rama `feature/global-docking-h7`.
Para trabajar en H8 sin romper la configuración canónica de Engram:
1. Se creará `scripts/ai/start-gemini-h8.sh` que apunte a `feature/h8-ai-incident-workbench` preservando `ENGRAM_PROJECT="lens-v6-ui-corrections"` y el directorio de trabajo canónico.
2. Se actualizará `GEMINI.md` indicando que la rama activa de desarrollo es `feature/h8-ai-incident-workbench` y que H7 / RC4 está congelado como línea base estable.

---

## 2. Desglose Detallado de Historias para H8.1 (Sprint 1)

El objetivo de H8.1 es entregar un **Centro de Incidentes local 100% funcional, persistente en SQLite, con timeline de estados y trazabilidad de evidencias, SIN conectar proveedores de IA externos ni requerir clústeres reales**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FLUJO DE DEPENDENCIAS H8.1                      │
│                                                                        │
│   [H8-004 Spike SQLite] ────────────────────────┐                      │
│            │                                    │                      │
│            ▼                                    ▼                      │
│   [H8-005 Repositorio SQLite] ──────► [H8-006 Estados/Workflow]        │
│            │                                    │                      │
│            ▼                                    ▼                      │
│   [H8-008 Evidencias/Auditoría] ────► [H8-007 UI Workbench]            │
│            │                                    │                      │
│            └────────────────────────────────────┴─────► [H8-009 Purga] │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Historia 1: H8-005 — Repositorio SQLite para Incidentes
- **Objetivo:** Inicializar la base de datos local en Electron Main, aplicar migraciones idempotentes y exponer operaciones CRUD básicas para incidentes.
- **Dependencias:** Spike de SQLite resuelto (`TEST-SQLITE-01` a `05`).
- **Archivos a Crear/Modificar:**
  - `packages/core/src/main/incident-storage/sqlite-client.ts` (Driver, conexión WAL, integrity check, recovery).
  - `packages/core/src/main/incident-storage/migrations/001_initial_schema.sql` (Tablas `incidents`, `evidence`, `timeline_events`, `schema_migrations`).
  - `packages/core/src/main/incident-storage/incident-repository.ts` (CRUD persistente).
  - `packages/core/src/main/incident-storage/incident-repository.injectable.ts`.
  - `packages/core/src/main/ipc/incident-ipc-handlers.ts` (Canales IPC con validación Zod).
- **Pruebas Mínimas:**
  - Test unitario Jest en Main: crear incidente, recuperar por ID, actualizar estado, listar filtrando por cluster y namespace.
  - Test de supervivencia: insertar datos, forzar reconexión y verificar que los datos persisten intactos.

---

### Historia 2: H8-006 — Estados y Trazabilidad de un Caso
- **Objetivo:** Implementar la máquina de estados estricta del incidente y el registro de eventos en el timeline.
- **Workflow:**
  `DETECTADO` $\rightarrow$ `INVESTIGANDO` $\rightarrow$ `HIPÓTESIS` $\rightarrow$ `CONFIRMADO` $\rightarrow$ `SOLUCIÓN PROPUESTA` $\rightarrow$ `APROBACIÓN HUMANA` $\rightarrow$ `VALIDACIÓN` $\rightarrow$ `CERRADO`.
  (Ramas alternas: `NO CONFIRMADO`, `INCONCLUSO`).
- **Regla de Negocio:**
  - No se permite transicionar a `CONFIRMADO` sin al menos una referencia de evidencia asociada.
  - Cada transición genera un registro en la tabla `incident_timeline` con `{ timestamp, author: "human" | "system" | "ai", justification, fromState, toState }`.
- **Archivos a Crear/Modificar:**
  - `packages/core/src/common/incident/incident-types.ts` (Enums de estados, tipos de evidencia, schemas Zod).
  - `packages/core/src/common/incident/incident-state-machine.ts` (Lógica pura de validación de transiciones).
  - `packages/core/src/common/incident/__tests__/incident-state-machine.test.ts`.
- **Pruebas Mínimas:**
  - Pruebas unitarias completas de la máquina de estados (transiciones válidas, rechazo de saltos inválidos, bloqueo de "CONFIRMADO" sin evidencia).

---

### Historia 3: H8-008 — Evidencia Versionada, Deduplicada y Auditada
- **Objetivo:** Persistir evidencias acotadas vinculadas a un incidente, garantizando que no se guarden secretos en claro.
- **Regla de Negocio:**
  - Cada evidencia registra: `type` (`pod_logs`, `k8s_event`, `resource_manifest`, `cost_estimate`), `clusterId`, `namespace`, `resourceUid`, `capturedAt`, `contentSnippet` (redactado y acotado a un máximo de 64 KB).
  - Los adjuntos manuales ("Agregar contexto") solo guardan metadatos: `{ filename, sha256, userDeclaredVersion }`. El contenido crudo **no** se persiste.
- **Archivos a Crear/Modificar:**
  - `packages/core/src/main/incident-storage/evidence-repository.ts`.
  - `packages/core/src/main/incident-storage/__tests__/evidence-repository.test.ts`.
- **Pruebas Mínimas:**
  - Test de persistencia de evidencia con redacción automática.
  - Verificación de rechazo de payloads que excedan el límite de tamaño fijado.

---

### Historia 4: H8-007 — UI Centro de Incidentes y Incident Workbench
- **Objetivo:** Construir la interfaz de usuario en el Renderer integrada fluidamente con la arquitectura de OpenLens y Global Docking.
- **Diseño de Integración:**
  1. **Vista Global (Sidebar Raíz):** Entrada "Incidentes" en el menú lateral principal para visualizar y filtrar casos multiclúster.
  2. **Panel de Detalle / Workbench:** Registrado como `panelKind: "incident-workbench"` en [`split-panel-types.ts`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/split-panel/split-panel-types.ts). Permite acoplar, dividir y persistir el workbench junto a Pods o Logs.
  3. **Acción Contextual:** Botón "Crear Incidente / Diagnosticar" en la vista de Workloads/Pods.
- **Archivos a Crear/Modificar:**
  - `packages/core/src/renderer/components/split-panel/split-panel-types.ts` (Agregar `incident-workbench`).
  - `packages/core/src/features/incident-workbench/renderer/incident-store.ts` (Store reactivo MobX).
  - `packages/core/src/features/incident-workbench/renderer/incident-list-view.tsx` (Lista filtrable).
  - `packages/core/src/features/incident-workbench/renderer/incident-workbench-panel.tsx` (Ficha de detalle, timeline, hipótesis).
  - `packages/core/src/renderer/components/split-panel/panel-content-resolver.tsx` (Resolver el nuevo panelKind).
- **Pruebas Mínimas:**
  - Test de renderizado de componentes con React Testing Library / Jest.
  - Smoke interactivo en Electron DEV: abrir la vista, crear un incidente sintético, cambiar de estado y verificar que persiste al recargar la ventana.

---

### Historia 5: H8-009 — Conservación de Incidentes Configurable
- **Objetivo:** Panel de ajustes para configurar la retención de incidentes y ejecución de purgas programadas en el arranque.
- **Archivos a Crear/Modificar:**
  - `packages/core/src/renderer/components/preferences/incident-retention-preference.tsx`.
  - `packages/core/src/main/incident-storage/incident-purger.ts` (Rutina de purga que respeta casos protegidos / fijados).
- **Pruebas Mínimas:**
  - Test unitario: crear incidentes con fechas simuladas pasadas, ejecutar purga y verificar que los fijados permanecen y los vencidos se eliminan.

---

## 3. Presupuesto de Pruebas y Salvaguardas

Para no repetir el esfuerzo de H7 ni sobrecargar el entorno:
1. **NO ejecutar la suite integral de 186 tests de H7 de forma rutinaria.** Los tests de H7 permanecen congelados y verdes en RC4.
2. **Validación por Capas para H8.1:**
   - **Capa 1 (Unitaria rápida):** Tests focalizados con Jest en `packages/core` para repositorios, schemas y state machine (`npx jest --runInBand src/main/incident-storage`).
   - **Capa 2 (Integración IPC):** Tests de canales IPC con mocks de Electron.
   - **Capa 3 (Smoke Electron DEV focalizado):** Un escenario sintético de 5 pasos en el runner de Playwright (`open-lens/integration/h8-incident-smoke.mjs`):
     1. Iniciar app en entorno DEV aislado.
     2. Navegar a Centro de Incidentes.
     3. Crear un caso manual sobre clúster sintético (`INC-001`).
     4. Avanzar estado a `INVESTIGANDO` y agregar una nota de timeline.
     5. Reiniciar app y verificar que `INC-001` sigue existiendo intacto con su historial.

---

## 4. Estado de Tareas del Plan

- [x] Estrategia de Git definida a partir de `origin/develop` (**REVISADO**).
- [x] Especificación de ajustes al lanzador Gemini (**REVISADO**).
- [x] Desglose de historias H8-005 a H8-009 con archivos y pruebas (**REVISADO**).
- [x] Definición del presupuesto de pruebas acotado (**REVISADO**).
- [x] Ejecución de la rama `feature/h8-ai-incident-workbench` (**COMPLETADO**).
- [x] Spike comparativo de SQLite `TEST-SQLITE-01` a `05` (**COMPLETADO / better-sqlite3**).
- [x] Historia H8-005: Repositorio SQLite local de incidentes (`sqlite-client`, `incident-repository`, 15 unit tests PASS) (**COMPLETADO**).
- [x] Historia H8-006: Estados y trazabilidad de un caso (State machine, transiciones atómicas, validación de evidencias, 29 unit tests PASS) (**COMPLETADO**).
- [ ] Historia H8-008: Evidencia versionada y sanitizada (**SIGUIENTE PASO**).
- [ ] Historia H8-007: UI Centro de Incidentes y Incident Workbench (**PENDIENTE**).
- [ ] Historia H8-009: Conservación de incidentes configurable (**PENDIENTE**).
