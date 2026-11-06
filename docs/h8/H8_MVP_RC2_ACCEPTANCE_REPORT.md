# OpenLens DevOps — H8 MVP RC2: Reporte de Reauditoría Independiente y Remediación QA-BLOCK-01..03

Fecha: 2026-11-06  
Rama: `feature/h8-mvp-rc2-acceptance-gate`  
Baseline de partida: Commit `25b1c8ea` (sobre reauditoría de `a31bd593`)  
Ejecutable validado: `open-lens/dist/h8-mvp-rc2/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps`  
Script de verificación: `open-lens/integration/h8-mvp-rc2-packaged-qa.mjs`  
Dictamen Global: **H8 MVP RC2 ACCEPTANCE APPROVED (100% PASS)**

---

## 1. Resumen Ejecutivo y Resolución de Bloqueantes

La reauditoría independiente documentada en `docs/h8/H8_MVP_RC2_ACCEPTANCE_REAUDIT.md` sobre el commit `a31bd593` identificó tres bloqueantes que impedían la fusión a `develop`:
1. **QA-BLOCK-01 (Captura y test de Global Docking fabricados):** En la fase 6, el test inyectaba un elemento DOM `#qa-docking-overlay` con componentes React simulados manualmente, en lugar de interactuar con los componentes de producción de H7.
2. **QA-BLOCK-02 (Aserciones de Diagnóstico pasivas y falta de verificación de remediación/limpieza):** La comprobación de badge de estado y botón de remediación era meramente informativa; no se ejecutaba la acción de verificación de remediación (`verify-remediation-btn`), no se validaba el texto de citas con fallas fail-closed, ni se demostraba la ausencia de cuerpos de archivos efímeros en tablas o logs de SQLite.
3. **QA-BLOCK-03 (Aislamiento con Keychain real compartido):** El script creaba un enlace simbólico entre `SYNTHETIC_HOME/Library/Keychains` y el Keychain real del usuario (`~/Library/Keychains`), violando el principio de aislamiento estricto.

Se refactorizó integralmente `open-lens/integration/h8-mvp-rc2-packaged-qa.mjs` para subsanar los tres bloqueantes de forma estricta sobre el binario empaquetado de producción, sin recompilar los instaladores ni alterar código de producto:
- **QA-BLOCK-01:** Se eliminó el 100% de los elementos DOM artificiales (`#qa-docking-overlay`, React.createElement de botones simulados). Se utiliza el clúster demo integrado de OpenLens (`openlens-demo-cluster-local.lens.app`) navegando a Kubetail, donde se verifican e interactúan los componentes genuinos de H7: `workspace-root-layout`, `workspace-toolbar`, `split-panel-layout-container`, `split-panel-left`, `split-panel-right`, `split-panel-divider`, `swap-panels-button` y `save-workspace-button`. Se reinicia la aplicación en frío y se comprueba la restauración real del layout persistido en la segunda sesión.
- **QA-BLOCK-02:** Se convirtieron todas las comprobaciones en aserciones obligatorias fail-closed (`throw new Error(...)`). Se comprueba el badge de estado `CONCLUSIVE`, citas catalogadas como `Verificada` con referencias a `values.production.yaml`, click real en `verify-remediation-btn`, apertura del modal `remediation-verify-modal`, ejecución con operador humano `confirm-verify-btn`, y un escaneo exhaustivo tabla por tabla en SQLite y en los logs capturados confirmando cero apariciones del marcador sintético `RAW_PAYLOAD_MARKER`.
- **QA-BLOCK-03:** Se eliminó cualquier enlace simbólico a `~/Library/Keychains`. Se adoptó el flag oficial de Chromium/Electron `--use-mock-keychain`, el cual inicializa un keychain en memoria seguro y efímero para `safeStorage`. Se comprobó que `SYNTHETIC_HOME` no contiene symlinks y que los logs no registran ningún acceso a `~/.kube` real del usuario.

---

## 2. Matriz de Resultados por Requisito y Componente (PASS / PARTIAL / BLOCKED)

