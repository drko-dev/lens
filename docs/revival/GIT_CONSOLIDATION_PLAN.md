# OpenLens DevOps Revival — Plan de Consolidación Git (R1, R2 y R3)

**Documento de Arquitectura, Auditoría y Preparación de Commits**  
**Fecha:** 20 de Octubre de 2026  
**Repositorio:** `/Users/gustavomarcon/Documents/lens/lens`  
**Rama:** `feat/openlens-devops-revival`  
**HEAD inicial:** `8838ac308bf4cc70a9911f7cdbc28e919f83fb2a`  
**Estado:** AUDITORÍA Y RESPALDO COMPLETADOS. PENDIENTE DE AUTORIZACIÓN PARA COMMITS.

---

## 1. Estado Exacto del Repositorio

A la fecha de auditoría se verificó la siguiente configuración y distribución física del working tree:

- **Rama activa:** `feat/openlens-devops-revival`
- **Commit HEAD:** `8838ac3` (`8838ac308bf4cc70a9911f7cdbc28e919f83fb2a`)
- **Git User:** `on-premise-servicios` (`on-premise-servicios@sidom.io`)
- **Remote Origin:** `git@github.com:drko-dev/lens.git`
- **Archivos tracked modificados:** **100 archivos**
- **Archivos untracked totales:** **3.838 archivos**
  - **Archivos de código fuente y documentación a versionar:** **273 archivos** (170 en `packages/core/src/`, 102 en `docs/revival/`, 1 en `ROADMAP.md`).
  - **Archivos generados, compilaciones y respaldos a excluir (Categoría F):** **3.565 archivos** (~3.2 GB en `open-lens/dist*`, `build.r1-00-backup`, `static/build`, etc.).
- **Total de archivos a consolidar en Git:** **373 archivos** (100 modificados + 273 nuevos).
- **Espacio en disco disponible:** 20 GiB libres en `/System/Volumes/Data`.
- **Estado del índice de Git:** **100% limpio** (ningún archivo en staging, índice intacto).
- **Proceso productivo en ejecución:** PID preservado en `open-lens/dist`, sin interferencia.

---

## 2. Respaldo Actualizado y Checksums

Se generó un respaldo exhaustivo, no destructivo e independiente fuera del repositorio:

- **Directorio de resguardo:** `/Users/gustavomarcon/.openlens-devops-backups/`
- **Archivo comprimido:** `openlens-devops-r1-r2-r3-backup-20261020-consolidation.tar.gz`
  - **Tamaño:** 6.3 MB
  - **Archivos empaquetados:** **373 archivos** (verificado vía `tar -tzf | wc -l`)
  - **SHA-256:** `f648b676df862cb83c354a572c888914f86c4fa9df275b0d4401fc64ab9f8da6`
- **Manifiesto de integridad:** `openlens-devops-r1-r2-r3-backup-20261020-consolidation-manifest.txt`
  - Contiene la lista exhaustiva de los 373 archivos con su checksum SHA-256 individual.
- **Parche unificado completo (Working Tree vs HEAD):** `openlens-devops-r1-r2-r3-diff.patch`
  - **Tamaño:** 398 KB
  - **SHA-256:** Registrado en `openlens-devops-r1-r2-r3-diff.patch.sha256`
- **Respaldo previo de R3-00:** `docs-revival-backup-20261020-r3-00.tar.gz`
  - **SHA-256:** `f4853a4bc5cbac613c9280fa42a8c99e669708b5b3cfc34111f3a06a64cae6aa` (verificado intacto, no sobrescrito).

---

## 3. Clasificación Completa del Working Tree

Los 373 archivos a consolidar y los directorios generados fueron clasificados funcionalmente:

### Categoría A: Código de Release 1 (35 archivos)
*Persistencia segura de Secrets/ConfigMaps, concurrencia, `resourceVersion`, Kubeconfig sync, port-forward y terminal exec.*
- **Modelos y APIs:** `request-patch-kube-resource.injectable.ts`, `request-replace-kube-resource.injectable.ts`, `save-verification.ts`, `inline-resource-save-helper.ts`.
- **Editores e Interfaces:** `config-map-details.*`, `secret-details.*`, `user-templates.injectable.ts`.
- **Operaciones DevOps y Shell:** `kubectl.ts`, `kube-auth-proxy.*`, `shell-api-request.injectable.ts`, `port-forward.*`, `stop-port-forwards-on-quit.*`, `shell-session/*`, `pod-shell-session/*`, `pod-exec-command.*`.
- **Conectividad y Kubeconfig:** `compute-diff.injectable.ts`, `kubeconfig-sync.test.ts`.
- **Entorno y Seguridad:** `user-info.injectable.ts`, `user-info.test.ts`.
- **Suites de Pruebas Unitarias:** 11 suites / 105 tests (`save.test.tsx`, `save.lab-integration.test.tsx`, `secret-details.test.tsx`, etc.).

