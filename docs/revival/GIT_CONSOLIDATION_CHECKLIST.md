# OpenLens DevOps Revival — Checklist de Consolidación Git (R1–R3)

**Documento Operativo de Verificación y Ejecución de Commits**  
**Fecha:** 20 de Octubre de 2026  
**Especificación:** [`GIT_CONSOLIDATION_PLAN.md`](./GIT_CONSOLIDATION_PLAN.md)  
**Estado:** AUDITORÍA COMPLETADA; PENDIENTE DE AUTORIZACIÓN PARA EJECUCIÓN.

---

## 1. Fase Previa: Verificación y Resguardo (COMPLETADA)

- [x] **Verificación de HEAD:** Rama `feat/openlens-devops-revival`, HEAD en `8838ac308bf4cc70a9911f7cdbc28e919f83fb2a`.
- [x] **Inventario de Working Tree:** 100 archivos tracked modificados, 273 archivos nuevos a versionar (373 archivos totales a consolidar).
- [x] **Espacio en disco:** 20 GiB disponibles en el volumen principal.
- [x] **Generación de Respaldo Externo Completo:**
  - Archivo: `/Users/gustavomarcon/.openlens-devops-backups/openlens-devops-r1-r2-r3-backup-20261020-consolidation.tar.gz` (6.3 MB).
  - Manifiesto: `openlens-devops-r1-r2-r3-backup-20261020-consolidation-manifest.txt` (373 entradas).
  - Checksum SHA-256: `f648b676df862cb83c354a572c888914f86c4fa9df275b0d4401fc64ab9f8da6`.
  - Integridad verificada (`tar -tzf | wc -l` devolvió exactamente 373 archivos).
- [x] **Parche Unificado Generado:** `openlens-devops-r1-r2-r3-diff.patch` (398 KB).
- [x] **Auditoría de Seguridad y Secretos:** Cero credenciales reales, tokens ni claves privadas en el árbol.
- [x] **Protección Operativa:** Instancia en ejecución en `open-lens/dist` intacta (PID preservado).
- [x] **Índice de Git Limpio:** Cero archivos en staging previo (`git status -s` sin `[MADRCU]`).

---

## 2. Fase de Ejecución: Secuencia de Commits (A Ejecutar Tras Autorización)

### Paso 1: Commit 1 — Documentación, Hitos y Evidencias
- [ ] Ejecutar comando de staging:
  ```bash
  git add ROADMAP.md docs/revival/
  ```
- [ ] Verificar que solo se añadieron 103 archivos de documentación:
  ```bash
  git diff --cached --name-only | wc -l # Debe ser 103
  ```
- [ ] Ejecutar commit:
  ```bash
  git commit -m "docs(revival): add project roadmap and release validation records"
  ```
- [ ] Verificación post-commit: `git status -s docs/revival/` limpio.

---

### Paso 2: Commit 2 — Release 1: Confiabilidad K8s y Edición Segura
- [ ] Ejecutar comando de staging selectivo para los 35 archivos de R1:
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
  ```
- [ ] Verificar 35 archivos en staging: `git diff --cached --name-only | wc -l`.
- [ ] Ejecutar commit:
  ```bash
  git commit -m "feat(core): consolidate R1 kubernetes reliability and safe resource editing"
  ```
- [ ] Validar pruebas R1:
  ```bash
  cd packages/core && npx jest src/renderer/components/dock/edit-resource/edit-resource-model/save.test.tsx
  ```

---

### Paso 3: Commit 3 — Release 2: Productividad DevOps y Seguridad en Clústeres
- [ ] Ejecutar comando de staging para los 69 archivos de R2:
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
  ```
- [ ] Verificar 69 archivos en staging: `git diff --cached --name-only | wc -l`.
- [ ] Ejecutar commit:
  ```bash
  git commit -m "feat(ux): consolidate R2 productivity and cluster safety features"
  ```
- [ ] Validar pruebas R2:
  ```bash
  cd packages/core && npx jest src/renderer/utils/csv/csv-builder.test.ts
  ```

---

### Paso 4: Commit 4 — Release 3: APIs Modernas, CRDs Opcionales y GitOps
- [ ] Ejecutar comando de staging para los 102 archivos de R3:
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
  ```
- [ ] Verificar 102 archivos en staging: `git diff --cached --name-only | wc -l`.
- [ ] Ejecutar commit:
  ```bash
  git commit -m "feat(k8s): consolidate R3 modern APIs and optional integrations"
  ```
- [ ] Validar pruebas R3:
  ```bash
  cd packages/core && npx jest src/common/k8s-api/__tests__/r3-0*.test.ts
  ```

---

### Paso 5: Commit 5 — Release 3: Servidor MCP Local de Solo Lectura
- [ ] Ejecutar comando de staging para los 11 archivos de MCP:
  ```bash
  git add \
    packages/core/src/common/mcp/types.ts \
    packages/core/src/main/mcp/mcp-server.ts \
    packages/core/src/main/mcp/bin/mcp-stdio.ts \
    packages/core/src/main/mcp/__tests__/mcp-server.test.ts \
    packages/core/src/renderer/components/mcp-settings/ \
    packages/core/src/common/front-end-routing/routes/cluster/config/mcp/
  ```
- [ ] Verificar 11 archivos en staging: `git diff --cached --name-only | wc -l`.
- [ ] Ejecutar commit:
  ```bash
  git commit -m "feat(mcp): add local read-only MCP server and scoped access"
  ```
- [ ] Validar pruebas MCP:
  ```bash
  cd packages/core && npx jest src/main/mcp/__tests__/mcp-server.test.ts
  ```

---

### Paso 6: Commit 6 — Infraestructura Compartida, Dependencias y Build
- [ ] Ejecutar comando de staging para los 53 archivos restantes:
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
  ```
