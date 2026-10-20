# OpenLens DevOps Revival — R2-02 Validation Report
**Editor avanzado: Monaco Split Diff, Revert seguro y validación YAML**

- **Fecha:** 19 de Octubre de 2026
- **Rama:** `feat/openlens-devops-revival`
- **Ambiente de compilación:** Node.js v20.20.2 / npm v10.8.2 / macOS ARM64 (Darwin 27.0.0)
- **Hash / Binario empaquetado:** `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`
- **Estado de salida:** APROBADO (58 tests de editor y concurrencia + 5 tests de vista de componentes + 39 tests de R2-01 + Playwright GUI en empaquetado aislado)

---

## 1. Resumen de Implementación

En el marco del Hito **R2-02**, se implementaron las siguientes capacidades clave en el editor de recursos Kubernetes de OpenLens DevOps (`packages/core`):

### A. Monaco Split Diff (`MonacoDiffEditor`)
- **Componente dedicado:** Implementación de `MonacoDiffEditor` (`packages/core/src/renderer/components/monaco-editor/monaco-diff-editor.tsx`) sobre `monaco.editor.createDiffEditor`, con reactividad MobX al tema activo (`LensTheme`), opciones de usuario y `ResizeObserver` para layout automático.
- **Modos de visualización:**
  1. `Editor`: Vista clásica de editor individual.
  2. `Diff (Original)`: Comparación lado a lado entre el borrador originalmente cargado (`firstDraft`) y el borrador local actual (`draft`).
  3. `Diff (Live)`: Comparación lado a lado entre la versión remota viva del clúster (`remoteClusterResource`) y el borrador local actual.
- **Preservación de estado:** Al alternar entre el editor normal y las vistas diff, el borrador y la posición se preservan intactos sin reinicializar el modelo ni perder cambios no guardados.
- **Títulos contextuales:** Cabecera con indicación clara de cada panel, `resourceVersion` del original y del clúster, y marcas de advertencia cuando la versión remota difiere (`[MODIFIED ON CLUSTER]` vs `[in sync with loaded]`).
- **Edición en Diff:** Para recursos estándar (ConfigMaps, Deployments, Pods, CRDs), el panel derecho del split diff es editable y sus modificaciones se propagan en tiempo real al borrador local.

### B. Revert y Reload Seguros
- **Revert to Original (`revertToOriginal`):** Acción explícita para descartar todas las modificaciones locales y regresar a `firstDraft`. Si hay cambios no guardados (`hasUnsavedChanges`), requiere confirmación mediante el diálogo nativo de confirmación (`ConfirmDialog`). Si el usuario cancela, el borrador se mantiene intacto.
- **Reload from Cluster (`reloadFromCluster`):** Acción explícita para consultar el API server de Kubernetes y recargar la última versión del recurso. Si hay cambios no guardados, exige confirmación previa.
- **Protección de edición activa:** Las consultas en segundo plano y las lecturas remotas fallidas nunca sobrescriben el borrador local.
- **Deshabilitación de Guardado:** Durante operaciones asíncronas de recarga o revert, el botón *Save* permanece deshabilitado (`isBusy`).

### C. Validación YAML Mejorada (`monaco-validators.ts`)
- **Detección sintáctica precisa:** `validateYamlSyntax` extrae línea exacta, columna y mensaje de error de `js-yaml.YAMLException`.
- **Marcadores nativos en Monaco:** `MonacoEditor` aplica marcadores de error (`editor.setModelMarkers`) con subrayado rojo y tooltips en la línea y columna exactas, y limpia los marcadores automáticamente cuando el YAML es válido.
- **Validación de forma Kubernetes:** `validateKubernetesResourceYaml` valida:
  - Documento único (rechaza documentos múltiples separados por `---`).
  - No vacío ni compuesto únicamente de comentarios/espacios.
  - Campos obligatorios: `apiVersion`, `kind`, `metadata`, `metadata.name`.
- **Bloqueo preventivo de guardado:** `save()` valida el YAML antes de interactuar con el cluster, cancelando la operación y emitiendo notificación si el manifiesto es inválido. La interfaz `InfoPanel` deshabilita el botón *Save* cuando hay errores de validación.