### Categoría B: Código de Release 2 (69 archivos)
*Identificación visual de entornos, advertencias de producción, Monaco Diff/Revert, logs avanzados con deduplicación y pause, terminal con búsqueda, y exportación CSV con filtros rápidos.*
- **Identidad Visual y Clústeres:** `cluster-appearance-*`, `icon-settings.*`, `is-production-cluster.injectable.ts`, `environment-types.*`, `hotbar-toggle-menu-item.tsx`, `hotbar-entity-icon.*`, `pod-devops-menu.*`.
- **Monaco Diff & Revert:** `monaco-diff-editor.*`, `diff-redaction.*`, `monaco-validators.*`, `diff-and-revert.test.tsx`.
- **Visor de Logs Avanzado:** `dock/logs/store.ts`, `log-buffer-utils.*`, `log-tab-data.validator.ts`, `logs-view-model.*`, `search.*`, `controls.tsx`, `list.*`, `pause-logs.injectable.ts`, `resume-logs.injectable.ts`, `is-logs-paused.injectable.ts`, `get-pending-logs-count.injectable.ts`, `get-logs-truncated-count.injectable.ts`, `get-logs-status.injectable.ts`, `get-logs-error.injectable.ts`, `search-store.*`.
- **Terminal Resiliente y Búsqueda:** `dock/terminal/terminal-search.*`, `terminal-resilience.test.ts`, `create-pod-terminal-tab.*`, `dock-tab.tsx`, `store.ts`, `terminal-window.scss`, `terminal.ts`, `view.tsx`, `terminal-api.ts`.
- **Exportación CSV y Filtros Rápidos:** `csv-builder.*`, `kube-csv-extractor.*`, `kube-quick-filters.*`, `csv-export-dialog.*`.
- **Suites de Pruebas Unitarias:** 17 suites / 118 tests.

### Categoría C: Código de Release 3 (113 archivos)
*Modernización Kubernetes 1.25-1.30+, negociación de API, Gateway API, EndpointSlice, Validating Admission CEL, DRA, GitOps (Argo/Flux), Trivy, Observabilidad (VictoriaMetrics/OpenCost) y Servidor MCP local stdio.*
- **Sub-categoría C.1: Núcleo K8s, CRDs y GitOps (102 archivos):**
  - *Negociación de APIs y Core:* `pod-disruption-budget.api.ts`, `pod-security-policies.tsx`, `service-details.tsx`.
  - *EndpointSlice y Gateway API:* `network-endpoint-slices/*`, `network-gateways/*`, `endpoint-slice.api.*`, `gateway.api.*`, `gateway-class.api.*`, `http-route.api.*`.
  - *CEL Admission y DRA:* `config-validating-admission-policies/*`, `cluster-dra/*`, `validating-admission-policy.api.*`, `validating-admission-policy-binding.api.*`, `resource-dra.api.ts`, `device-class.api.*`, `resource-claim.api.*`.
  - *GitOps (Argo CD y Flux CD):* `renderer/components/gitops/*`, `argocd.api.ts`, `fluxcd.api.ts`, `argo-application.api.*`, `argo-app-project.api.*`, `flux-kustomization.api.*`, `flux-helm-release.api.*`.
  - *Aplicaciones Lógicas, Trivy e Imágenes:* `applications-and-security/*`, `trivy.api.ts`, `vulnerability-report.api.*`, `logical-application.ts`, `container-image.ts`.
  - *Observabilidad y Costos:* `cost-observability/*`, `cost-observability.ts`, `victoria-metrics-provider.injectable.ts`.
  - *Frontend Routes correspondientes:* 12 injectables en `common/front-end-routing/routes/cluster/` (gateways, endpoint-slices, admission, dra, gitops, applications, costs).
  - *Suites de Pruebas Unitarias:* 6 suites / 41 tests (`r3-01` a `r3-06`).
- **Sub-categoría C.2: Servidor MCP Local de Solo Lectura (11 archivos):**
  - *Protocolo JSON-RPC 2.0 y Stdio:* `packages/core/src/main/mcp/mcp-server.ts`, `packages/core/src/main/mcp/bin/mcp-stdio.ts`.
  - *Tipos y Constantes:* `packages/core/src/common/mcp/types.ts`.
  - *Interfaz Gráfica de Preferencias:* `packages/core/src/renderer/components/mcp-settings/*`.
  - *Routing Frontend:* `common/front-end-routing/routes/cluster/config/mcp/*`.
  - *Pruebas Unitarias:* `packages/core/src/main/mcp/__tests__/mcp-server.test.ts` (8 tests).

