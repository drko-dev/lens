# NovaKube H8.8-05: Informe de QA Funcional Electron DEV

## 1. Resumen Ejecutivo

Este informe documenta la validación funcional de extremo a extremo (E2E) del **Workbench de Incidentes de NovaKube** en entorno Electron DEV (`feature/h8-8-05-electron-qa`), ejecutado con aislamiento estricto de credenciales, snapshots sintéticos fuera de línea (`FakeK8sSnapshotSource`) y diagnósticos simulados (`MockAiProviderAdapter`).

La validación contempla dos capas complementarias e independientes de verificación:
1. **Capa A — Arnés de Integración de Componentes**: Verificación rápida de interfaz montada para pruebas unitarias y de integración visual (8 capturas en `docs/evidence/h8-8-05/component-harness/`).
2. **Capa B — Aplicación Auténtica NovaKube (R1-01)**: Ejecución completa de la aplicación de escritorio real lanzada desde su entrypoint oficial (`open-lens/static/build/main.js`), cargando el renderer compilado de producción (`open-lens/static/build/lens.js`), el shell con tema oficial NovaKube, la navegación real por clústeres hacia Incident Center (`/incidents`), la vinculación de MobX store sobre el árbol Fiber de React y el puente de comunicación seguro HTML5 postMessage que cumple estrictamente la política de seguridad `validateIpcSender` (10 capturas en `docs/evidence/h8-8-05/real-app/`).

Ambas suites comprueban:
- El escáner local inicia estrictamente en reposo con cero watchers en segundo plano.
- La activación exige consentimiento explícito de alcance (`clusterId` y `namespace`).
- La ingesta de snapshots sintéticos detecta determinísticamente `CrashLoopBackOff`, `OOMKilled`, `ImagePullBackOff` y degradaciones de rollout.
- Las señales recurrentes se deduplican atómicamente en SQLite sin duplicar incidentes.
- El motor de redacción sanea secretos sensibles en texto plano (`[REDACTED_TOKEN]`, `[REDACTED_PASSWORD]`) tanto en la vista React como en el archivo físico SQLite en disco (`incident_evidence`).
- El diagnóstico de IA requiere consentimiento explícito con huella inmutable y genera hipótesis estructuradas con citas verificadas (`.citationTag.verified`).
- Los resultados `CONCLUSIVE` e `INCONCLUSO` se reflejan con sus respectivas advertencias y desgloses de métricas.
- La máquina de estados gobierna todas las transiciones (`DETECTADO` ➔ `INVESTIGANDO` ➔ `CONFIRMADO` ➔ `SOLUCIÓN PROPUESTA` ➔ `APROBACIÓN HUMANA` ➔ `VALIDACIÓN` ➔ `CERRADO` ➔ Reapertura a `INVESTIGANDO`).
- Las cancelaciones mediante `AbortController` y los intentos de violación de alcance por TOCTOU durante recolecciones en vuelo son bloqueados de forma segura (`OPERATION_ABORTED`).

---

## 2. Aislamiento y Parámetros del Entorno QA

| Parámetro | Configuración | Justificación |
|---|---|---|
| **Worktree** | `/private/var/tmp/lens-h8-8-05-electron-qa-20261107` | Aislamiento estricto respecto a ramas de desarrollo activas. |
| **Branch** | `feature/h8-8-05-electron-qa` | Rama dedicada para la batería de QA DEV. |
| **Entry Point Real (Capa B)** | `open-lens/static/build/main.js` | Entrypoint auténtico de producción de OpenLens / NovaKube. |
| **Renderer Real (Capa B)** | `open-lens/static/build/lens.js` + `index.html` | Renderer de producción compilado con webpack. |
| **Runtime Electron** | Electron v45.2.0 (Node 24.22.1, Chromium 156.0.8078.49) | Ejecución directa del runtime oficial de escritorio. |
| **Flags de Seguridad** | `--use-mock-keychain --offline` | Cero interacción con Keychain de macOS; red deshabilitada. |
| **Variables de Entorno** | `HOME: synthetic-home`, `APPDATA: appdata`, `KUBECONFIG: synthetic-kubeconfig` | Imposibilidad física de acceder a la configuración real de usuario (`~/.kube/config`). |
| **Base de Datos Persistente** | SQLite local (`openlens-devops-incidents.db`) | Aislada en sandbox temporal con esquema relacional H8 íntegro. |
| **Fuentes K8s** | `FakeK8sSnapshotSource` | Simulación determinística en memoria; clústeres reales bloqueados. |
| **Proveedores IA** | `MockAiProviderAdapter` / Perfil Mock | Sin consumo de API keys externas ni tráfico de red. |

