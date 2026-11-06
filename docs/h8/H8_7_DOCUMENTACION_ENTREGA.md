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

Adicionalmente, se cerraron tanto los bloqueantes iniciales (`docs/h8/H8_7_INDEPENDENT_REVIEW_2026-11-06.md`) como los dos hallazgos de cobertura y alcance de la reauditoría final (`docs/h8/H8_7_FINAL_INDEPENDENT_AUDIT.md`):
- **H87-QA-01 (Regresión ampliada):** Se corrigió la deuda de aislamiento del harness en `getDiForUnitTesting.ts`, resolviendo los 16 fallos en las 3 suites de Welcome y manteniendo la regresión ampliada en **54 suites y 443 tests 100% en verde**.
- **H87-FINAL-01 (Hallazgo A - Clicks reales en botones contextuales):** Se eliminó la navegación programática por DI en las pruebas contextuales, reemplazándola por clicks auténticos de Playwright sobre los botones e hipervínculos (`incidents-help-button`, `open-workbench-btn`, `workbench-help-button`, `tab-diagnostic`, `analyze-ai-btn`, `consent-help-link`, `docking-help-button`), retornando al clúster y comprobando su renderizado entre cada consulta.
- **H87-FINAL-02 (Hallazgo B - Auditoría estricta de red y prueba negativa):** Se amplió el control de red mediante intercepción dual (Electron Main `session.defaultSession.webRequest.onBeforeRequest` y Playwright `ctx.route("**/*")`), cubriendo arranque, BrowserWindows y frames. Se validó el aislamiento fail-closed mediante una prueba negativa sintética bloqueada exitosamente, confirmando **0 peticiones externas no autorizadas** de 83 peticiones totales observadas.

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
| **DOC-007** | Acciones de ayuda contextual discretas («?») en SplitPanel, IncidentListView y IncidentWorkbench. | **PASS** | Botones con deep links probados de punta a punta mediante clicks reales Playwright hacia sus 4 destinos. |
| **DOC-008** | QA real: suite Jest focalizada (17 tests), regresión ampliada (443 tests) y smoke Playwright con Electron real sobre perfil aislado con auditoría de red global y prueba negativa. | **PASS** | `documentation.test.tsx`, `h8-7-documentation-smoke.mjs`, 54 suites Jest PASS. |

---

## 3. Cierre de Hallazgos de Revisión y Reauditoría Independiente

### H87-QA-01 — Corrección de aislamiento en test harness de Welcome

- **Diagnóstico:** Los 16 fallos en `setting-welcome-page.test.tsx`, `banners-from-extension.test.tsx` y `navigation-using-application-menu.test.ts` eran consecuencia de deuda técnica previa proveniente de H8 (`c969d2b7`), donde los injectables `scheduleAutomaticPurgeInjectable` y `setupIncidentIpcInjectable` fueron registrados en `onLoadOfApplicationInjectionToken` con `causesSideEffects: true`, pero no fueron incluidos en `overrideRunnablesHavingSideEffects` de `packages/core/src/main/getDiForUnitTesting.ts`.
- **Solución implementada:**
  1. En `packages/core/src/main/getDiForUnitTesting.ts`, se incluyeron ambos injectables en `overrideRunnablesHavingSideEffects` con ejecución no-op, protegiendo las pruebas de efectos secundarios reales sin alterar en absoluto el comportamiento productivo de arranque.
  2. En `packages/core/src/renderer/utils/channel/ipc-renderer.global-override-for-injectable.ts`, se añadieron stubs seguros para `.send` y `.sendSync`.
  3. En `packages/core/src/main/start-main-application/lens-window/application-window/create-lens-window.injectable.ts`, se restableció la espera de `target.loadUrl(url)` tras mostrar la ventana (`showWindow()`), permitiendo que el harness espere la carga completa de la vista antes de consultar el DOM en pruebas de integración.
  4. Se actualizaron los snapshots de `navigation-using-application-menu.test.ts.snap` para incorporar el nuevo botón «Documentación» en la pantalla de bienvenida.
- **Resultado:** **54 suites ejecutadas, 54 PASS, 443 tests PASS (0 fallos).**

### H87-FINAL-01 — Sustitución de navegación programática por clicks reales (Hallazgo A)