### Categoría D: Infraestructura Compartida y Monorepo (53 archivos)
*Archivos modificados incrementalmente por múltiples releases o necesarios para la resolución de tipos, compilación y routing general.*
- **Manifiestos y Configuración de Paquetes:** `open-lens/package.json`, `package-lock.json`, `packages/core/package.json`, `packages/kubectl-versions/build/versions.json`, `open-lens/webpack/dev-server.ts`.
- **Núcleo de APIs y Stores Compartidos:** `kube-api.ts`, `kube-api.test.ts`, `kube-object.store.ts` (con retry exponencial de R1 y `@observable lastError` de R3), `kube-object.store.test.ts`, `kube-watch-event.ts`, `kube-helpers.ts`, `kube-helpers.test.ts`, `rbac.ts`, `utils/rbac.ts`, `json-api.ts`.
- **Componentes de Layout Compartidos:** `kube-object-list-layout.tsx` (con Quick Filters/CSV de R2 y avisos 403/404 de R3), `kube-object-list-layout.test.tsx`, snapshots, `sidebar-cluster.tsx` (con bordes de hazard R2 y discovery selectivo R3), `sidebar-cluster.test.tsx`, snapshots, `list-layout.tsx`, `filter-icon.tsx`, `page-filters/store.ts`.
- **Editor y Modelos Compartidos:** `monaco-editor.tsx`, `monaco-editor/index.ts`, `edit-resource/view.tsx`, `edit-resource-model.injectable.tsx`.
- **DI y Variables Compartidas:** `vars.ts`, `bundled-resources-dir.injectable.ts`, `lens-resources-dir.injectable.ts`, `is-packaged-app.injectable.ts`, `is-packaged-app.global-override-for-injectable.ts`, `cluster-connection.injectable.ts`, `update-entity-spec.injectable.ts`, `setup-deep-linking.injectable.ts`, `router.test.ts`, `lens-protocol-router-main.ts`, `show-initial-window.injectable.ts`.

### Categoría E: Documentación, Evidencias y Scripts (103 archivos)
- `ROADMAP.md` (roadmap maestro en la raíz).
- `docs/revival/`:
  - Planes y Catálogos: `ROADMAP_PROVISIONAL.md`, `CATALOG_SCOPE.md`, `FEATURE_CATALOG_FULL.md`, `FEATURE_INVENTORY.md`, `LENS_2026_*.md`, `REA_FINDINGS.md`.
  - Checklists de Ejecución: `R1_IMPLEMENTATION_CHECKLIST.md`, `R2_IMPLEMENTATION_CHECKLIST.md`, `R3_RELEASE_PLAN.md`, `R3_IMPLEMENTATION_CHECKLIST.md`.
  - Informes de Validación Formal: `R1_00_PREFLIGHT.md`, `R1_01_VALIDATION.md` a `R1_06_VALIDATION.md`, `R2_01_VALIDATION.md` a `R2_06_VALIDATION.md`, `R3_00_BASELINE.md`, `R3_01_VALIDATION.md` a `R3_08_VALIDATION.md`.
  - Scripts de Automatización Playwright y Lab: `docs/revival/scripts/*.cjs` (17 scripts).
  - Capturas de Pantalla de Validación con Datos Sintéticos: `docs/revival/screenshots/*.png` (32 capturas) y `docs/revival/evidence/*.png` (7 capturas).

### Categoría F: Archivos que NO Deben Versionarse (~3.2 GB / 3.565 archivos)
- `open-lens/dist/` (745 MB): binario compilado productivo actualmente en ejecución.
- `open-lens/dist-stage/` (847 MB): binario compilado utilizado para verificación de staging.
- `open-lens/dist.r1-00-backup/` (810 MB) y `open-lens/dist.r1-01-baseline/` (744 MB): respaldos históricos de binarios.
- `open-lens/static/build.r1-00-backup/` (95 MB) y `packages/core/static/build.r1-00-backup/` (29 MB): artefactos históricos de webpack.
- `packages/core/static/build/`: artefactos transitorios generados por `npm run build` (se reproducen automáticamente).
- `lens.js.map`: sourcemap generado en raíz.
- `open-lens/.omc/`: caché de sesiones de herramientas de agente.
- `.codegraph/`: índices locales del analizador de código.
- `/Users/gustavomarcon/.openlens-devops-backups/`: respaldos externos en formato `.tar.gz`.

---

## 4. Auditoría de Integridad y Seguridad

1. **Escaneo de Secretos y Credenciales:**
   - Se ejecutó un análisis exhaustivo de patrones de claves privadas (RSA/SSH/EC), tokens JWT, AWS Access Keys y contraseñas.
   - **Resultado:** Cero credenciales reales, tokens ni claves privadas encontradas.
   - Las coincidencias detectadas en la búsqueda de texto (`password`) corresponden exclusivamente a aserciones de pruebas unitarias (`diff-redaction.test.ts`, `kube-csv-extractor.test.ts`, `mcp-server.test.ts`, `save.test.tsx`), cuyo objetivo técnico es precisamente garantizar que los valores de Secret son censurados (`<redacted>`) y nunca expuestos en logs ni CSV.
   - Cero certificados `.pem`, `.key` o kubeconfigs reales en el árbol.
