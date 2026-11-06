# OpenLens DevOps — H8.5 Reporte de Entrega
## Escáner Local Determinístico, Deduplicación y Acciones de Alerta (H8-021 & H8-022)

Fecha: 2026-11-05  
Rama: `feature/h8-5-local-incident-scanner`  
Commits:
- `feat(h8): implement local deterministic incident scanner scoped by cluster and namespace (H8-021)`
- `feat(h8): add signal deduplication, cooldown windows, and alert actions in incident center (H8-022)`
- `docs(h8): certify H8.5 delivery with automated regression, evidence screenshots, and report`
Estado: **APROBADO Y SUPERADO** (Implementación funcional completa, suites de tests y verificación en Electron Real).

---

## 1. Resumen Ejecutivo

Este documento certifica el cumplimiento riguroso de todos los criterios de aceptación y modelos de amenazas correspondientes a **H8.5 (Historias H8-021 y H8-022)** en el repositorio OpenLens:

1. **H8-021 (Escáner Determinístico por Clúster y Namespace):**
   - **OFF por defecto**: El escáner se inicializa apagado (`isEnabled: false`) en todas las circunstancias (arranque, migración, reinicio).
   - **Activación explícita (opt-in)**: Requiere activación manual con alcance específico por `clusterId`, `namespace` opcional y filtros de recurso.
   - **Reglas determinísticas locales (CERO IA)**: Motor de reglas puras (`DeterministicRulesEngine`) que detecta anomalías operativas:
     - `CrashLoopBackOff` e `ImagePullBackOff` / `ErrImagePull`.
     - `OOMKilled` (estado actual o `lastState.terminated`, código 137).
     - Reinicios anómalos (`restartCount >= threshold` en ventana temporal).
     - Nodos degradados (`Node` con condición `Ready != True`).
     - Despliegues degradados (`Deployment`, `StatefulSet`, `DaemonSet` con `0` réplicas disponibles o `ProgressDeadlineExceeded`).
     - Eventos de advertencia (`Warning` events como `FailedScheduling`, `Unhealthy`, `FailedMount`, etc.).
   - **Ciclo de vida a prueba de fugas**: Detención inmediata con botón visible y comprobable, cancelación de schedulers e intervalos, limpieza ante cierre de aplicación (`will-quit`/`before-quit`). Cero watchers o timers huérfanos.

2. **H8-022 (Deduplicación, Cooldown y Acciones de Alerta en Centro de Incidentes):**
   - **Huella determinística estable**: Cálculo SHA-256 canónico por `clusterId:namespace:resourceKind:resourceName:signalType`, resistente a recreaciones y colisiones.
   - **Deduplicación atómica**: Si la anomalía recurre dentro del período de cooldown (5 minutos por defecto), actualiza de forma atómica el timeline del incidente existente incrementando el contador de ocurrencias sin generar cientos de incidentes duplicados en SQLite.
   - **Acciones de Alerta del Operador en UI**:
     - **«Analizar ahora»**: Selecciona el incidente y abre el Incident Workbench para investigación manual humana (NO ejecuta IA automáticamente).
     - **«Posponer» (Snooze)**: Suprime notificaciones repetitivas durante la ventana temporal configurada (ej. 15 minutos) sin desactivar la seguridad.
     - **«Descartar» (Dismiss)**: Transiciona el incidente a `NO CONFIRMADO` / `CERRADO` con justificación obligatoria del operador en el timeline.
   - **Métricas operativas**: Registro en tiempo real de tasa de escaneos, señales detectadas, eventos deduplicados, incidentes creados, alertas pospuestas y descartadas.

3. **Invariantes Críticas de Seguridad Respetadas:**
   - **Cero conexiones a clústeres reales de Kubernetes**: Todo el escaneo y validación operan mediante fixtures sintéticos y snapshots en memoria.
   - **Cero modificaciones Kubernetes**: 100% libre de operaciones mutadoras (`POST`, `PUT`, `PATCH`, `DELETE`).
   - **Cero llamadas a proveedores de IA (H8-023 excluido)**: El escáner opera íntegramente de manera local y determinística.

---

## 2. Componentes Arquitectónicos Implementados