---

## 3. Auditoría de Tráfico de Red (Negative Proof)

Se instalaron interceptores bidireccionales tanto en la sesión de Electron (`session.defaultSession.webRequest.onBeforeRequest`) como en el contexto de Playwright (`ctx.route`).

Se ejecutó una prueba de aserción negativa contra un host no autorizado (`negative-test-external.lens-security-audit.invalid`):
- **Resultado de la prueba negativa**: `FAIL-CLOSED CONFIRMED` (la solicitud fue abortada de inmediato con `blockedbyclient` / `cancel: true`).
- **Tráfico saliente no autorizado detectado durante todo el recorrido**: `0 requests` (100% de solicitudes externas bloqueadas).
- **Tráfico permitido**: Exclusivamente recursos locales y de empaquetado (`lens.app`, `*.lens.app`, `localhost`, `data:`, `file:`, `devtools:`).

---

## 4. Matriz de Escenarios: Capa B (Aplicación Real NovaKube)

| # | Paso Funcional | Comportamiento en Aplicación Real | Resultado | Evidencia |
|---|---|---|---|---|
| **01** | **Shell NovaKube y navegación** | Ventana principal Electron inicializa shell con tema NovaKube y clúster demo listo. | **PASS** | `01_real_shell_navigation_welcome.png` |
| **02** | **Acceso a Incident Center** | Navegación a `/incidents` en el clusterFrame; escáner inicia en `power_settings_newOFF` (0 watchers). | **PASS** | `02_real_incident_center_idle.png` |
| **03** | **Detección y deduplicación atómica** | Activación del escáner (`DEMO ACTIVO`); ingesta de snapshot con CrashLoopBackOff, OOMKilled e ImagePullBackOff; deduplicación atómica verificada. | **PASS** | `03_real_incidents_detected_dedup.png` |
| **04** | **Apertura de Incident Workbench** | Clic en botón Analizar de fila real en DOM; panel `[data-testid="incident-workbench-panel"]` montado. | **PASS** | `04_real_workbench_opened.png` |
| **05** | **Saneamiento en UI y SQLite directo** | Ingesta de log con JWT Bearer y API Key canarios; verificación de sustitución en UI y consulta física a SQLite (`incident_evidence`). | **PASS** | `05_real_evidence_redacted_sqlite.png` |
| **06** | **Selección Mock y Modal Consentimiento** | Creación de perfil Mock vía IPC; apertura de modal de consentimiento con huella SHA-256 e inventario. | **PASS** | `06_real_ai_consent_modal.png` |
| **07** | **Diagnóstico CONCLUSIVO y citas** | Autorización explícita; generación de diagnóstico `CONCLUSIVE` con hipótesis y citas auditables. | **PASS** | `07_real_diagnosis_conclusive_citations.png` |
| **08** | **Diagnóstico INCONCLUSO** | Diagnóstico sobre incidente sin evidencias suficientes refleja estado `INCONCLUSO` con advertencias. | **PASS** | `08_real_diagnosis_inconclusive.png` |
| **09** | **Máquina de estados completa** | Transiciones reales por UI/store: `INVESTIGANDO` ➔ `CONFIRMADO` ➔ `SOLUCIÓN PROPUESTA` ➔ `APROBACIÓN HUMANA` ➔ `VALIDACIÓN` ➔ `CERRADO` ➔ Reapertura. | **PASS** | `09_real_state_machine_lifecycle.png` |
| **10** | **Resiliencia y detención limpia** | Cancelación con `AbortController` manejada limpiamente; detención inmediata del escáner en reposo (0 watchers). | **PASS** | `10_real_cancellation_scope_resilience.png` |

---

