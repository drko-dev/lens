# STAB-00 — Línea Base de Auditoría TypeScript y Estabilización

**Fecha:** 2026-11-07  
**Rama de trabajo:** `feature/stabilization-typescript-20261107`  
**Worktree aislado:** `/private/var/tmp/lens-stabilization-typescript-20261107`  
**Commit base:** `develop` local (`914152fa3672473f20e9653df031027776432e47`)  
**Comparativa upstream:** `origin/develop` (`00750261`), 79 commits locales no publicados  
**Entorno de ejecución:** Node.js v24.22.2, npm v11.19.1, macOS Darwin ARM64  
**Compilador:** Webpack 5.83.1 con `ForkTsCheckerWebpackPlugin` activo (sin `SKIP_TS_CHECK=1`)  

---

## 1. Verificación de Git y Entorno

- **Repositorio:** `lens-v6-ui-corrections`
- **Worktree principal:** `/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections` (preservado intacto)
- **Worktrees existentes respetados:**
  - `/private/var/tmp/lens-h8-8-ai-incidents-20261107` (`feature/h8-8-ai-incidents-real-integration`)
  - `/private/var/tmp/novakube-remote-review-20261107` (`feature/novakube-final-review-20261107`)
- **Nuevo worktree creado para estabilización:**
  - `/private/var/tmp/lens-stabilization-typescript-20261107` en la rama `feature/stabilization-typescript-20261107`
- **Reglas de seguridad activas:**
  - Sin `git push`, sin `git merge` hacia `develop`, sin modificar PR #3.
  - Sin comandos destructivos (`git reset --hard`, `git clean -fd`).
  - Sin `SKIP_TS_CHECK=1`, sin `@ts-ignore`/`@ts-nocheck`, sin `any` tramposo.
  - Sin desactivar `ForkTsCheckerPlugin` ni excluir carpetas en `tsconfig.json`.

---

## 2. Métricas Globales de la Línea Base

Al ejecutar la compilación de producción en `packages/core` (`cross-env NODE_ENV=production webpack --config webpack/library-bundle.ts --progress`):

- **Total de errores TypeScript reportados:** **123**
- **Errores en código productivo:** **74**
- **Errores en archivos de prueba (`.test.ts*`, `__tests__`):** **49**
- **Archivos totales afectados:** **62**
- **Distribución por directorio:**
  - `./src/common`: 11 errores
  - `./src/extensions`: 1 error
  - `./src/features`: 17 errores
  - `./src/main`: 70 errores
  - `./src/renderer`: 24 errores

---

## 3. Agrupación y Mapeo de Fases de Resolución

### STAB-01: Contratos de Incidentes e IPC (30 errores de producción)
- **Causas Raíz:**
  1. Tipos canónicos faltantes o renombrados en `packages/core/src/common/incident/incident-types.ts`:
     - Falta exportar `TimelineActor` (o reconciliar con `IncidentActor`).
     - Falta exportar `UpdateIncidentInput`.
     - Falta exportar `IncidentTransitionResult`.
     - `IncidentFilter` no declara `workloadKind`, `workloadName` ni `searchQuery`.
     - `IncidentActor` tiene `id` obligatorio en el tipo, pero múltiples llamadores instancian `{ type: "human", name: string }` sin `id`, y carece de `metadata?: Record<string, any>`.
     - `UserContextMetadataInput` e `IngestEvidenceInput` tienen discrepancias de campos opcionales/obligatorios (`metadata`, `resourceUid`, `fileName`, etc.).
  2. Métodos desalineados en Store y Componentes:
     - `IncidentStore` referencia `loadTimeline()` que no existe en el store.
     - `incident-list-view.tsx` y `incident-workbench-panel.tsx` pasan estructuras incompletas a `CreateIncidentInput` e `IngestEvidenceInput`.

### STAB-02: IA y Centro de Incidentes (21 errores de producción)
- **Causas Raíz:**
  1. `ai-diagnostics`:
     - Discrepancias en contratos de diagnóstico (`ai-diagnosis-engine.ts`, `ai-budget-tracker.ts`, `ephemeral-context-manager.ts`).
     - Tipos de evidencias y citas verificables no tipados en el retorno del motor.
  2. `incident-broker` & `incident-scanner`:
     - Tipos de `evidence-broker.ts`, `k8s-evidence-collector.ts`, `local-incident-scanner.ts`.
     - Incompatibilidades de argumentos en `scanner-ipc.ts`.