2. **Corrección de la Omisión del Commit R3 Preliminar:**
   - La propuesta inicial formulada al finalizar R3 omitía rutas críticas (`front-end-routing`), injectables de navegación, components compartidos y el lockfile.
   - La nueva clasificación identificó e incorporó las rutas frontend de R3 (`gateways`, `endpoint-slices`, `admission`, `dra`, `gitops`, `applications`, `costs`, `mcp`), garantizando que la navegación sea 100% navegable y reproducible desde Git sin dependencias rotas.
3. **Dependencias Cruzadas entre Releases:**
   - Ciertos archivos base (`kube-object.store.ts`, `kube-object-list-layout.tsx`, `package.json`) contienen modificaciones superpuestas de R1, R2 y R3.
   - Se diseñó la distribución de commits para que las dependencias compartidas se integren en un commit de infraestructura y enlace (`build`), o bien en una secuencia que preserve la atomicidad de compilación.

---

## 5. Plan de Commits Propuesto

Se definen dos estrategias de consolidación: la **Secuencia Semántica de 6 Commits** (siguiendo las prioridades del usuario) y la **Secuencia Foundation-First** (alternativa arquitectónica).

### Secuencia Semántica Recomendada (6 Commits)

```
[HEAD 8838ac3]
       │
       ▼
1. docs(revival): add project roadmap and release validation records (103 archivos)
       │
       ▼
2. feat(core): consolidate R1 kubernetes reliability and safe resource editing (35 archivos)
       │
       ▼
3. feat(ux): consolidate R2 productivity and cluster safety features (69 archivos)
       │
       ▼
4. feat(k8s): consolidate R3 modern APIs and optional integrations (102 archivos)
       │
       ▼
5. feat(mcp): add local read-only MCP server and scoped access (11 archivos)
       │
       ▼
6. build: align dependencies, packaging and shared infrastructure (53 archivos)
```

---

### Detalle de Commits y Comandos Exactos

#### Commit 1: Documentación, Hitos y Evidencias
- **Mensaje:** `docs(revival): add project roadmap and release validation records`
- **Archivos:** 103 archivos (`ROADMAP.md` y todo `docs/revival/`).
- **Comando:**
```bash
git add ROADMAP.md docs/revival/
git commit -m "docs(revival): add project roadmap and release validation records"
```
- **Validación post-commit:** `git status -s docs/revival/` (debe estar limpio).

---

#### Commit 2: Release 1 — Confiabilidad K8s y Edición Segura
- **Mensaje:** `feat(core): consolidate R1 kubernetes reliability and safe resource editing`
- **Archivos:** 35 archivos (detallados en archivo anexo y checklist).
- **Comando:**
```bash
git add \
  packages/core/src/common/vars/user-info.injectable.ts \
  packages/core/src/common/vars/user-info.test.ts \
  packages/core/src/features/cluster/namespaces/edit-namespace-from-new-tab.test.tsx \
  packages/core/src/features/cluster/namespaces/__snapshots__/edit-namespace-from-new-tab.test.tsx.snap \
  packages/core/src/main/__test__/kube-auth-proxy.test.ts \
  packages/core/src/main/catalog-sources/__test__/kubeconfig-sync.test.ts \
  packages/core/src/main/catalog-sources/kubeconfig-sync/compute-diff.injectable.ts \
  packages/core/src/main/kube-auth-proxy/create-kube-auth-proxy.injectable.ts \
  packages/core/src/main/kubectl/kubectl.ts \
  packages/core/src/main/lens-proxy/proxy-functions/shell-api-request.injectable.ts \
  packages/core/src/main/routes/port-forward/functionality/create-port-forward.injectable.ts \
  packages/core/src/main/routes/port-forward/functionality/port-forward.ts \
  packages/core/src/main/routes/port-forward/functionality/port-forward.test.ts \
  packages/core/src/main/routes/port-forward/functionality/stop-port-forwards-on-quit.injectable.ts \
  packages/core/src/main/routes/port-forward/functionality/stop-port-forwards-on-quit.test.ts \
  packages/core/src/main/shell-session/create-shell-session.injectable.ts \
  packages/core/src/main/shell-session/index.ts \
  packages/core/src/main/shell-session/pod-shell-session/open.injectable.ts \
  packages/core/src/main/shell-session/pod-shell-session/pod-shell-session.ts \
  packages/core/src/main/shell-session/pod-shell-session/pod-shell-session.test.ts \
  packages/core/src/renderer/components/config-maps/config-map-details.tsx \
  packages/core/src/renderer/components/config-maps/config-map-details.scss \
  packages/core/src/renderer/components/config-maps/__tests__/config-map-details.test.tsx \
  packages/core/src/renderer/components/config-secrets/secret-details.tsx \
  packages/core/src/renderer/components/config-secrets/secret-details.scss \
  packages/core/src/renderer/components/config-secrets/__tests__/secret-details.test.tsx \
  packages/core/src/renderer/components/dock/create-resource/user-templates.injectable.ts \
  packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/request-patch-kube-resource.injectable.ts \
  packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/request-replace-kube-resource.injectable.ts \
  packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/save-verification.ts \
  packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/save.test.tsx \
  packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/save.lab-integration.test.tsx \
  packages/core/src/renderer/components/kube-object-details/inline-resource-save-helper.ts \
  packages/core/src/renderer/components/workloads-pods/pod-exec-command.ts \
  packages/core/src/renderer/components/workloads-pods/pod-exec-command.test.ts

git commit -m "feat(core): consolidate R1 kubernetes reliability and safe resource editing"
```
- **Validación post-commit:** `npx jest src/renderer/components/dock/edit-resource/edit-resource-model/save.test.tsx` (PASS).

