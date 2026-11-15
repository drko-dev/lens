# NovaKube — R9 Missing Features Inventory & Roadmap

## 1. Explicit Inventory of Missing / External Features

| ID | Nombre | Dónde aparece en Lens | Qué hace | Interacción del usuario | Componentes requeridos | Backend necesario | Código aprovechable | Complejidad | Dependencias | Prioridad | Clasificación |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R9-MF-01 | **Pod `Show Details`, `Attach Pod` & `Share`** | `Pods -> more_vert` menu | Abre Details Drawer (`Show Details`), adjunta stdin/stdout a contenedor activo (`Attach Pod`), o copia referencia/deep-link (`Share`) | Click en ítem del menú contextual del Pod | `PodMenu` / `KubeObjectMenu`, `PodAttachCommand` / `TerminalStore`, `ShowDetailsUrl` | K8s `pods/attach` SPDY/WS (igual que `pods/exec` pero `attach`), Clipboard API | `pod-shell-session` + `terminal` + `openDetails` ya existen | Media | `TerminalStore`, `exec` / `attach` WS | P1 | `FUNCTIONAL_GAP` (realizable en R9.7) |
| R9-MF-02 | **WorkspaceTab Context Menu** | Click derecho sobre pestaña de clúster | `Close`, `Close All`, `Close other tabs`, `Close tabs to the right`, `Open in new window` | Right-click en `.WorkspaceTab` | `WorkspaceTabBar` menu + handlers en `WorkspaceTabsStore` | IPC `detached-tool` / `WindowManager` o acciones de store | `WorkspaceTabsStore` ya tiene `closeTab` | Baja | `WorkspaceTabsStore` | P0 | `FUNCTIONAL_GAP` (realizable en R9.4) |
| R9-MF-03 | **Admission Policies completas (`Mutating` / `Validating` + Bindings)** | `Navigator -> Config -> Admission Policies` | Lista y edita `MutatingAdmissionPolicy`, `MutatingAdmissionPolicyBinding`, `ValidatingAdmissionPolicy`, `ValidatingAdmissionPolicyBinding` | Expandir `Config -> Admission Policies` y abrir tabla/drawer | Stores, APIs (`admissionregistration.k8s.io/v1`), routes y sidebar items | K8s `admissionregistration.k8s.io/v1` | `config-validating-admission-policies` ya existe parcialmente | Media | `KubeObjectListLayout`, `KubeApi` | P1 | `FUNCTIONAL_GAP` (realizable en R9.7) |
| R9-MF-04 | **`Applications` vista raíz unificada** | `Navigator -> Applications` | Muestra aplicaciones desplegadas (Helm releases + Workloads agrupados por app label) | Click en `Applications` en el sidebar | `ApplicationsView`, agregador de Helm Releases + Deployments/StatefulSets | K8s API + Helm releases | `helm-releases` y `applications-and-security` ya existen | Media | `HelmReleasesStore`, `DeploymentStore` | P2 | `MISSING` (roadmap post-R9 o R9.7 si acotado) |
| R9-MF-05 | **`Preferences -> Experimental`** | `Preferences -> Experimental` | Toggle de feature flags experimentales (ej. Global Docking, AI local, etc.) | Click en tab `Experimental` y toggle switches | `ExperimentalPreferences` en `features/preferences` | `UserPreferencesStore` / `localStorage` | `features/preferences` + `global-docking-feature-flag` | Baja | `UserPreferencesStore` | P2 | `MISSING` (realizable en R9.7) |
| R9-MF-06 | **Overview / Pod Metrics Range Selector (`1h–24h`)** | `Cluster Overview` y `Pod Drawer -> Metrics` | Cambia ventana temporal de gráficos de Prometheus | Dropdown selector `1h`, `6h`, `12h`, `24h` | `ClusterMetrics`, `PodMetrics` | Prometheus range query API configurado | `cluster-metrics.tsx` | Media | Prometheus backend | P2 | `EXTERNAL_DEPENDENCY` |
| R9-MF-07 | **Mirantis Proprietary (`UPGRADE`, `Lens ID`, `Send Feedback`, `Lens AI Cloud`, `Lens CLI` / `Update Channel`)** | TopBar y `Preferences -> App` | Suscripción comercial, auth Mirantis Cloud, telemetría/feedback Mirantis | Click abre login/checkout Mirantis | N/A | Servicios cloud propietarios Mirantis + licencia | Reemplazado por AI Providers BYOK/OAuth y funciones locales sin paywall | N/A | Servicio externo Mirantis | P3 | `EXTERNAL_DEPENDENCY` |

---

## 2. Roadmap de Implementación (Hitos R9.3 – R9.7)

### Hito A — Regresiones inmediatas (`R9.3`)
- **Objetivo**: Eliminar textos en español en Pod Drawer (`Aislamiento Ingress/Egress`, `Políticas Aplicables`) y los 2 `<MenuItem>` vacíos en `Pod` context menu.
- **Archivos afectados**: `packages/core/src/renderer/components/kube-object-detail-items/` (network policy / pod details), `packages/core/src/renderer/components/workloads-pods/pod-details.tsx` / `kube-object-menu.tsx`.
- **Criterios de aceptación**: Pod Drawer 100% en inglés; `podMenu` sin strings vacíos en CDP `:9223`.
- **Tests**: Jest focalizado (`--maxWorkers=2`) + verificación CDP `:9223`.

### Hito B — Paridad funcional compartida (`R9.4`)
- **Objetivo**: Implementar `WorkspaceTab` Context Menu (`Close`, `Close All`, `Close other tabs`, `Close tabs to the right`), `Show Details` + `Share` (copy resource ref/link) en Pod Menu, y feedback visible al clickear `notifications_none` en TopBar fuera de cluster.
- **Archivos afectados**: `workspace-tab-bar.tsx`, `workspace-tabs-store.ts`, `novakube-top-bar-actions.injectable.tsx`, pod menu component.
- **Criterios de aceptación**: Right-click en cualquier tab muestra menú funcional; `notifications_none` abre/navega a Incidents siempre; `Show Details` y `Share` funcionan en Pod menu.
- **Tests**: `workspace-tabs` Jest (`--maxWorkers=2`) + CDP `:9223`.

### Hito C — Funcionalidades faltantes realizables (`R9.7`)
- **Objetivo**: Completar `Preferences -> Experimental` (exponiendo feature flags reales como Global Docking), completar `Config -> Admission Policies` (`Validating` + `Mutating` + `Bindings`), y agregar `Attach Pod` en Pod Menu.
- **Criterios de aceptación**: Secciones navegables y funcionales en `:9223` sin romper OpenLens histórico ni NovaKube.
- **Tests**: Jest focalizados en serie (`--maxWorkers=2`) + E2E Playwright.