### STAB-03: Electron, Kubetail, Docking y Core (23 errores de producción)
- **Causas Raíz:**
  1. `kubetail-store.ts`:
     - `statefulSetStore` y `daemonSetStore` posiblemente `undefined`.
     - `kubetail-stream-client.injectable.ts`: `ReadableStream.destroy` llamada en tipo estándar de Web Stream.
  2. `normalized-platform-architecture.injectable.ts`:
     - Mapeo de arquitecturas Node/Electron (`x64`, `arm64`, `ia32`, etc.).
  3. `exec-file.injectable.ts`, `user-info.injectable.ts`, `ipc-main.ts`:
     - Tipos de opciones de proceso, serialización IPC y Electron APIs.
  4. `populate-application-menu.injectable.ts`, `sync-open-at-login-with-os.injectable.ts`:
     - Tipos de items de menú y opciones de login en Electron.
  5. `incident-retention-preference-block.injectable.ts`:
     - Incompatibilidad entre `FunctionComponent<IncidentRetentionPreferenceProps>` y `PreferenceItemComponent<PreferencePage>`.
  6. Variables declaradas y no utilizadas (`TS6133`, `TS6196` bajo `noUnusedLocals`).

### STAB-04: Corrección de Tests y Fixtures (49 errores en tests)
- **Causas Raíz:**
  1. Mocks de `IncidentActor` sin `id`.
  2. Mocks de `Logger` sin la propiedad `silly` requerida por la interfaz `Logger`.
  3. Parámetros sin tipo implícito `any` (`TS7006`) en suites de Kubetail (`sts`, `ds`, `dep`).
  4. Mocks de PTY (`local-shell-session/techincal.test.ts`) desalineados con `IPty`.
  5. Unused imports/variables (`TS6133`) en `cursor-mono.test.ts`, `kubetail-stress.test.ts`, etc.

---

## 4. Tabla Detallada de los 123 Errores de la Línea Base

