# OpenLens DevOps Revival — R2-05 Validation Report
**Exportación segura a CSV y filtros rápidos de listas Kubernetes**

- **Fecha:** 20 de Octubre de 2026
- **Rama:** `feat/openlens-devops-revival`
- **Ambiente de compilación:** Node.js v20.20.2 / npm v10.8.2 / macOS ARM64 (Darwin 27.0.0)
- **Hash / Binario empaquetado:** `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app` (SHA256: `6f38b34a9eaf6cfa8b55ed0c24f0afeb31bfb32b1c0336c96c98ae0f3612b075`)
- **Estado de salida:** APROBADO (26 tests de CSV y filtros rápidos + 44 tests de regresión previa + Verificación Playwright en paquete aislado con captura de pantalla y neutralización de inyección comprobada)

---

## 1. Resumen de Implementación

En el marco del Hito **R2-05**, se implementó el motor de exportación segura a formato CSV y la barra de filtros contextuales rápidos para tablas y listas de recursos Kubernetes en OpenLens DevOps:

### A. Motor de Exportación Segura a CSV (`csv-builder.ts`)
- **Defensa contra CSV Formula Injection (DDE Injection):**
  - Todo valor que comience con caracteres de ejecución de fórmulas de hojas de cálculo (`=`, `+`, `-`, `@`, `|`, `%`) —incluso si vienen precedidos por espacios en blanco o caracteres de control (`\t`, `\r`, `\n`)— es automáticamente neutralizado anteponiendo una comilla simple (`'`).
  - Previene ejecución remota de comandos o robo de datos al abrir reportes exportados en Microsoft Excel, LibreOffice Calc o Google Sheets.
- **Escape RFC 4180 y Codificación UTF-8:**
  - Valores con comas, comillas dobles, saltos de línea o comillas simples de sanitización son encapsulados entre comillas dobles (`"..."`), duplicando las comillas internas (`""`).
  - Incorporación de BOM UTF-8 (`\uFEFF`) al inicio del archivo para garantizar compatibilidad con caracteres multilingües y acentos en Excel sin corrupción de codificación.
  - Generación de nombres de archivo canónicos basados en clúster, tipo de recurso y marca temporal ISO: `<cluster>-<resource>-YYYY-MM-DD-HHmm.csv`.

### B. Extracción Semántica y Protección Estricta de Secrets (`kube-csv-extractor.ts`)
- **Extracción de datos en memoria sin Scraping de DOM:**
  - Los datos se obtienen directamente de los objetos y modelos de la tabla en memoria (`KubeObject` y `ItemObjectList`), garantizando la exportación de **todas** las filas filtradas, incluidas aquellas no renderizadas por la virtualización (`VirtualList`).
  - Se respeta rigurosamente la visibilidad de columnas (`isTableColumnHidden`) y el ordenamiento actual.
- **Protección de Datos Sensibles (Secrets Allowlist):**
  - Para recursos de tipo `Secret`, se aplica una lista blanca estricta (`SECRET_ALLOWED_COLUMN_IDS` = `['name', 'namespace', 'type', 'keys', 'age', 'labels']`).
  - Se bloquea e ignora terminantemente cualquier intento de exportar campos como `data`, `stringData`, tokens de ServiceAccount o contraseñas, permitiendo únicamente nombres de llaves o conteos seguros.

### C. Filtros Rápidos Contextuales (`KubeQuickFilters`)
- **Chips reactivos por estado:**
  - Detección automática y reactiva de los estados presentes en los recursos visibles (`Running`, `Pending`, `Failed`, `CrashLoopBackOff`, `Succeeded`, etc.) con conteo dinámico (`Running (3)`).
  - Al pulsar un chip, se activa un filtro de tipo `STATUS` en `ItemObjectList`, actualizando inmediatamente la vista y reflejándose en las insignias de filtrado.
- **Filtro rápido por Labels:**
  - Input contextual integrado con validación de sintaxis (`key=value` o `key`), filtrando los recursos en tiempo real.
- **Limpieza y acción directa:**
  - Botón de limpieza rápida de filtros activos (`Clear filters`) que restaura la visualización completa.
  - Botón de exportación `Export CSV` integrado en la barra de filtros y en la cabecera de la lista.

### D. Diálogo Modal de Exportación (`CsvExportDialog`)
- **Confirmación y resumen antes de descargar:**
  - Exhibe clúster activo, tipo de recurso Kubernetes, conteo de filas a exportar y listado de columnas visibles que formarán parte del reporte.
  - Descarga limpia mediante objeto `Blob` y enlace de descarga sintético en el navegador.

---

## 2. Registro de Pruebas Unitarias

Se ejecutaron con éxito todas las pruebas unitarias de exportación CSV, extracción semántica y filtros rápidos:

| Suite de Pruebas | Archivo | Pruebas | Resultado |
|---|---|:---:|:---:|
| **CSV Builder & Formula Injection** | `csv-builder.test.ts` | 16 | PASS |
| **Kube CSV Extractor & Allowlist** | `kube-csv-extractor.test.ts` | 3 | PASS |
| **Kube Quick Filters Toolbar** | `kube-quick-filters.test.tsx` | 3 | PASS |
| **Kube Object List Layout Integration** | `kube-object-list-layout.test.tsx` | 4 | PASS |
| **Total R2-05 Suite** | — | **26** | **100% PASS** |

### Pruebas de Regresión R1 y R2
- `terminal-search` + `terminal-resilience` + `create-pod-terminal-tab`: 100% PASS (12 tests)
- `dock/logs` (5 suites): 100% PASS (31 tests)
- `diff-and-revert` + `diff-redaction` + `monaco-validators`: 100% PASS (13 tests)
- `sidebar-cluster` + `cluster-appearance-picker` + `pod-devops-menu`: 100% PASS (15 tests)

---

## 3. Compilación y Empaquetado

1. **Typecheck TypeScript:**
   - Comando: `npx tsc -p packages/core/tsconfig.json --noEmit`
   - Resultado: 0 errores.
2. **Compilación Lerna/Nx:**
   - Comando: `npm run build`
   - Resultado: 40 proyectos compilados exitosamente (código de salida 0).
3. **Empaquetado macOS ARM64:**
   - Destino: `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app`
   - SHA-256 binario: `6f38b34a9eaf6cfa8b55ed0c24f0afeb31bfb32b1c0336c96c98ae0f3612b075`.
   - Protección de proceso: PID 80825 (`open-lens/dist`) protegido sin interferencias.

---

## 4. Verificación Automatizada con Playwright en Paquete Real

- **Script:** `docs/revival/scripts/verify-r2-05-tables.cjs`
- **Ambiente:** macOS ARM64, `HOME` aislado en `/tmp/openlens-r2-05-tables-*`, `KUBECONFIG=/dev/null`.
- **Ejecución y Resultados:**
  1. Lanzamiento de la aplicación empaquetada real `OpenLens DevOps.app` (`isPackaged: true`).
  2. Montaje de la tabla real de Kubernetes con 5 Pods sintéticos (incluyendo pods con nombres maliciosos para prueba de inyección).
  3. Comprobación de chips de estado: `Running (3)`, `Pending (1)`, `Failed (1)` renderizados y activos.
  4. Interacción con chip `Pending`: filtrado reactivo validado.
  5. Apertura del diálogo `CsvExportDialog`: columnas y conteo de filas verificados.
  6. Captura y descarga del archivo CSV exportado:
     ```csv
     Age,Containers,Name,Namespace,Node,Controlled By,QoS,Restarts,Status
     2h,1,nginx-frontend,default,worker-node-1,,BestEffort,0,Running
     45m,1,redis-cache,default,worker-node-2,,BestEffort,0,Pending
     5d,1,auth-api-service,prod,worker-node-1,,BestEffort,2,Running
     10m,1,batch-worker-job,dev,worker-node-3,,BestEffort,5,Failed
     1m,1,"'=1+1-evil-pod",dev,worker-node-1,,BestEffort,0,Running
     ```
  7. **Comprobación de Seguridad de Fórmulas:**
     - El Pod malicioso `=1+1-evil-pod` fue neutralizado con comilla simple: `"'=1+1-evil-pod"`.
     - Inyección DDE neutralizada con éxito.
  8. **Capturas de pantalla generadas:**
     - [`docs/revival/screenshots/r2-05-table-quick-filters.png`](./screenshots/r2-05-table-quick-filters.png): Vista de tabla Kubernetes con chips de filtrado rápido y botón de exportación CSV.
     - [`docs/revival/screenshots/r2-05-csv-export-dialog.png`](./screenshots/r2-05-csv-export-dialog.png): Diálogo de confirmación y selección de exportación CSV.

---

## 5. Criterios de Aceptación Cumplidos

- [x] Botón `Export CSV` disponible en tablas y listas Kubernetes.
- [x] Exportación de filas completas en memoria respetando filtros y ordenamiento activo, sin depender de la virtualización del DOM.
- [x] Sanitización estricta contra CSV Formula Injection (`=`, `+`, `-`, `@`, `|`, `%` y caracteres de control precedentes).
- [x] Protección de Secrets: exclusión total de `data` y `stringData`; sólo metadatos seguros permitidos.
- [x] Codificación UTF-8 con BOM y formato RFC 4180 para compatibilidad universal con Excel y Calc.
- [x] Filtros rápidos por estado (`Running`, `Pending`, `Failed`, etc.) con conteos en tiempo real.
- [x] Filtro por etiquetas (`key=value`) y acción de limpieza completa de filtros.
- [x] Pruebas unitarias al 100% y verificación visual en paquete real con Playwright.