### D. Seguridad en Secrets y ConfigMaps (Requisito D)
- **Sanitización estricta (`diff-redaction.ts`):** En recursos de tipo `Secret`, los valores en `data` (base64) y `stringData` (texto plano) **nunca se exponen** en diffs, logs o snapshots.
- **Indicadores sin fuga:** Las claves modificadas se marcan como `<redacted (modified)>`, las nuevas como `<redacted (new)>` y las idénticas como `<redacted>`, permitiendo auditar cambios estructurales sin exponer secretos.
- **Protección de sobreescritura:** En diffs de tipo `Secret`, el panel modificado es de solo lectura (`readOnlyModified: true`), impidiendo que el usuario guarde inadvertidamente cadenas redactadas en el Secret.
- **ConfigMaps:** Permite la comparación directa de valores de configuración no confidenciales.

---

## 2. Registro de Pruebas Unitarias y de Integración

Se ejecutaron con éxito 8 suites de prueba que cubren 63 pruebas automáticas:

| Suite de Pruebas | Archivo | Pruebas | Resultado |
|---|---|:---:|:---:|
| **YAML Syntax & K8s Shape** | `monaco-validators.test.ts` | 10 | PASS |
| **Secret Redaction for Diff** | `diff-redaction.test.ts` | 3 | PASS |
| **Diff & Revert Lifecycle** | `diff-and-revert.test.tsx` | 10 | PASS |
| **EditResource View Controls** | `view.test.tsx` | 5 | PASS |
| **Save & Concurrency** | `save.test.tsx` | 20 | PASS |
| **Lab API Integration** | `save.lab-integration.test.tsx` | 6 | PASS |
| **ConfigMap Concurrency** | `config-map-details.test.tsx` | 3 | PASS |
| **Secret Details Safety** | `secret-details.test.tsx` | 6 | PASS |
| **Total R2-02 & Regresiones** | — | **63** | **100% PASS** |

Adicionalmente, las 5 suites de R2-01 (39 pruebas: `cluster-appearance-picker.test.tsx`, `icon-settings.test.tsx`, `sidebar-cluster.test.tsx`, `kube-object-menu.test.tsx`, `pod-devops-menu.test.tsx`) pasaron al 100%.

---

## 3. Compilación y Empaquetado

1. **Typecheck TypeScript:**
   - Comando: `npx tsc -p packages/core/tsconfig.json --noEmit`
   - Resultado: 0 errores.
2. **Compilación de paquetes:**
   - Comando: `npm run build`
   - Resultado: 40 proyectos compilados exitosamente mediante Lerna/Nx. Bundles `lens.js`, `lens.css`, assets y binarios generados en `open-lens/static/build`.
3. **Empaquetado macOS ARM64:**
   - Destino: `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`
   - Parámetros: `CSC_IDENTITY_AUTO_DISCOVERY=false`, firma ad-hoc sin publicación.
   - Seguridad de proceso: La instancia en ejecución de `open-lens/dist` (PID 80825) se mantuvo intacta y protegida.

---

## 4. Verificación Automatizada con Playwright

- **Script:** `docs/revival/scripts/verify-r2-02.cjs`
- **Ambiente:** macOS ARM64, `HOME` y `CICD` aislados en `/tmp/openlens-r2-02-safe-*`, `KUBECONFIG=/dev/null`.
- **Resultados:**
  - `name`: "OpenLens DevOps"
  - `isPackaged`: `true`
  - URL de renderer: `https://lens.app:59708/`
  - Pantalla principal y catálogo cargados correctamente.
  - Captura de pantalla generada: [`docs/revival/screenshots/r2-02-packaged-app-running.png`](./screenshots/r2-02-packaged-app-running.png) (sin datos sensibles).

---

## 5. Criterios de Aceptación Cumplidos

- [x] Monaco Split Diff integrado con selector de modo ("Editor", "Diff (Original)", "Diff (Live)").
- [x] Acciones explícitas de Revert y Reload con confirmación obligatoria si hay cambios sucios.
- [x] Validación YAML previa al guardado (sintaxis, línea/columna, marcadores Monaco, rechazo de multi-documentos y campos requeridos).
- [x] Protección de Secretos en diffs (redacción de `data` y `stringData`, vista read-only para Secrets en diff).
- [x] Controles visuales intuitivos con badges "In Sync" y "Unsaved Changes" acordes a la identidad R2-01.
- [x] Typecheck limpio, build monorepo aprobado, empaquetado `dist-stage` y smoke Playwright verificado.