| ID | Archivo | Línea | Código TS | Descripción del Error | Fase Asignada | Corrección Propuesta |
|:---|:---|:---:|:---:|:---|:---:|:---|
| 1 | `src/common/incident/incident-ipc.ts` | 20 | TS2305 | Module '"./incident-types"' has no exported member 'TimelineActor' | STAB-01 | Exportar `TimelineActor` en `incident-types.ts` (alias canónico de `IncidentActor`) |
| 2 | `src/common/incident/incident-ipc.ts` | 22 | TS2724 | '"./incident-types"' has no exported member named 'UpdateIncidentInput' | STAB-01 | Definir y exportar `UpdateIncidentInput` en `incident-types.ts` |
| 3 | `src/features/incident-workbench/renderer/incident-list-view.tsx` | 11 | TS6196 | 'IncidentStatus' is declared but never used | STAB-01 | Remover import no utilizado |
| 4 | `src/features/incident-workbench/renderer/incident-list-view.tsx` | 14 | TS6133 | 'IncidentWorkbenchPanel' is declared but its value is never read | STAB-01 | Remover import no utilizado |
| 5 | `src/features/incident-workbench/renderer/incident-list-view.tsx` | 70 | TS2345 | Argument of type not assignable to 'CreateIncidentInput' | STAB-01 | Completar campos requeridos en payload de creación de incidente |
| 6 | `src/features/incident-workbench/renderer/incident-list-view.tsx` | 85 | TS2345 | Argument of type not assignable to 'IngestEvidenceInput' | STAB-01 | Alinear payload con `IngestEvidenceInput` |
| 7 | `src/features/incident-workbench/renderer/incident-list-view.tsx` | 104 | TS2345 | Argument of type not assignable to 'CreateIncidentInput' | STAB-01 | Alinear campos de llamada con contrato `CreateIncidentInput` |
| 8 | `src/features/incident-workbench/renderer/incident-store.ts` | 40 | TS2305 | Module has no exported member 'TimelineActor' | STAB-01 | Reconciliar export con `incident-types.ts` |
| 9 | `src/features/incident-workbench/renderer/incident-store.ts` | 42 | TS2724 | Module has no exported member 'UpdateIncidentInput' | STAB-01 | Reconciliar export con `incident-types.ts` |
| 10 | `src/features/incident-workbench/renderer/incident-store.ts` | 846 | TS2339 | Property 'loadTimeline' does not exist on type 'IncidentStore' | STAB-01 | Implementar o redirigir a `loadIncidentTimeline(incidentId)` |
| 11 | `src/features/incident-workbench/renderer/incident-workbench-panel.tsx` | 12 | TS2305 | Module has no exported member 'TimelineActor' | STAB-01 | Reconciliar export con `incident-types.ts` |
| 12 | `src/features/incident-workbench/renderer/incident-workbench-panel.tsx` | 143 | TS2345 | Argument of type not assignable to 'IngestEvidenceInput' | STAB-01 | Alinear payload con `IngestEvidenceInput` |
| 13 | `src/main/incident-storage/incident-confirmation-manager.ts` | 13 | TS2724 | Module has no exported member 'IncidentTransitionResult' | STAB-01 | Exportar `IncidentTransitionResult` en `incident-types.ts` |
| 14 | `src/main/incident-storage/incident-confirmation-manager.ts` | 193 | TS2741 | Property 'id' is missing in type '{ type: "human"; name: string; }' | STAB-01 | Hacer `id` opcional con valor por defecto o proveer `id: "human-operator"` |
| 15 | `src/main/incident-storage/incident-confirmation-manager.ts` | 366 | TS2322 | Type not assignable to type 'IncidentActor' | STAB-01 | Alinear interfaz `IncidentActor` con soporte de `metadata` |
| 16 | `src/main/incident-storage/incident-ipc-validator.ts` | 15 | TS2305 | Module has no exported member 'TimelineActor' | STAB-01 | Reconciliar export con `incident-types.ts` |
| 17 | `src/main/incident-storage/incident-ipc-validator.ts` | 16 | TS2724 | Module has no exported member 'UpdateIncidentInput' | STAB-01 | Reconciliar export con `incident-types.ts` |
| 18 | `src/main/incident-storage/incident-ipc-validator.ts` | 51 | TS6133 | 'FORBIDDEN_PROPERTIES' is declared but its value is never read | STAB-01 | Usar en validador de propiedades prohibidas o remover si es redundante |
| 19 | `src/main/incident-storage/incident-ipc-validator.ts` | 280 | TS2339 | Property 'workloadKind' does not exist on type 'IncidentFilter' | STAB-01 | Declarar `workloadKind?: string` en `IncidentFilter` |
| 20 | `src/main/incident-storage/incident-ipc-validator.ts` | 287 | TS2339 | Property 'workloadName' does not exist on type 'IncidentFilter' | STAB-01 | Declarar `workloadName?: string` en `IncidentFilter` |
| 21 | `src/main/incident-storage/incident-ipc-validator.ts` | 294 | TS2339 | Property 'searchQuery' does not exist on type 'IncidentFilter' | STAB-01 | Declarar `searchQuery?: string` en `IncidentFilter` |
| 22 | `src/main/incident-storage/incident-ipc-validator.ts` | 591 | TS2322 | Type not assignable to type 'IngestEvidenceInput' | STAB-01 | Alinear tipo y validación de `IngestEvidenceInput` |
| 23 | `src/main/incident-storage/incident-ipc-validator.ts` | 650 | TS2322 | Type not assignable to type 'UserContextMetadataInput' | STAB-01 | Alinear propiedades de `UserContextMetadataInput` |
| 24 | `src/main/incident-storage/incident-repository.ts` | 306 | TS2367 | Comparison unintentional: no overlap between IncidentStatus and '"CERRADO"' | STAB-01 | Alinear enum o unión `IncidentStatus` para incluir "CERRADO" / "RESUELTO" |
| 25 | `src/main/incident-storage/incident-repository.ts` | 324 | TS2339 | Property 'metadata' does not exist on type 'IncidentActor' | STAB-01 | Agregar `metadata?: Record<string, any>` a `IncidentActor` |
| 26 | `src/main/incident-storage/incident-repository.ts` | 489 | TS2322 | Type 'string \| undefined' is not assignable to 'IncidentStatus \| undefined' | STAB-01 | Validar / tipar el status devuelto por el query |
| 27 | `src/main/incident-storage/incident-repository.ts` | 490 | TS2322 | Type 'string \| undefined' is not assignable to 'IncidentStatus \| undefined' | STAB-01 | Validar / tipar el status devuelto por el query |
| 28 | `src/main/incident-storage/setup-incident-ipc.injectable.ts` | 36 | TS2305 | Module has no exported member 'TimelineActor' | STAB-01 | Reconciliar con `incident-types.ts` |
| 29 | `src/main/incident-storage/setup-incident-ipc.injectable.ts` | 38 | TS2724 | Module has no exported member 'UpdateIncidentInput' | STAB-01 | Reconciliar con `incident-types.ts` |
| 30 | `src/main/incident-storage/setup-incident-ipc.injectable.ts` | 137 | TS2345 | Argument of type not assignable to 'UpdateIncidentInput' | STAB-01 | Alinear handler IPC con contrato `UpdateIncidentInput` |
| 31 | `src/main/ai-diagnostics/ai-budget-tracker.ts` | 6 | TS6133 | Unused import/declaration | STAB-02 | Limpiar import no utilizado |
| 32 | `src/main/ai-diagnostics/ai-diagnosis-engine.ts` | 25 | TS6133 | Unused import/declaration | STAB-02 | Limpiar import no utilizado |
| 33 | `src/main/ai-diagnostics/ai-diagnosis-engine.ts` | 29 | TS6133 | Unused import/declaration | STAB-02 | Limpiar import no utilizado |
| 34 | `src/main/ai-diagnostics/ai-diagnosis-engine.ts` | 403 | TS2322 | Return type mismatch in diagnosis result | STAB-02 | Alinear estructura de retorno con `DiagnosisResult` |
| 35 | `src/main/ai-diagnostics/ai-diagnosis-engine.ts` | 522 | TS2322 | Evidence citations type mismatch | STAB-02 | Alinear estructura de citas con `EvidenceCitation` |
| 36 | `src/main/ai-diagnostics/ai-diagnostics-ipc.ts` | 18 | TS2305 | Module has missing exported type | STAB-02 | Exportar tipo faltante en módulo correspondiente |
| 37 | `src/main/ai-diagnostics/ephemeral-context-manager.ts` | 13 | TS6133 | Unused import | STAB-02 | Limpiar import no utilizado |
| 38 | `src/main/ai-diagnostics/ephemeral-context-manager.ts` | 48 | TS2339 | Property not found on context metadata | STAB-02 | Alinear interfaz de metadata de contexto efímero |
| 39 | `src/main/ai-diagnostics/ephemeral-context-manager.ts` | 49 | TS2339 | Property not found on context metadata | STAB-02 | Alinear interfaz de metadata de contexto efímero |
| 40 | `src/main/ai-diagnostics/ephemeral-context-manager.ts` | 186 | TS2345 | Argument type mismatch in file cleanup | STAB-02 | Alinear parámetros de llamada de limpieza |
| 41 | `src/main/incident-broker/evidence-broker.ts` | 38 | TS2339 | Property missing on broker options | STAB-02 | Alinear interfaz de opciones de evidencia |
| 42 | `src/main/incident-broker/evidence-broker.ts` | 112 | TS2345 | Argument type mismatch in broker collection | STAB-02 | Alinear llamada a colector de evidencias K8s |
| 43 | `src/main/incident-broker/broker-ipc.ts` | 22 | TS2305 | Module has missing exported type | STAB-02 | Exportar tipo en `incident-broker-types.ts` |
| 44 | `src/main/incident-broker/k8s-evidence-collector.ts` | 54 | TS2339 | Property missing on K8s resource representation | STAB-02 | Alinear tipado de Pod / Event en colector |
| 45 | `src/main/incident-scanner/local-incident-scanner.ts` | 228 | TS2339 | Property missing on scanner status | STAB-02 | Alinear estado del escáner sintético |
| 46 | `src/main/incident-scanner/local-incident-scanner.ts` | 271 | TS2345 | Argument type mismatch in rule execution | STAB-02 | Alinear tipos de reglas sintéticas |
| 47 | `src/main/incident-scanner/scanner-ipc.ts` | 19 | TS2305 | Module has missing exported type | STAB-02 | Exportar tipos IPC en `scanner-types.ts` |
| 48 | `src/main/incident-scanner/scanner-ipc.ts` | 45 | TS2345 | Argument count or type mismatch | STAB-02 | Alinear llamada de registro IPC |
| 49 | `src/common/error-reporting/initialize-sentry-reporting.injectable.ts` | 54 | TS2345 | Type mismatch with Sentry options | STAB-03 | Alinear opciones con SDK tipado |
| 50 | `src/common/fs/exec-file.injectable.ts` | 48 | TS2345 | Argument of type not assignable to ExecFileOptions | STAB-03 | Alinear opciones de encoding / stdio |
| 51 | `src/common/utils/reactive-now/reactive-now.ts` | 41 | TS2345 | Type mismatch in mobx observable | STAB-03 | Alinear getter reactivo |
| 52 | `src/common/vars/normalized-platform-architecture.injectable.ts` | 17 | TS2322 | Architecture mapping mismatch | STAB-03 | Alinear tipos de retorno con unión de arquitecturas soportadas |
| 53 | `src/common/vars/normalized-platform-architecture.injectable.ts` | 19 | TS2322 | Architecture mapping mismatch | STAB-03 | Alinear tipos de retorno con unión de arquitecturas soportadas |
| 54 | `src/common/vars/normalized-platform-architecture.injectable.ts` | 20 | TS2322 | Architecture mapping mismatch | STAB-03 | Alinear tipos de retorno con unión de arquitecturas soportadas |
| 55 | `src/common/vars/user-info.injectable.ts` | 8 | TS2339 | Property missing on UserInfo | STAB-03 | Alinear retorno de `os.userInfo()` |
| 56 | `src/extensions/ipc/ipc-main.ts` | 51 | TS2345 | Electron IpcMainEvent type mismatch | STAB-03 | Alinear listener con tipos de Electron 45 |
| 57 | `src/features/application-menu/main/populate-application-menu.injectable.ts` | 86 | TS2322 | MenuItemConstructorOptions mismatch | STAB-03 | Alinear propiedades de MenuItem de Electron |
| 58 | `src/features/user-preferences/main/sync-open-at-login-with-os.injectable.ts` | 21 | TS2339 | Electron app.getLoginItemSettings mismatch | STAB-03 | Alinear llamada con API de Electron 45 |
| 59 | `src/renderer/components/kubetail/kubetail-store.ts` | 140 | TS18048 | 'statefulSetStore' is possibly 'undefined' | STAB-03 | Verificar existencia con optional chaining y guard condicional |
| 60 | `src/renderer/components/kubetail/kubetail-store.ts` | 156 | TS18048 | 'daemonSetStore' is possibly 'undefined' | STAB-03 | Verificar existencia con optional chaining y guard condicional |
| 61 | `src/renderer/components/kubetail/kubetail-stream-client.injectable.ts` | 111 | TS2339 | Property 'destroy' does not exist on type 'ReadableStream' | STAB-03 | Usar `.cancel()` o casting defensivo al reader de la API de streams |
| 62 | `src/renderer/components/preferences/incident-retention-preference-block.injectable.ts` | 17 | TS2322 | FunctionComponent not assignable to PreferenceItemComponent | STAB-03 | Alinear props del componente con contrato de Lens PreferenceItem |
| 63 | `src/renderer/components/split-panel/split-panel-store.ts` | 27 | TS6133 | 'isLayoutV1' is declared but its value is never read | STAB-03 | Remover import no utilizado |
| 64-123 | Archivos de prueba (ver sección STAB-04) | Varios | TS2305, TS2741, TS7006, TS6133 | Mocks incompletos, tipos implícitos any, variables sin usar | STAB-04 | Alinear fixtures con contratos productivos actualizados |