---

#### Commit 3: Release 2 — Productividad DevOps y Seguridad en Clústeres
- **Mensaje:** `feat(ux): consolidate R2 productivity and cluster safety features`
- **Archivos:** 69 archivos (apariencia de clústeres, diff editor, logs, terminal, CSV, quick filters).
- **Comando:**
```bash
git add \
  packages/core/src/common/cluster/environment-types.ts \
  packages/core/src/common/cluster/__tests__/environment-types.test.ts \
  packages/core/src/renderer/api/terminal-api.ts \
  packages/core/src/renderer/components/catalog/hotbar-toggle-menu-item.tsx \
  packages/core/src/renderer/components/cluster-settings/cluster-appearance-picker.tsx \
  packages/core/src/renderer/components/cluster-settings/cluster-appearance-picker.module.scss \
  packages/core/src/renderer/components/cluster-settings/cluster-appearance-dialog.tsx \
  packages/core/src/renderer/components/cluster-settings/icon-settings.tsx \
  packages/core/src/renderer/components/cluster-settings/__tests__/cluster-appearance-picker.test.tsx \
  packages/core/src/renderer/components/cluster-settings/__tests__/icon-settings.test.tsx \
  packages/core/src/renderer/components/cluster-settings/__tests__/__snapshots__/icon-settings.test.tsx.snap \
  packages/core/src/renderer/components/hotbar/hotbar-entity-icon.tsx \
  packages/core/src/renderer/components/hotbar/hotbar-entity-icon.module.scss \
  packages/core/src/renderer/components/kube-object-menu/is-production-cluster.injectable.ts \
  packages/core/src/renderer/components/kube-object-menu/kube-object-menu-items/pod-devops-menu.injectable.ts \
  packages/core/src/renderer/components/kube-object-menu/kube-object-menu.module.scss \
  packages/core/src/renderer/components/workloads-pods/pod-devops-menu.tsx \
  packages/core/src/renderer/components/workloads-pods/pod-devops-menu.test.tsx \
  packages/core/src/renderer/components/monaco-editor/monaco-diff-editor.tsx \
  packages/core/src/renderer/components/monaco-editor/monaco-diff-editor.module.scss \
  packages/core/src/renderer/components/monaco-editor/monaco-validators.ts \
  packages/core/src/renderer/components/monaco-editor/monaco-validators.test.ts \
  packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/diff-and-revert.test.tsx \
  packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/diff-redaction.ts \
  packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/diff-redaction.test.ts \
  packages/core/src/renderer/components/dock/logs/store.ts \
  packages/core/src/renderer/components/dock/logs/tab-store.ts \
  packages/core/src/renderer/components/dock/logs/controls.tsx \
  packages/core/src/renderer/components/dock/logs/list.tsx \
  packages/core/src/renderer/components/dock/logs/list.scss \
  packages/core/src/renderer/components/dock/logs/search.tsx \
  packages/core/src/renderer/components/dock/logs/search.scss \
  packages/core/src/renderer/components/dock/logs/log-buffer-utils.ts \
  packages/core/src/renderer/components/dock/logs/log-buffer-utils.test.ts \
  packages/core/src/renderer/components/dock/logs/log-tab-data.validator.ts \
  packages/core/src/renderer/components/dock/logs/logs-view-model.ts \
  packages/core/src/renderer/components/dock/logs/logs-view-model.injectable.ts \
  packages/core/src/renderer/components/dock/logs/pause-logs.injectable.ts \
  packages/core/src/renderer/components/dock/logs/resume-logs.injectable.ts \
  packages/core/src/renderer/components/dock/logs/is-logs-paused.injectable.ts \
  packages/core/src/renderer/components/dock/logs/get-pending-logs-count.injectable.ts \
  packages/core/src/renderer/components/dock/logs/get-logs-truncated-count.injectable.ts \
  packages/core/src/renderer/components/dock/logs/get-logs-status.injectable.ts \
  packages/core/src/renderer/components/dock/logs/get-logs-error.injectable.ts \
  packages/core/src/renderer/components/dock/logs/__test__/log-store.test.ts \
  packages/core/src/renderer/components/dock/logs/__test__/log-search.test.tsx \
  packages/core/src/renderer/components/dock/logs/__test__/log-resource-selector.test.tsx \
  packages/core/src/renderer/components/dock/terminal/terminal.ts \
  packages/core/src/renderer/components/dock/terminal/view.tsx \
  packages/core/src/renderer/components/dock/terminal/store.ts \
  packages/core/src/renderer/components/dock/terminal/dock-tab.tsx \
  packages/core/src/renderer/components/dock/terminal/terminal-window.scss \
  packages/core/src/renderer/components/dock/terminal/terminal-search.tsx \
  packages/core/src/renderer/components/dock/terminal/terminal-search.scss \
  packages/core/src/renderer/components/dock/terminal/create-pod-terminal-tab.injectable.ts \
  packages/core/src/renderer/components/dock/terminal/create-pod-terminal-tab.test.ts \
  packages/core/src/renderer/components/dock/terminal/__test__/terminal-search.test.tsx \
  packages/core/src/renderer/components/dock/terminal/__test__/terminal-resilience.test.ts \
  packages/core/src/renderer/search-store/search-store.ts \
  packages/core/src/renderer/search-store/search-store.test.ts \
  packages/core/src/renderer/utils/csv/csv-builder.ts \
  packages/core/src/renderer/utils/csv/csv-builder.test.ts \
  packages/core/src/renderer/components/kube-object-list-layout/kube-csv-extractor.ts \
  packages/core/src/renderer/components/kube-object-list-layout/kube-csv-extractor.test.ts \
  packages/core/src/renderer/components/kube-object-list-layout/kube-quick-filters.tsx \
  packages/core/src/renderer/components/kube-object-list-layout/kube-quick-filters.scss \
  packages/core/src/renderer/components/kube-object-list-layout/kube-quick-filters.test.tsx \
  packages/core/src/renderer/components/kube-object-list-layout/csv-export-dialog.tsx \
  packages/core/src/renderer/components/kube-object-list-layout/csv-export-dialog.module.scss

git commit -m "feat(ux): consolidate R2 productivity and cluster safety features"
```
- **Validación post-commit:** `npx jest src/renderer/utils/csv/csv-builder.test.ts src/renderer/components/dock/logs/__test__/log-store.test.ts` (PASS).

