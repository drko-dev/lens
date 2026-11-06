# H8.7 — Reporte de Entrega: Centro de Documentación Integrado

**Fecha:** 2026-11-06  
**Rama:** `feature/h8-7-documentacion-in-app`  
**Base:** `develop` en `83b1307f` (H8 MVP RC2 Aprobado)  
**Proyecto Engram:** `lens-v6-ui-corrections`  
**Estado General:** **PASS**

---

## 1. Resumen Ejecutivo

Se implementó de manera completa y autónoma el **Centro de Documentación Integrado en OpenLens DevOps** (hitos DOC-001 a DOC-008), resolviendo la necesidad de contar con documentación operativa nativa, empaquetada offline y en español argentino/técnico para las funcionalidades introducidas en H7 y H8.

El centro es completamente accesible sin conexión a internet, sin clústeres Kubernetes configurados y sin credenciales de proveedores de IA externos.

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
| **DOC-007** | Acciones de ayuda contextual discretas («?») en SplitPanel, IncidentListView y IncidentWorkbench. | **PASS** | Botones con deep links integrados en layout, lista y workbench. |
| **DOC-008** | QA real: suite Jest focalizada (17 tests) y smoke Playwright con Electron real sobre perfil aislado con capturas auténticas. | **PASS** | `documentation.test.tsx`, `r5-08-welcome.test.tsx`, `h8-7-documentation-smoke.mjs`. |

---

## 3. Inventario de Manuales Operativos Empaquetados (`docs/user-guide/es/`)

Compilados determinísticamente mediante `packages/core/scripts/generate-user-guide.cjs` en `user-guide.generated.ts`:

1. `inicio.md` — **Bienvenido a OpenLens DevOps** (Visión general, arquitectura y filosofía).
2. `primeros-pasos.md` — **Clústeres, navegación y recursos** (Configuración local, kubeconfig, Midnight Graphite).
3. `ventanas-flotantes.md` — **Cómo crear una ventana flotante** (Desacople, multimonitor, restricciones de solo lectura).
4. `acoplamiento.md` — **Distribución y acoplamiento de paneles** (Split panel, proporciones, colapso y restauración).
5. `workspaces.md` — **Plantillas y espacios de trabajo** (Operación, Incidentes, Desarrollo).
6. `incidentes.md` — **Centro de Incidentes y Timeline** (Severidad, análisis, confirmación de cierre).
7. `escaner-sintetico.md` — **Escáner Local (Demo Sintético)** (Cero watchers reales, señales sintéticas, deduplicación).
8. `diagnostico-ia.md` — **Cómo usar el diagnóstico con IA** (Proveedor mock, citas verificadas, remediación reversible).
9. `contexto-efimero.md` — **Archivos de contexto efímero y privacidad** (Sanitización de secrets, invalidación y zeroización).
10. `faq.md` — **Solución de problemas frecuentes** (Diagnósticos inconclusos, layout recovery, permisos RBAC).

---

## 4. Evidencias Visuales de Validación E2E (Playwright)

El script `open-lens/integration/h8-7-documentation-smoke.mjs` ejecutó el flujo completo sobre Electron real en macOS ARM64 con perfil 100% aislado (HOME y KUBECONFIG sintéticos, mock keychain, sin conexión a clústeres ni red externa):

| Captura | Archivo | SHA-256 | Estado Visual |
|---|---|---|:---:|
| 1 | `docs/evidence/h8-7/01-welcome-documentation-entry.png` | `300bd2dd6167de8cbdc6a582ae7d4856bdfced0d4f48147321de3484757a0737` | PASS |
| 2 | `docs/evidence/h8-7/02-documentation-center-inicio.png` | `6ec1249634a824c954adc833dfc4a4416d6592ce1fd547723bcd1e6ba3895b69` | PASS |
| 3 | `docs/evidence/h8-7/03-article-ventanas-flotantes.png` | `59c192c237f51123e76ac9b6c855433ea451800d45c46243f029434138808046` | PASS |
| 4 | `docs/evidence/h8-7/04-article-diagnostico-ia.png` | `c7ff31e233c6f7bc7c19803ae6be655b1f9e069be2519542357f823f3717f7fb` | PASS |
| 5 | `docs/evidence/h8-7/05-return-to-welcome.png` | `b9a9fc13c4a610a05bbc2bafd0259e70e28a7e8e303280edf6dd40e0193fe84b` | PASS |

Todas las capturas son visualmente distintas y auténticas (5 hashes únicos).

---

## 5. Limitaciones Honestas y Restricciones Operativas

1. **Escáner Sintético:** El escáner opera únicamente sobre feeds sintéticos locales con 0 conexiones reales a Kubernetes y 0 watchers activos en producción.
2. **Diagnóstico IA:** El proveedor por defecto es sintético/mock; la remediación reversible propone cambios pero nunca escribe automáticamente sobre Kubernetes.
3. **Ventanas Desacopladas (H7.5):** Las listas de Pods/Deployments en ventanas flotantes son de solo lectura; para acciones de edición o escalado se debe re-acoplar a la ventana principal.
4. **Almacenamiento Local:** Los manuales residen empaquetados en el bundle de la aplicación; no se requiere ni se realiza ninguna llamada de red a servidores externos.