---

## 5. Plan de Ejecución por Etapas

1. **Fase STAB-01 (Contratos e IPC):**
   - Editar `src/common/incident/incident-types.ts` para exportar todos los contratos canónicos (`TimelineActor`, `UpdateIncidentInput`, `IncidentTransitionResult`, campos en `IncidentFilter`, `metadata` en `IncidentActor`).
   - Corregir `incident-ipc-validator.ts`, `incident-repository.ts`, `incident-store.ts`, `incident-list-view.tsx`, `incident-workbench-panel.tsx`.
   - Verificar reducción de errores. Commit: `fix(types): reconcile incident contracts and IPC`.

2. **Fase STAB-02 (IA y Centro de Incidentes):**
   - Corregir contratos en `src/main/ai-diagnostics/*`, `src/main/incident-broker/*`, `src/main/incident-scanner/*`.
   - Verificar reducción de errores. Commit: `fix(ai): align diagnosis, broker and scanner contracts`.

3. **Fase STAB-03 (Electron, Kubetail, Docking y Core):**
   - Corregir guards en `kubetail-store.ts` y stream client.
   - Corregir arquitecturas en `normalized-platform-architecture.injectable.ts`.
   - Corregir APIs de Electron en `populate-application-menu`, `sync-open-at-login`, `ipc-main`.
   - Limpiar `TS6133` y `TS6196` en código productivo.
   - Verificar reducción de errores. Commit: `fix(core): resolve Electron APIs and Kubernetes store typing`.

4. **Fase STAB-04 (Corrección de Tests y Fixtures):**
   - Alinear todos los mocks y fixtures de pruebas en `__tests__`.
   - Resolver parámetros `any` implícitos en Kubetail tests.
   - Probar suites con `npm run test:unit`. Commit: `test(types): align fixtures and mocks with production contracts`.

5. **Fase STAB-05 (Validación de Producción):**
   - Ejecutar compilación estricta completa (Webpack + ForkTsChecker).
   - Validar 0 errores TypeScript.
   - Ejecutar regresión automatizada relevante.

6. **Fase STAB-06 (Preparación de Integración y Reporte Final):**
   - Generar `docs/stabilization/STAB_FINAL_REPORT.md`.
   - Documentar orden de integración y checklist.