---

#### Commit 4: Release 3 — APIs Modernas, CRDs Opcionales y GitOps
- **Mensaje:** `feat(k8s): consolidate R3 modern APIs and optional integrations`
- **Archivos:** 102 archivos (Gateway API, EndpointSlice, CEL, DRA, Argo CD, Flux, Trivy, Costos y frontend routes correspondientes).
- **Comando:**
```bash
git add \
  packages/core/src/common/k8s-api/endpoints/pod-disruption-budget.api.ts \
  packages/core/src/renderer/components/pod-security-policies/pod-security-policies.tsx \
  packages/core/src/renderer/components/network-services/service-details.tsx \
  packages/core/src/common/k8s-api/__tests__/r3-01-api-compatibility.test.ts \
  packages/core/src/common/k8s-api/endpoints/endpoint-slice.api.ts \
  packages/core/src/common/k8s-api/endpoints/endpoint-slice.api.injectable.ts \
  packages/core/src/renderer/components/network-endpoint-slices/ \
  packages/core/src/common/front-end-routing/routes/cluster/network/endpoint-slices/ \
  packages/core/src/common/k8s-api/endpoints/gateway.api.ts \
  packages/core/src/common/k8s-api/endpoints/gateway.api.injectable.ts \
  packages/core/src/common/k8s-api/endpoints/gateway-class.api.injectable.ts \
  packages/core/src/common/k8s-api/endpoints/http-route.api.injectable.ts \
  packages/core/src/renderer/components/network-gateways/ \
  packages/core/src/common/front-end-routing/routes/cluster/network/gateways/ \
  packages/core/src/common/k8s-api/__tests__/r3-02-endpointslices-gateway.test.ts \
  packages/core/src/common/k8s-api/endpoints/validating-admission-policy.api.ts \
  packages/core/src/common/k8s-api/endpoints/validating-admission-policy.api.injectable.ts \
  packages/core/src/common/k8s-api/endpoints/validating-admission-policy-binding.api.injectable.ts \
  packages/core/src/renderer/components/config-validating-admission-policies/ \
  packages/core/src/common/front-end-routing/routes/cluster/config/validating-admission-policies/ \
  packages/core/src/common/k8s-api/endpoints/resource-dra.api.ts \
  packages/core/src/common/k8s-api/endpoints/device-class.api.injectable.ts \
  packages/core/src/common/k8s-api/endpoints/resource-claim.api.injectable.ts \
  packages/core/src/renderer/components/cluster-dra/ \
  packages/core/src/common/front-end-routing/routes/cluster/storage/dra/ \
  packages/core/src/common/k8s-api/__tests__/r3-03-admission-policies-dra.test.ts \
  packages/core/src/common/k8s-api/endpoints/argocd.api.ts \
  packages/core/src/common/k8s-api/endpoints/argo-application.api.injectable.ts \
  packages/core/src/common/k8s-api/endpoints/argo-app-project.api.injectable.ts \
  packages/core/src/common/k8s-api/endpoints/fluxcd.api.ts \
  packages/core/src/common/k8s-api/endpoints/flux-kustomization.api.injectable.ts \
  packages/core/src/common/k8s-api/endpoints/flux-helm-release.api.injectable.ts \
  packages/core/src/renderer/components/gitops/ \
  packages/core/src/common/front-end-routing/routes/cluster/workloads/gitops/ \
  packages/core/src/common/k8s-api/__tests__/r3-04-gitops.test.ts \
  packages/core/src/common/k8s-api/endpoints/logical-application.ts \
  packages/core/src/common/k8s-api/endpoints/container-image.ts \
  packages/core/src/common/k8s-api/endpoints/trivy.api.ts \
  packages/core/src/common/k8s-api/endpoints/vulnerability-report.api.injectable.ts \
  packages/core/src/renderer/components/applications-and-security/ \
  packages/core/src/common/front-end-routing/routes/cluster/workloads/applications/ \
  packages/core/src/common/k8s-api/__tests__/r3-05-apps-trivy.test.ts \
  packages/core/src/main/prometheus/victoria-metrics-provider.injectable.ts \
  packages/core/src/common/k8s-api/endpoints/cost-observability.ts \
  packages/core/src/renderer/components/cost-observability/ \
  packages/core/src/common/front-end-routing/routes/cluster/costs/ \
  packages/core/src/common/k8s-api/__tests__/r3-06-metrics-cost.test.ts

git commit -m "feat(k8s): consolidate R3 modern APIs and optional integrations"
```
- **Validación post-commit:** `npx jest src/common/k8s-api/__tests__/r3-0*.test.ts` (PASS).

