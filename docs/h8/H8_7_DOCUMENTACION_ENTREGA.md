# H8.7 — Reporte de Entrega: Centro de Documentación Integrado

**Fecha:** 2026-11-06  
**Rama:** `feature/h8-7-documentacion-in-app`  
**Base:** `develop` en `83b1307f` (H8 MVP RC2 Aprobado)  
**Proyecto Engram:** `lens-v6-ui-corrections`  
**Estado General:** **PASS (Aceptación Completa)**

---

## 1. Resumen Ejecutivo

Se implementó y validó de forma integral y autónoma el **Centro de Documentación Integrado en OpenLens DevOps** (hitos DOC-001 a DOC-008), resolviendo la necesidad de contar con documentación operativa nativa, empaquetada offline y en español argentino/técnico para las funcionalidades introducidas en H7 y H8.

El centro es completamente accesible sin conexión a internet, sin clústeres Kubernetes configurados y sin credenciales de proveedores de IA externos.

Adicionalmente, se cerraron los dos bloqueantes señalados en la revisión independiente (`docs/h8/H8_7_INDEPENDENT_REVIEW_2026-11-06.md`):
- **H87-QA-01 (Regresión ampliada):** Se corrigió la deuda de aislamiento del harness en `getDiForUnitTesting.ts`, resolviendo los 16 fallos en las 3 suites de Welcome y dejando la regresión ampliada en **54 suites y 443 tests 100% en verde**.
- **H87-QA-02 (Cobertura y estrictez offline):** Se ejercitaron de punta a punta los enlaces contextuales de Incidentes, Workbench, Consentimiento y Docking, y se integró un auditor estricto de red por intercepción de Playwright confirmando **cero solicitudes a dominios externos**.

---

## 2. Matriz de Cumplimiento de Criterios (DOC-001 a DOC-008)

| Criterio | Descripción | Estado | Verificación |
|---|---|:---:|---|
| **DOC-001** | Menú nativo `Help > Documentación` (F1), acceso en Welcome y preservación de `Documentación de Lens (externa)`. | **PASS** | `open-documentation-menu-item.injectable.ts`, `welcome.tsx`, Playwright smoke. |
| **DOC-002** | Centro de Documentación Midnight Graphite, buscador offline (normalizado sin tildes/case-insensitive), renderizado Markdown seguro. | **PASS** | `documentation.tsx`, `documentation-catalog.ts`, Jest suite (10 tests). |
| **DOC-003** | Manual de Docking Global, ventanas flotantes, acoplamiento y restricciones de solo lectura. | **PASS** | `docs/user-guide/es/ventanas-flotantes.md`, `acoplamiento.md`. |
| **DOC-004** | Manual de Centro de Incidentes, timeline, deduplicación, y alcance real del escáner sintético (0 watchers reales). | **PASS** | `docs/user-guide/es/incidentes.md`, `escaner-sintetico.md`. |
| **DOC-005** | Manual de Diagnóstico IA, consentimiento, cuotas, remediación reversible y contexto efímero sanitizado. | **PASS** | `docs/user-guide/es/diagnostico-ia.md`, `contexto-efimero.md`. |
| **DOC-006** | Manual de Primeros Pasos, gestión de clústeres, temas, atajos validados y FAQ de solución de problemas. | **PASS** | `docs/user-guide/es/primeros-pasos.md`, `workspaces.md`, `faq.md`. |
| **DOC-007** | Acciones de ayuda contextual discretas («?») en SplitPanel, IncidentListView y IncidentWorkbench. | **PASS** | Botones con deep links probados de punta a punta hacia sus 4 destinos. |
| **DOC-008** | QA real: suite Jest focalizada (17 tests), regresión ampliada (443 tests) y smoke Playwright con Electron real sobre perfil aislado con auditoría de red. | **PASS** | `documentation.test.tsx`, `h8-7-documentation-smoke.mjs`, 54 suites Jest PASS. |

---

## 3. Cierre de Hallazgos de Revisión Independiente

### H87-QA-01 — Corrección de aislamiento en test harness de Welcome