- [ ] Verificar 53 archivos en staging: `git diff --cached --name-only | wc -l`.
- [ ] Ejecutar commit:
  ```bash
  git commit -m "build: align dependencies, packaging and shared infrastructure"
  ```

---

## 3. Fase Final de Certificación Post-Consolidación

- [ ] **Verificación de Working Tree:**
  ```bash
  git status -uno
  ```
  Debe mostrar `nothing to commit, working tree clean`.
- [ ] **Verificación de Untracked:** Solo deben figurar los artefactos de la Categoría F (dist, build backups, etc.):
  ```bash
  git status -s | grep -v '^\?\? open-lens/dist' | grep -v '^\?\? packages/core/static/build.r1' | grep -v '^\?\? open-lens/static/build.r1' | grep -v '^\?\? open-lens/\.omc' | grep -v '^\?\? lens\.js\.map' | grep -v '^\?\? \.codegraph'
  ```
  (Debe estar 100% vacío).
- [ ] **Typecheck TypeScript:**
  ```bash
  npx tsc -p packages/core/tsconfig.json --noEmit
  ```
  (0 errores, exit code 0).
- [ ] **Compilación Monorepo:**
  ```bash
  npm run build
  ```
  (40 proyectos compilados exitosamente).
- [ ] **Regresión Integral (272 tests / 35 suites):**
  ```bash
  cd packages/core && npx jest \
    src/common/k8s-api/__tests__/r3-01-api-compatibility.test.ts \
    src/common/k8s-api/__tests__/r3-02-endpointslices-gateway.test.ts \
    src/common/k8s-api/__tests__/r3-03-admission-policies-dra.test.ts \
    src/common/k8s-api/__tests__/r3-04-gitops.test.ts \
    src/common/k8s-api/__tests__/r3-05-apps-trivy.test.ts \
    src/common/k8s-api/__tests__/r3-06-metrics-cost.test.ts \
    src/main/mcp/__tests__/mcp-server.test.ts \
    src/renderer/utils/csv/csv-builder.test.ts \
    src/renderer/components/kube-object-list-layout/kube-csv-extractor.test.ts \
    src/renderer/components/kube-object-list-layout/kube-quick-filters.test.tsx \
    src/renderer/components/kube-object-list-layout/kube-object-list-layout.test.tsx \
    src/renderer/components/dock/terminal/__test__/terminal-search.test.tsx \
    src/renderer/components/dock/terminal/__test__/terminal-resilience.test.ts \
    src/renderer/components/dock/terminal/create-pod-terminal-tab.test.ts \
    src/renderer/components/dock/logs/log-buffer-utils.test.ts \
    src/renderer/components/dock/logs/__test__/log-store.test.ts \
    src/renderer/components/dock/logs/__test__/log-search.test.tsx \
    src/renderer/search-store/search-store.test.ts \
    src/renderer/components/dock/logs/__test__/log-resource-selector.test.tsx \
    src/renderer/components/dock/edit-resource/edit-resource-model/diff-and-revert.test.tsx \
    src/renderer/components/dock/edit-resource/edit-resource-model/diff-redaction.test.ts \
    src/renderer/components/monaco-editor/monaco-validators.test.ts \
    src/renderer/components/cluster-settings/__tests__/cluster-appearance-picker.test.tsx \
    src/renderer/components/cluster-settings/__tests__/icon-settings.test.tsx \
    src/common/k8s-api/__tests__/kube-api.test.ts \
    src/common/k8s-api/__tests__/kube-object.store.test.ts \
    src/renderer/components/dock/edit-resource/edit-resource-model/save.test.tsx \
    src/renderer/components/config-secrets/__tests__/secret-details.test.tsx \
    src/renderer/components/config-maps/__tests__/config-map-details.test.tsx \
    src/main/catalog-sources/__test__/kubeconfig-sync.test.ts \
    src/main/routes/port-forward/functionality/port-forward.test.ts \
    src/main/routes/port-forward/functionality/stop-port-forwards-on-quit.test.ts \
    src/renderer/components/workloads-pods/pod-devops-menu.test.tsx \
    src/renderer/components/workloads-pods/pod-exec-command.test.ts \
    src/common/vars/user-info.test.ts
  ```
  (100% PASS, 272/272 aprobados).
- [ ] **Hash de Verificación del Binario:**
  ```bash
  shasum -a 256 "open-lens/dist-stage/mac-arm64/OpenLens DevOps.app/Contents/Resources/app.asar"
  ```
  (Debe coincidir con `6ada0eeffa15a86a1daa88a057a93de6f65b9470afcb3fa4c9d2d8e48ea9a870`).