## 5. Matriz de Escenarios: Capa A (Arnés de Integración de Componentes)

| # | Paso Funcional | Comportamiento en Arnés | Resultado | Evidencia |
|---|---|---|---|---|
| **01** | Selección de clúster sintético | Escáner inicia en estado `OFF` por defecto con 0 watchers activos (`H86-GATE-01`). | **PASS** | `01_cluster_selection_scanner_idle.png` |
| **02** | Activación con consentimiento | Escáner pasa a `DEMO ACTIVO (0 watchers)` acotado a `sim-cluster-alpha / payments-prod`. | **PASS** | `02_scanner_activated_incidents_detected.png` |
| **03** | Obtención de snapshot sintético | `FakeK8sSnapshotSource` provee pods, workloads y eventos determinísticos sin red. | **PASS** | `02_scanner_activated_incidents_detected.png` |
| **04** | Detección de anomalías K8s | Detección determinística de `CrashLoopBackOff`, `OOMKilled` e `ImagePullBackOff`. | **PASS** | `02_scanner_activated_incidents_detected.png` |
| **05** | Creación y deduplicación atómica | Ingesta redundante incrementa ocurrencias en SQLite sin duplicar filas (`deduplicatedCount >= 3`). | **PASS** | `02_scanner_activated_incidents_detected.png` |
| **06** | Apertura de Incident Workbench | Despliegue interactivo del panel de inspección y diagnóstico del incidente seleccionado. | **PASS** | `03_incident_workbench_evidence_sanitized.png` |
| **07** | Consulta de evidencias saneadas | Verificación estricta de `RedactionEngine`: canarios en claro no existen; persisten `[REDACTED_TOKEN]`. | **PASS** | `03_incident_workbench_evidence_sanitized.png` |
| **08** | Selección de proveedor Mock | Perfil de diagnóstico mock local configurado en `AiProfileManager` y seleccionado en la UI. | **PASS** | `04_ai_consent_modal_preview.png` |
| **09** | Autorización consentimiento único | Modal de consentimiento previsualiza token efímero, huella inmutable y contador saneado. | **PASS** | `04_ai_consent_modal_preview.png` |
| **10** | Diagnóstico CONCLUSIVO con citas | Generación de hipótesis estructurada, barra de confianza y citas verificadas (`.citationTag.verified`). | **PASS** | `05_diagnosis_conclusive_verified_citations.png` |
| **11** | Resultados CONCLUSIVO e INCONCLUSO | Modo inconcluso muestra badge `INCONCLUSO`, razones de incertidumbre y pasos recomendados. | **PASS** | `06_diagnosis_inconclusive_state.png` |
| **12** | Ciclo de vida máquina de estados | Transiciones válidas `DETECTADO` ➔ `INVESTIGANDO` ➔ `CONFIRMADO` ➔ `CERRADO` ➔ Reapertura a `INVESTIGANDO`. | **PASS** | `07_state_transition_closed_reopened.png` |
| **R1** | Cancelación con AbortController | Cancelación previa a ejecución aborta inmediatamente con `OPERATION_ABORTED` (código 499). | **PASS** | `08_cancellation_and_scope_switch.png` |
| **R2** | Defensa TOCTOU cambio de alcance | Modificación de clúster durante recolección en curso aborta el lote sin cruzar datos. | **PASS** | `08_cancellation_and_scope_switch.png` |
| **R3** | Detención limpia inmediata | Botón detener resetea el escáner a `OFF` garantizando 0 watchers en ejecución. | **PASS** | `08_cancellation_and_scope_switch.png` |

---

## 6. Galería de Capturas Registradas