- **Diagnóstico:** Los 16 fallos en `setting-welcome-page.test.tsx`, `banners-from-extension.test.tsx` y `navigation-using-application-menu.test.ts` eran consecuencia de deuda técnica previa proveniente de H8 (`c969d2b7`), donde los injectables `scheduleAutomaticPurgeInjectable` y `setupIncidentIpcInjectable` fueron registrados en `onLoadOfApplicationInjectionToken` con `causesSideEffects: true`, pero no fueron incluidos en `overrideRunnablesHavingSideEffects` de `packages/core/src/main/getDiForUnitTesting.ts`.
- **Solución implementada:**
  1. En `packages/core/src/main/getDiForUnitTesting.ts`, se incluyeron ambos injectables en `overrideRunnablesHavingSideEffects` con ejecución no-op, protegiendo las pruebas de efectos secundarios reales sin alterar en absoluto el comportamiento productivo de arranque.
  2. En `packages/core/src/renderer/utils/channel/ipc-renderer.global-override-for-injectable.ts`, se añadieron stubs seguros para `.send` y `.sendSync`.
  3. En `packages/core/src/main/start-main-application/lens-window/application-window/create-lens-window.injectable.ts`, se restableció la espera de `target.loadUrl(url)` tras mostrar la ventana (`showWindow()`), permitiendo que el harness espere la carga completa de la vista antes de consultar el DOM en pruebas de integración.
  4. Se actualizaron los snapshots de `navigation-using-application-menu.test.ts.snap` para incorporar el nuevo botón «Documentación» en la pantalla de bienvenida.
- **Resultado:** **54 suites ejecutadas, 54 PASS, 443 tests PASS (0 fallos).**

### H87-QA-02 — Cobertura contextual y auditoría estricta offline

- **Auditoría de red:** El script Playwright `h8-7-documentation-smoke.mjs` interceptó 12 solicitudes de red totales durante el ciclo de vida de Electron DEV. **0 solicitudes externas**. Solo se permitieron orígenes locales (`https://lens.app:*`, `127.0.0.1`, esquemas `data:`/`file:`).
- **Cobertura contextual completa:** Se probó la navegación desde los cuatro puntos de entrada contextuales:
  1. `incidents-help-button` -> `/documentation/incidentes` («Centro de Incidentes y Timeline»).
  2. `workbench-help-button` -> `/documentation/diagnostico-ia` («Cómo usar el diagnóstico con IA»).
  3. `consent-help-link` -> `/documentation/contexto-efimero` («Adjuntar contexto temporal de forma segura»).
  4. `docking-help-button` -> `/documentation/ventanas-flotantes` («Cómo crear una ventana flotante»).

---

## 4. Evidencias Visuales de Validación E2E (Playwright)

El script `open-lens/integration/h8-7-documentation-smoke.mjs` generó 9 capturas de pantalla auténticas con hashes SHA-256 distintos en `docs/evidence/h8-7/`:

| Captura | Archivo | SHA-256 | Estado Visual |
|---|---|---|:---:|
| 1 | `01-welcome-documentation-entry.png` | `300bd2dd6167de8cbdc6a582ae7d4856bdfced0d4f48147321de3484757a0737` | PASS |
| 2 | `02-documentation-center-inicio.png` | `6ec1249634a824c954adc833dfc4a4416d6592ce1fd547723bcd1e6ba3895b69` | PASS |
| 3 | `03-article-ventanas-flotantes.png` | `59c192c237f51123e76ac9b6c855433ea451800d45c46243f029434138808046` | PASS |
| 4 | `04-article-diagnostico-ia.png` | `c7ff31e233c6f7bc7c19803ae6be655b1f9e069be2519542357f823f3717f7fb` | PASS |
| 5 | `05-return-to-welcome.png` | `b9a9fc13c4a610a05bbc2bafd0259e70e28a7e8e303280edf6dd40e0193fe84b` | PASS |
| 6 | `06-contextual-incidentes.png` | `81a8dd37e66b5f47b8b80cddfd188dfa0a5cfabe5f241a53dcad6297434d485e` | PASS |
| 7 | `07-contextual-workbench.png` | `1f5ed9102403cb61e20260257418087724f3981ef152f949ed49ec17354c7e77` | PASS |
| 8 | `08-contextual-consent.png` | `6b46b1ad20dead079ecf86fcde2a698bfbd5e41ac9f2a0ba17aa511acab93501` | PASS |
| 9 | `09-contextual-docking.png` | `3f45e84877e706516bd69df0da0c23fd7a507e20f8d7348e6d6bb92d3126d6a8` | PASS |

---

## 5. Limitaciones Honestas y Restricciones Operativas

1. **Escáner Sintético:** El escáner opera únicamente sobre feeds sintéticos locales con 0 conexiones reales a Kubernetes y 0 watchers activos en producción.
2. **Diagnóstico IA:** El proveedor por defecto es sintético/mock; la remediación reversible propone cambios pero nunca escribe automáticamente sobre Kubernetes.
3. **Ventanas Desacopladas (H7.5):** Las listas de Pods/Deployments en ventanas flotantes son de solo lectura; para acciones de edición o escalado se debe re-acoplar a la ventana principal.
4. **Almacenamiento Local:** Los manuales residen empaquetados en el bundle de la aplicación; no se requiere ni se realiza ninguna llamada de red a servidores externos.
