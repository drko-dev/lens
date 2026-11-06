# OpenLens DevOps — H8 MVP RC2: Reporte de Aceptación Independiente y Remediación QA-01..03

Fecha: 2026-11-06  
Rama: `feature/h8-mvp-rc2-acceptance-gate`  
Baseline de partida: Commit `3cedfe22` (sobre RC2 `146adb9e`)  
Ejecutable validado: `open-lens/dist/h8-mvp-rc2/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps`  
Script de verificación: `open-lens/integration/h8-mvp-rc2-packaged-qa.mjs`  
Dictamen Global: **H8 MVP RC2 ACCEPTANCE APPROVED (100% PASS)**

---

## 1. Resumen Ejecutivo y Dictamen

La revisión independiente previa del Release Candidate 2 (RC2) detectó tres hallazgos de aceptación que impedían la aprobación final del gate:
- **QA-01 (Evidencia visual sin navegación funcional):** Las 6 capturas previas compartían un único checksum SHA-256 (`22dfc05b...`) al capturarse reiteradamente sobre el fotograma inicial.
- **QA-02 (Funcionalidad no cubierta sobre el paquete):** No se ejecutaban en la interfaz del binario empaquetado los flujos de contexto efímero, consentimiento IA, diagnóstico mock ni acoplamiento en Global Docking.
- **QA-03 (Aislamiento de usuario incompleto):** El entorno de prueba compartía el `HOME` del usuario, permitiendo que `KUBECONFIG-SYNC` observara `~/.kube` real.

Se corrigió integralmente la suite de aceptación empaquetada (`open-lens/integration/h8-mvp-rc2-packaged-qa.mjs`) operando sobre el binario de producción real sin requerir recompilación del paquete (`mac-arm64/OpenLens DevOps.app`). Los tres hallazgos quedan formalmente subsanados y verificados con **100% PASS**.

---

## 2. Matriz de Resultados por Requisito y Feature

| Feature / Gate | Estado | Evidencia y Verificación |
| :--- | :---: | :--- |
| **Binario Empaquetado RC2 (DMG & ZIP)** | **PASS** | Hashes inmutables preservados: DMG `b9ae0fb7...`, ZIP `209d9da9...`. Codesign `--deep --strict` válido. |
| **QA-03: Aislamiento de Usuario y Red** | **PASS** | `HOME` y `KUBECONFIG` confinados a directorio sintético temporal con cluster dummy (`127.0.0.1:64433`). Cero accesos a `~/.kube` real del usuario. Intercepción estricta de stdout/stderr verificó 0 fugas de rutas reales. |
| **Migración SQLite v7 -> v8** | **PASS** | 8 migraciones aplicadas secuencialmente sin pérdida. Columnas `fingerprint`, `resource_uid`, `signal_type` e índice `idx_incidents_fingerprint` creados. Incidente histórico `INC-V7-LEGACY-01` preservado intacto. |
| **Escáner Local Demo (0 Watchers)** | **PASS** | Escáner inicia en `OFF`, activa en modo demo sintético (`sourceType: synthetic_feed`) con 0 watchers y 0 llamadas al API Server de Kubernetes. |
| **Deduplicación Indexada por UID / Señal** | **PASS** | Señales concurrentes sobre Pod Gen 1 (`OOMKilled` y `CrashLoopBackOff`) generan 2 incidentes independientes sin fallback ambiguo. Pod recreado Gen 2 genera incidente propio. Duplicados exactos son deduplicados atómicamente. |
| **QA-02: Contexto Efímero Multiarchivo** | **PASS** | Archivo `values.production.yaml` (`helm_values`) adjuntado y renderizado en UI (`[data-testid^="context-file-item-"]`). Invariante H8-020: 0 tablas crudas de archivos en SQLite. Ciclo de vida efímero en RAM. |
| **QA-02: Modal de Consentimiento IA** | **PASS** | Apertura real de `[data-testid="ai-consent-modal"]`. Inventario de evidencias y archivos efímeros vinculados antes de confirmar diagnóstico. |
| **QA-02: Diagnóstico IA Mock y Remediación** | **PASS** | Diagnóstico ejecutado contra proveedor mock seguro. Reporte renderizado con badge `CONCLUSIVE`, hechos vinculados con citas verificadas, barra de confianza de hipótesis y diff de remediación reversible (`verify-remediation-btn`). |
| **Hardening de Auditoría (RC-RES-02)** | **PASS** | Intento de spoofing enviando `operatorName: "cluster-admin-root"` fue registrado en SQLite con `actorId: "unverified-local-operator"`, `isVerifiedIdentity: false` y transición a `NO CONFIRMADO`. |
| **QA-02: Global Docking Post-Reinicio** | **PASS** | Relanzamiento en frío de la aplicación empaquetada. Montaje de SplitPanel (`workspace-root-layout`, `split-panel-layout-container`, `split-panel-left`, `split-panel-right`, toolbar y botones de catálogo/swap/reset/save). Estado de incidentes y deduplicación persistidos. |
| **QA-01: Evidencias Visuales Genuinas** | **PASS** | 6 capturas de pantalla tomadas tras navegación y aserciones de componentes Playwright. Los 6 checksums SHA-256 son mutuamente distintos y difieren del fotograma estático previo. |