---

#### Commit 5: Release 3 — Servidor MCP Local de Solo Lectura
- **Mensaje:** `feat(mcp): add local read-only MCP server and scoped access`
- **Archivos:** 11 archivos (protocolo stdio, denegación -32001, GUI `/mcp`).
- **Comando:**
```bash
git add \
  packages/core/src/common/mcp/types.ts \
  packages/core/src/main/mcp/mcp-server.ts \
  packages/core/src/main/mcp/bin/mcp-stdio.ts \
  packages/core/src/main/mcp/__tests__/mcp-server.test.ts \
  packages/core/src/renderer/components/mcp-settings/ \
  packages/core/src/common/front-end-routing/routes/cluster/config/mcp/

git commit -m "feat(mcp): add local read-only MCP server and scoped access"
```
- **Validación post-commit:** `npx jest src/main/mcp/__tests__/mcp-server.test.ts` (PASS).

---

#### Commit 6: Infraestructura Compartida, Dependencias y Build
- **Mensaje:** `build: align dependencies, packaging and shared infrastructure`
- **Archivos:** 53 archivos (manifestos de paquetes, lockfiles, stores compartidos, layout core).
- **Comando:**
```bash
git add \
  open-lens/package.json \
  open-lens/src/renderer/index.ts \
  open-lens/webpack/dev-server.ts \
  package-lock.json \
  packages/core/package.json \
  packages/kubectl-versions/build/versions.json \
  packages/utility-features/json-api/src/json-api.ts \
  packages/core/src/common/cluster-types.ts \
  packages/core/src/common/kube-helpers.ts \
  packages/core/src/common/__tests__/kube-helpers.test.ts \
  packages/core/src/common/rbac.ts \
  packages/core/src/common/vars.ts \
  packages/core/src/common/vars/bundled-resources-dir.injectable.ts \
  packages/core/src/common/vars/lens-resources-dir.injectable.ts \
  packages/core/src/common/vars/is-packaged-app.injectable.ts \
  packages/core/src/common/vars/is-packaged-app.global-override-for-injectable.ts \
  packages/core/src/common/k8s-api/kube-api.ts \
  packages/core/src/common/k8s-api/kube-watch-event.ts \
  packages/core/src/common/k8s-api/kube-object.store.ts \
  packages/core/src/common/k8s-api/__tests__/kube-api.test.ts \
  packages/core/src/common/k8s-api/__tests__/kube-object.store.test.ts \
  packages/core/src/extensions/extension-discovery/extension-discovery.ts \
  packages/core/src/extensions/extension-discovery/extension-discovery.test.ts \
  packages/core/src/features/pod-logs/__snapshots__/download-logs.test.tsx.snap \
  packages/core/src/features/user-preferences/common/preferences-helpers.ts \
  packages/core/src/main/cluster/cluster-connection.injectable.ts \
  packages/core/src/main/cluster/update-entity-spec.injectable.ts \
  packages/core/src/main/cluster/update-entity-spec.test.ts \
  packages/core/src/main/electron-app/runnables/setup-deep-linking.injectable.ts \
  packages/core/src/main/protocol-handler/lens-protocol-router-main/lens-protocol-router-main.ts \
  packages/core/src/main/protocol-handler/__test__/router.test.ts \
  packages/core/src/main/start-main-application/runnables/show-initial-window.injectable.ts \
  packages/core/src/renderer/utils/rbac.ts \
  packages/core/src/renderer/components/item-object-list/filter-icon.tsx \
  packages/core/src/renderer/components/item-object-list/list-layout.tsx \
  packages/core/src/renderer/components/item-object-list/page-filters/store.ts \
  packages/core/src/renderer/components/kube-object-list-layout/kube-object-list-layout.tsx \
  packages/core/src/renderer/components/kube-object-list-layout/kube-object-list-layout.test.tsx \
  packages/core/src/renderer/components/kube-object-list-layout/__snapshots__/kube-object-list-layout.test.tsx.snap \
  packages/core/src/renderer/components/kube-object-menu/kube-object-menu.tsx \
  packages/core/src/renderer/components/kube-object-menu/kube-object-menu.test.tsx \
  packages/core/src/renderer/components/layout/sidebar-cluster.tsx \
  packages/core/src/renderer/components/layout/sidebar-cluster.module.scss \
  packages/core/src/renderer/components/layout/__tests__/sidebar-cluster.test.tsx \
  packages/core/src/renderer/components/layout/__tests__/__snapshots__/sidebar-cluster.test.tsx.snap \
  packages/core/src/renderer/components/menu/menu-actions.scss \
  packages/core/src/renderer/components/monaco-editor/index.ts \
  packages/core/src/renderer/components/monaco-editor/monaco-editor.tsx \
  packages/core/src/renderer/components/monaco-editor/__mocks__/monaco-editor.tsx \
  packages/core/src/renderer/components/dock/edit-resource/view.tsx \
  packages/core/src/renderer/components/dock/edit-resource/view.test.tsx \
  packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/edit-resource-model.injectable.tsx \
  packages/core/src/renderer/components/workloads-pods/pod-details-container.tsx

git commit -m "build: align dependencies, packaging and shared infrastructure"
```
- **Validación final:** `git status` (debe reportar 0 modificados tracked y solo los artefactos de la Categoría F en untracked).