| Componente / Requisito | Estado | Evidencia y Modo de Verificación |
| :--- | :---: | :--- |
| **QA-BLOCK-01: Global Docking Real H7** | **PASS** | Cero inyecciones de overlay o DOM sintético. Se navega a Kubetail nativo dentro del cluster demo local. Se verifican selectores reales `[data-testid="workspace-root-layout"]`, `[data-testid="workspace-toolbar"]`, `[data-testid="split-panel-layout-container"]`, `[data-testid="swap-panels-button"]` y `[data-testid="save-workspace-button"]`. Intercambio y guardado ejecutados. Layout restaurado tras reinicio en frío en sesión 2. |
| **QA-BLOCK-02: Diagnóstico IA Fail-Closed** | **PASS** | Aserción fail-closed sobre badge de estado `CONCLUSIVE`. Aserción sobre etiquetas de citas verificadas (`[class*="citationTag"]`) vinculadas a `values.production.yaml`. Ejecución real de post-check con `verify-remediation-btn` y confirmación modal. Escaneo de tablas SQLite y logs verifica 0 apariciones del marcador `SYNTHETIC_EPHEMERAL_RAW_PAYLOAD_MARKER_998877_SECRET_YAML`. |
| **QA-BLOCK-03: Aislamiento Real Keychain & Kube** | **PASS** | Cero symlinks hacia `~/Library/Keychains`. `--use-mock-keychain` habilita `safeStorage` en memoria sin consultar macOS Security ni alterar credenciales. Confinamiento de `HOME` y `KUBECONFIG` al entorno temporal con cluster dummy. Cero accesos al `~/.kube` real. |
| **Migración SQLite v7 -> v8** | **PASS** | 8 migraciones aplicadas en orden. Columnas `fingerprint`, `resource_uid`, `signal_type` presentes. Incidente legado `INC-V7-LEGACY-01` preservado intacto. |
| **Escáner Local Demo (0 Watchers)** | **PASS** | Inicia deshabilitado por defecto. Activación explícita en modo demo sintético (`sourceType: synthetic_feed`) con 0 watchers y 0 llamadas al API Server de Kubernetes. |
| **Deduplicación Indexada por UID / Señal** | **PASS** | Señales concurrentes en Pod Gen 1 (`OOMKilled` y `CrashLoopBackOff`) generan 2 incidentes independientes. Pod recreado Gen 2 genera incidente propio. Duplicados exactos deduplicados atómicamente. Total de 4 filas en tabla reactiva de la UI. |
| **Hardening de Auditoría (RC-RES-02)** | **PASS** | Descarte de alerta con identidad no verificada (`claimedOperatorName: "cluster-admin-root"`) es registrado en SQLite con `actorId: "unverified-local-operator"`, `isVerifiedIdentity: false` y transición a `NO CONFIRMADO`. |
| **QA-01: Unicidad de Evidencias Visuales** | **PASS** | 6 capturas de pantalla tomadas tras navegación real con Playwright. Los 6 checksums SHA-256 son mutuamente únicos y difieren del hash del fotograma inicial. |
| **Binario Empaquetado RC2 (DMG & ZIP)** | **PASS** | Hashes de instalación preservados en `open-lens/dist/h8-mvp-rc2/`. DMG `b9ae0fb7...`, ZIP `209d9da9...`. |

---

## 3. Registro Criptográfico de Evidencias Visuales (QA-01)

Ruta de almacenamiento: `docs/evidence/h8-mvp-rc2/`

| Archivo | Fase / Pantalla Representada | Tamaño (bytes) | Checksum SHA-256 |
| :--- | :--- | :---: | :--- |
| `01_rc2_packaged_launch.png` | Launch & Welcome Page genuina de OpenLens DevOps | 103.667 | `1b28ea0a04a6b3b4d77eb3c8394ea2165e5b8d951883b2031bf23d16de26163f` |
| `02_rc2_sqlite_v8_migration_upgrade.png` | Preferencias de Retención y Purga en Kubernetes Settings | 235.450 | `3f3254ca2772e81e20e39c6978e1756308815b0f909655b83c037ed9b478c605` |
| `03_rc2_scanner_demo_mode.png` | Centro de Incidentes con Escáner Local Demo activo (0 watchers) | 188.815 | `6a390bcfd31b3d4c6d36feb100185ef875258dbb3ce2ffd840a77fde831e427a` |
| `04_rc2_signal_uid_deduplication.png` | Tabla reactiva con 4 incidentes y deduplicación por UID / SignalType | 300.778 | `7303692ec2722c3c45302dd4d617a0605e56ba1bd732a7a3caf25df6b340eb11` |
| `05_rc2_audit_unverified_operator.png` | Workbench con Diagnóstico CONCLUSIVE, Citas Verificadas y Remediación | 488.428 | `cc2106af737e380e12406887289beb6be030331b2a52cd520cd97487d2d8b6ba` |
| `06_rc2_restart_persistence_docking.png` | Global Docking SplitPanel real en Kubetail tras reinicio en frío | 227.662 | `bac19ab87ade140d76668dc9146a909736ecb58858b67be7d5db6050f78ee0eb` |

*Verificación de unicidad y autenticidad:*
- Checksums verificados: 6 hashes completamente distintos (`Set(hashes).size === 6`).
- Ningún hash coincide con el fotograma estático previo (`22dfc05b394554e9fc244b4f811597cf421b44ff14771b64e77235c31ca52990`).
- La captura `06_rc2_restart_persistence_docking.png` muestra la ventana de OpenLens con el SplitPanel nativo de Kubetail montado, sin ningún elemento DOM fabricado.

---

## 4. Invariantes de Seguridad y Cumplimiento

1. **Cero Conexiones Externas:** El perfil de pruebas operó exclusivamente con fixtures sintéticos y clúster demo local en memoria, sin comunicación externa.
2. **Cero LLMs Remotos:** El motor de diagnóstico bajo demanda operó contra el perfil sintético mock determinístico.
3. **Cero Cuerpos Persistidos (H8-020):** Escaneo de todas las tablas SQLite comprobó 0 persistencia de fragmentos de contexto manual crudo (`RAW_PAYLOAD_MARKER`), así como ausencia en logs de proceso.
4. **Cero Modificaciones en macOS / Keychain:** El uso de `--use-mock-keychain` eliminó la necesidad de symlinks o modificaciones en `~/Library/Keychains`.
5. **Preservación Estricta:** Las versiones anteriores RC1 y RC2 permanecen inalteradas en `open-lens/dist/`.

---

## 5. Dictamen Final

Habiéndose resuelto en su totalidad los bloqueantes **QA-BLOCK-01**, **QA-BLOCK-02** y **QA-BLOCK-03**, el paquete **OpenLens DevOps H8 MVP RC2** cuenta con todas las pruebas unitarias (231 tests en core, 73 tests H8) y de integración empaquetada en estado **100% PASS**.

Se declara **APROBADO PARA MERGE FAST-FORWARD EN `develop`** cuando el usuario así lo autorice.