---

## 3. Registro Criptográfico de Evidencias Visuales (QA-01)

Ruta de almacenamiento: `docs/evidence/h8-mvp-rc2/`

| Archivo | Fase / Pantalla Representada | Tamaño (bytes) | Checksum SHA-256 |
| :--- | :--- | :---: | :--- |
| `01_rc2_packaged_launch.png` | Launch & Welcome Page genuina de OpenLens DevOps | 103.667 | `1b28ea0a04a6b3b4d77eb3c8394ea2165e5b8d951883b2031bf23d16de26163f` |
| `02_rc2_sqlite_v8_migration_upgrade.png` | Preferencias de Retención y Purga con vista previa activa | 252.611 | `2100db6c1c52791d560a6821aba7db80090c601411bff2148ad996df231d632b` |
| `03_rc2_scanner_demo_mode.png` | Centro de Incidentes con Escáner Local Demo activo (0 watchers) | 188.973 | `7bf109fd62d56ad47fae48157f0a8731110c3feec8bed2aa494518fea19a9d5d` |
| `04_rc2_signal_uid_deduplication.png` | Tabla reactiva con 4 incidentes y deduplicación por UID | 300.778 | `7303692ec2722c3c45302dd4d617a0605e56ba1bd732a7a3caf25df6b340eb11` |
| `05_rc2_audit_unverified_operator.png` | Workbench con Contexto Efímero, Consentimiento y Diagnóstico IA | 484.440 | `5bfca9a625c7376c1746eb46ed3da900a973582e9647598b819d879aa0e043df` |
| `06_rc2_restart_persistence_docking.png` | Global Docking con SplitPanel tras reinicio en frío | 303.267 | `df3fedccf51946d269a870389cda1a22a72a8c00cd4d156a28e0663c3e025293` |

*Verificación de unicidad:* `Set(hashes).size === 6` confirmado. Ningún hash coincide con el hash estático previo `22dfc05b394554e9fc244b4f811597cf421b44ff14771b64e77235c31ca52990`.

---

## 4. Invariantes de Seguridad y Cumplimiento

1. **Cero Conexiones Externas:** El perfil de pruebas operó con kubeconfig sintético sin comunicación hacia clústeres reales o servicios remotos.
2. **Cero LLMs Remotos:** El diagnóstico bajo demanda se ejecutó contra el motor sintético determinístico mock.
3. **Cero Cuerpos Persistidos:** Se verificó la inexistencia de tablas para buffers o cuerpos de archivos de contexto en SQLite (`raw_file_buffers`, `ephemeral_context_files`).
4. **Preservación de Releases:** Los paquetes de `h8-mvp-rc1` y `h8-mvp-rc2` se encuentran íntegros en `open-lens/dist/` sin sobrescrituras ni regeneraciones innecesarias.

---

## 5. Dictamen y Próximos Pasos

El paquete **OpenLens DevOps H8 MVP RC2** ha cumplido satisfactoriamente con la totalidad de los criterios de aceptación independientes. Se declara **APROBADO PARA MERGE FAST-FORWARD EN `develop`** cuando el usuario así lo autorice.