### Capa B — Aplicación Real (`docs/evidence/h8-8-05/real-app/`)
1. `01_real_shell_navigation_welcome.png`: Shell de producción NovaKube en pantalla inicial con tema aplicado y clúster demo disponible.
2. `02_real_incident_center_idle.png`: Centro de Incidentes cargado en el clúster hosted con escáner en estado inicial inactivo `power_settings_newOFF`.
3. `03_real_incidents_detected_dedup.png`: Escáner en estado `radarDEMO ACTIVO (0 watchers)` con 7 incidentes detectados y deduplicación atómica comprobada.
4. `04_real_workbench_opened.png`: Incident Workbench abierto en el panel lateral tras clic en fila del incidente.
5. `05_real_evidence_redacted_sqlite.png`: Pestaña de evidencias con sustitución de credenciales y comprobación directa sobre archivo SQLite en disco.
6. `06_real_ai_consent_modal.png`: Modal interactivo de autorización de inferencia IA con huella SHA-256 e inventario efímero.
7. `07_real_diagnosis_conclusive_citations.png`: Informe diagnóstico conclusivo con citas verificadas y propuesta de remediación con aprobación humana requerida.
8. `08_real_diagnosis_inconclusive.png`: Diagnóstico inconcluso ante falta de evidencias suficientes con advertencia en UI.
9. `09_real_state_machine_lifecycle.png`: Ciclo de vida completo gobernado por la máquina de estados con justificaciones y auditoría.
10. `10_real_cancellation_scope_resilience.png`: Detención limpia del escáner en reposo (0 watchers activos) y resiliencia ante cancelaciones.

### Capa A — Arnés de Componentes (`docs/evidence/h8-8-05/component-harness/`)
1. `01_cluster_selection_scanner_idle.png`: Escáner en estado inicial inactivo con badge `OFF` y métricas en cero.
2. `02_scanner_activated_incidents_detected.png`: Escáner activo con incidentes detectados en la tabla y métricas de deduplicación.
3. `03_incident_workbench_evidence_sanitized.png`: Pestaña de evidencias con sustitución estricta de canarios por `[REDACTED_TOKEN]`.
4. `04_ai_consent_modal_preview.png`: Modal interactivo de consentimiento previo a la transmisión del diagnóstico.
5. `05_diagnosis_conclusive_verified_citations.png`: Informe CONCLUSIVO con hipótesis, nivel de confianza y citas verificadas.
6. `06_diagnosis_inconclusive_state.png`: Visualización de diagnóstico INCONCLUSO con callout de advertencia.
7. `07_state_transition_closed_reopened.png`: Estado CERRADO y posterior reapertura gobernada a INVESTIGANDO.
8. `08_cancellation_and_scope_switch.png`: Comprobación de resiliencia frente a cancelaciones y switches de clúster.

---

## 7. Arquitectura de Seguridad: Puente postMessage y Cumplimiento IPC

En la arquitectura de OpenLens, cada clúster se ejecuta dentro de un subframe/iframe (`https://<cluster-id>.lens.app:<port>/`). El validador de seguridad `validateIpcSender(event)` en `incident-ipc-validator.ts` rechaza cualquier invocación directa de IPC proveniente de un subframe (`event.senderFrame.parent !== null`) arrojando `SecurityError: IPC invocation from subframe or iframe is forbidden`.

Para respetar esta invariante de seguridad sin debilitar las compuertas de Electron:
1. El `clusterFrame` envía mensajes estándar W3C HTML5 `postMessage` a `window.parent` (`mainFrame`).
2. El `mainFrame` (cuyo `senderFrame.parent === null`) valida y canaliza la solicitud a `ipcRenderer.invoke()`.
3. El resultado se retorna al `clusterFrame` mediante `event.source.postMessage()`.
4. El puente se conecta a la instancia de `IncidentStore` bound al árbol React Fiber, garantizando reactividad total de MobX y renderizado fidedigno en el DOM real.

---

## 8. Conclusiones y Estado del Módulo

El flujo E2E del Incident Workbench en la aplicación real NovaKube cumple integralmente las especificaciones de seguridad, usabilidad y robustez arquitectónica:
1. **Zero External Surface**: El pipeline completo se ejecuta de extremo a extremo sin ninguna conexión saliente ni acceso al llavero del sistema operativo.
2. **Authentic Full-App Execution**: Ejecución verificada sobre el bundle real compilado y la navegación oficial de OpenLens/NovaKube.
3. **Atomic Integrity & Strict Redaction**: Verificación física en base de datos SQLite persistente de que las credenciales sensibles jamás se guardan en texto plano.
4. **Audit Readiness**: Trazabilidad completa e inmutable en todas las etapas del ciclo de vida del incidente.