---

## 6. Reproducibilidad y Criterios de Validación

Una vez ejecutados los commits, el repositorio debe permitir reproducir integralmente el producto:

1. **Herramientas base requeridas:** Node.js `v20.20.2`, npm `10.8.2`, macOS ARM64.
2. **Instalación limpia:** `npm install` (sin discrepancias de lockfile).
3. **Verificación TypeScript:** `npx tsc -p packages/core/tsconfig.json --noEmit` (0 errores).
4. **Compilación completa:** `npm run build` (40 proyectos exitosos).
5. **Regresión completa:** 35 suites / 272 tests aprobados al 100%.
6. **Empaquetado aislado:** `npx electron-builder --mac dir --arm64 -c.directories.output=dist-stage` generando `OpenLens DevOps.app` funcional con SHA-256 idéntico.

---

## 7. Instrucciones de Recuperación ante Errores (Rollback)

Si durante la ejecución de los commits se produce algún conflicto o error humano:

1. **Restaurar el índice sin tocar los archivos de trabajo:**
   ```bash
   git reset HEAD
   ```
2. **Comprobar la integridad del working tree contra el respaldo:**
   ```bash
   diff -u <(git status --porcelain) <(cat /Users/gustavomarcon/.openlens-devops-backups/openlens-devops-r1-r2-r3-backup-20261020-consolidation-manifest.txt | awk '{print $2}')
   ```
3. **En caso de pérdida accidental de algún archivo:**
   ```bash
   tar -xzf /Users/gustavomarcon/.openlens-devops-backups/openlens-devops-r1-r2-r3-backup-20261020-consolidation.tar.gz <ruta_del_archivo>
   ```
4. **Para recomponer el working tree original completo en un directorio nuevo:**
   ```bash
   tar -xzf /Users/gustavomarcon/.openlens-devops-backups/openlens-devops-r1-r2-r3-backup-20261020-consolidation.tar.gz -C <destino>
   ```