| Módulo | Archivo | Responsabilidad |
|---|---|---|
| **Contratos y Tipos** | `packages/core/src/common/incident/local-scanner-types.ts` | Definición de señales (`ScannerSignalType`), alcance (`LocalScannerScope`), opciones, estado del escáner (`LocalScannerStatus`), acciones de alerta y representaciones de recursos K8s (`K8sPodObject`, `K8sNodeObject`, `K8sWorkloadObject`, `K8sEventObject`). |
| **Motor de Reglas** | `packages/core/src/main/incident-scanner/deterministic-rules-engine.ts` | Evaluación determinística de pods, nodos, cargas de trabajo y eventos Warning. Generación de huellas canónicas SHA-256. |
| **Deduplicador** | `packages/core/src/main/incident-scanner/incident-deduplicator.ts` | Seguimiento en memoria y correlación en SQLite de incidentes abiertos. Deduplicación atómica en timeline, manejo de cooldown, snooze y dismiss. |
| **Controlador del Escáner** | `packages/core/src/main/incident-scanner/local-incident-scanner.ts` | Gestor del ciclo de vida del escáner en Main. Deshabilitado por defecto, arranque/parada scoped, scheduler cancelable y métricas. |
| **Inyección de Dependencias** | `packages/core/src/main/incident-scanner/local-incident-scanner.injectable.ts` | Registro del servicio singleton en el contenedor de ogre-tools DI. |
| **Canales y Validadores IPC** | `setup-incident-ipc.injectable.ts` & `incident-ipc-validator.ts` | Canales IPC protegidos: `scannerGetStatus`, `scannerStart`, `scannerStop`, `scannerProcessSnapshot`, `scannerAlertAction`. Validación de emisor de frame seguro y validación estricta de esquemas. |
| **Estado MobX en Renderer** | `packages/core/src/features/incident-workbench/renderer/incident-store.ts` | Observables `scannerStatus`, `isScannerToggling`, y métodos reactivos `loadScannerStatus`, `startScanner`, `stopScanner`, `processScannerSnapshot`, `executeScannerAlertAction`. |
| **Interfaz Centro de Incidentes** | `incident-list-view.tsx` & `.module.scss` | Barra de control del escáner (badge OFF/ACTIVO, alcance, contadores de métricas, botones Activar/Detener). Botones de acción en filas de la tabla ("Analizar", "Posponer", "Descartar"). |

---

## 3. Resultados de Pruebas Unitarias e Integración

Se ejecutó la suite completa de pruebas focalizadas de H8 (almacenamiento, broker, sanitización, perfiles, IA, contexto efímero y escáner local):

```
PASS src/main/incident-scanner/__tests__/deterministic-rules-engine.test.ts
PASS src/main/incident-scanner/__tests__/incident-deduplicator.test.ts
PASS src/main/incident-scanner/__tests__/local-incident-scanner.test.ts
PASS src/main/incident-scanner/__tests__/scanner-ipc.test.ts
... (27 suites previas de H8.1 .. H8.4.1)

Test Suites: 31 passed, 31 total
Tests:       263 passed, 263 total
Snapshots:   0 total
Time:        33.074 s
Ran all test suites matching /(incident|ai-diagnostics|incident-scanner)/i.
```

- **34 tests nuevos** añadidos específicamente para H8.5.
- **263 de 263 tests PASS** (100% verde).
- **Cero regresiones** en los componentes existentes de H8.1, H8.2, H8.3, H8.4 y H8.4.1.

---

## 4. Validación Visual y Smoke Test en Electron DEV

El flujo end-to-end se validó en una instancia real de Electron DEV gobernada por Playwright (`open-lens/integration/h8-5-smoke.mjs`):

1. **Arranque y Verificación de Estado OFF Inicial (H8-021):**
   - El Centro de Incidentes se renderiza con el escáner en estado **OFF**.
   - Captura: `docs/evidence/h8/23_h8_5_scanner_initial_off.png`.
2. **Activación Opt-in y Alcance (H8-021):**
   - Clic en «Activar Escáner»: el badge pasa a **ACTIVO** en verde, fijando el alcance en `minikube-dev`.
   - Captura: `docs/evidence/h8/24_h8_5_scanner_activated_scoped.png`.
3. **Ingesta de Snapshot, Detección y Deduplicación (H8-021 & H8-022):**
   - Procesamiento de snapshot con pods en `CrashLoopBackOff` y `OOMKilled`. Se generan 2 incidentes automáticos en estado `DETECTADO`.
   - Re-procesamiento del mismo snapshot: el sistema deduplica atómicamente la señal, incrementando `deduplicatedCount` y actualizando el timeline sin duplicar filas en la tabla.
   - Captura: `docs/evidence/h8/25_h8_5_scanner_signals_detected_and_deduplicated.png`.
4. **Acciones de Alerta del Operador y Detención Inmediata (H8-022 & H8-021):**
   - Ejecución de «Posponer» (Snooze): registra la pausa de 15 minutos en el timeline.
   - Ejecución de «Descartar» (Dismiss): transiciona el incidente a `NO CONFIRMADO` con justificación en el timeline.
   - Clic en «Detener»: el escáner se detiene de forma instantánea, dejando 0 watchers activos y liberando recursos.
   - Captura: `docs/evidence/h8/26_h8_5_scanner_alert_actions_and_stopped.png`.

---

## 5. Dictamen y Próximos Pasos

- **Dictamen:** **APROBADO**. Los objetivos funcionales y de seguridad de H8-021 y H8-022 se encuentran completamente satisfechos.
- **Siguiente paso:** H8.5 queda cerrado. Proceder a **H8.6** (Auditoría de seguridad adversarial, resiliencia y Release Candidate MVP).