- **Problema señalado:** El smoke utilizaba `window.__LENS_RENDERER_DI__.injectById('navigate-to-documentation')` cuatro veces desde la ventana principal, omitiendo el ejercicio real de los botones e hipervínculos dentro del clúster.
- **Solución implementada:**
  1. Se conectó la aplicación con el clúster sintético demo (`[data-testid="welcome-launch-demo-cluster"]`) y se navegó el frame a `/incidents`.
  2. Se prepararon fixtures sintéticos de incidentes en el contexto confiable de Main y se sincronizó el store de renderizado.
  3. Se ejecutaron clicks reales Playwright sobre:
     - `incidents-help-button` en el header del Centro de Incidentes (`incidentes`).
     - `open-workbench-btn` para montar el panel auténtico de Incident Workbench.
     - `workbench-help-button` en el header de Incident Workbench (`diagnostico-ia`).
     - `tab-diagnostic` y `analyze-ai-btn` para abrir el modal auténtico de consentimiento IA.
     - `consent-help-link` dentro del modal de consentimiento (`contexto-efimero`).
     - `docking-help-button` en la barra de SplitPanel dentro de Kubetail (`ventanas-flotantes`).
  4. Entre cada una de las cuatro consultas se ejecutó retorno real al clúster (`window.history.back()`), esperando la visibilidad y estabilidad de los componentes correspondientes (`incident-list-view`, `incident-workbench-panel` y `split-panel-layout-container`).

### H87-FINAL-02 — Auditoría de red ampliada y prueba negativa fail-closed (Hallazgo B)

- **Problema señalado:** El listener previo registraba solicitudes únicamente en la ventana principal tras su apertura, sin cubrir frames, ventanas secundarias ni el proceso Main, y sin validar fail-closed ante solicitudes no autorizadas.
- **Solución implementada:**
  1. **Intercepción en Main:** En `app.evaluate`, se configuró `session.defaultSession.webRequest.onBeforeRequest` para registrar y cancelar inmediatamente cualquier solicitud externa no autorizada a nivel de red de Electron.
  2. **Intercepción en Playwright:** A través de `ctx.route("**/*")` en el `BrowserContext`, se controlaron todas las ventanas y frames existentes y emergentes.
  3. **Prueba negativa sintética segura:** Antes de iniciar las pruebas funcionales, se indujo un intento de conexión externa a `https://negative-test-external.lens-security-audit.invalid/telemetry-probe`. El interceptor bloqueó la llamada (`Failed to fetch`), registrándola como intento no autorizado y demostrando el comportamiento fail-closed del sistema.
  4. **Conteo neto:** 83 solicitudes totales interceptadas (arranque, bienvenida, documentación, demo cluster, kubernetes sintético API). **Cero solicitudes externas no autorizadas.**

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
| 6 | `06-contextual-incidentes.png` | `d435146e832ca992ef07eb9b71287636e1067b0ab0f36858992223914b49f228` | PASS |
| 7 | `07-contextual-workbench.png` | `c950ea669d609fb273717a5faefd2781f3f9c94e7e895a22277710796529ec3e` | PASS |
| 8 | `08-contextual-consent.png` | `7c077a8752c90e3cfe7a935415985a4d1a700339fa5eab059c00f89e476b3b08` | PASS |
| 9 | `09-contextual-docking.png` | `48982ab95ba4a7b575377a8718f83231e543b04ca238bde7aa4eb75559113174` | PASS |

---

## 5. Limitaciones Honestas y Restricciones Operativas

1. **Escáner Sintético:** El escáner opera únicamente sobre feeds sintéticos locales con 0 conexiones reales a Kubernetes y 0 watchers activos en producción.
2. **Diagnóstico IA:** El proveedor por defecto es sintético/mock; la remediación reversible propone cambios pero nunca escribe automáticamente sobre Kubernetes.
3. **Ventanas Desacopladas (H7.5):** Las listas de Pods/Deployments en ventanas flotantes son de solo lectura; para acciones de edición o escalado se debe re-acoplar a la ventana principal.
4. **Almacenamiento Local:** Los manuales residen empaquetados en el bundle de la aplicación; no se requiere ni se realiza ninguna llamada de red a servidores externos.
