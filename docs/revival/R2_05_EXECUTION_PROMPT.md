# OpenLens DevOps Revival — Prompt de ejecución R2-05
## Exportación CSV segura y filtros rápidos en listas Kubernetes

**Repositorio:** `/Users/gustavomarcon/Documents/lens/lens`  
**Rama:** `feat/openlens-devops-revival`  
**Release:** R2 — Productividad, UX y seguridad operativa  
**Siguiente hito:** R2-05 (R2-00 a R2-04 ya tienen registros de validación).

## 1. Preparación y línea base
Actuá como ingeniero senior de Electron/React/TypeScript/Kubernetes. Leer obligatoriamente `docs/revival/R2_IMPLEMENTATION_CHECKLIST.md`, `R2_04_VALIDATION.md`, `R2_03_VALIDATION.md`, `R2_02_VALIDATION.md`, `R1_06_VALIDATION.md` y `ROADMAP_PROVISIONAL.md`. Registrar estado Git antes de tocar archivos y conservar cambios sin commit. Verificar y aprovechar estas rutas:
- `packages/core/src/renderer/components/kube-object-list-layout/kube-object-list-layout.tsx`: encamina los recursos, columnas, encabezados y contexto de clúster.
- `packages/core/src/renderer/components/item-object-list/list-layout.tsx`: aplica búsqueda y filtros; el getter computado `items` representa los elementos filtrados.
- `packages/core/src/renderer/components/item-object-list/content.tsx`: visibilidad de columnas, selección, filas y acceso a los ítems.
- `packages/core/src/renderer/components/item-object-list/header.tsx`, `page-filters/store.ts` y `filters.tsx`: controles y criterios compartidos.
- `packages/core/src/renderer/components/table/table.tsx` y `table-model/*`: ordenamiento y configuración de columnas.
- Ejemplos: `workloads-pods/pods.tsx`, `config-secrets/secrets.tsx`, `config-maps/config-maps.tsx`.

**No reconstruir listas ni exportar recorriendo las filas DOM:** hay virtualización y el DOM no contiene todas las filas. Reutilizar el conjunto filtrado en memoria y el ordenamiento del componente. No duplicar lógica entre cada clase de recurso.

## 2. Exportación CSV
Diseñar una acción consistente `Export CSV` en el encabezado/toolbar del listado Kubernetes compartido, con UI de la identidad R2. Comportamiento esperado:
1. Por defecto, exportar **todas las filas que cumplan los filtros visibles actualmente**, incluso las que estén fuera del viewport virtualizado, **en el orden de sort activo**. No exportar recursos de otros namespaces, búsquedas o clústeres fuera del listado. Si la API todavía está cargando, impedir exportar como si estuviera completo; indicar que solo se dispone de un snapshot parcial cuando proceda.
2. Usar solo **columnas actualmente visibles** en la tabla, preservando orden y nombres claros. Si alguna columna contiene componentes React, íconos, barras de progreso o fechas relativas, proveer un **extractor tipado de datos semánticos** por columna; NO serializar HTML/React ni raspar `textContent`. Evitar datos equivocados entre sorting, visualización y exportación. La arquitectura debe ser extensible a columnas inyectables (Pods, Deployments, Services, etc.).
3. Añadir opción explícita `Solo filas seleccionadas` si ya hay selección; no confundir seleccionado con filtrado. Visualizar cantidad de filas/columnas y clúster antes de confirmar la descarga. Sin red ni cuentas cloud.
4. Generar CSV compatible con lectores habituales (UTF-8, BOM opcional documentado, encabezados, comillas dobles escapadas, CRLF, multiline, separadores, Unicode, valores nulos, fechas ISO-8601). En exportaciones grandes, evitar congelar el renderer; límites y aviso de tamaño, con `URL.revokeObjectURL` y limpieza al terminar.
5. Nombre de archivo estable y seguro, ejemplo `openlens-devops_<cluster-alias>_<kind>_<YYYYMMDD-HHMMSS>.csv` con normalización de caracteres de path y etiquetas; no incluir secretos ni IDs sensibles en la ruta. Descargar a elección del usuario, sin escribir silenciosamente datos en carpetas inesperadas.

### Política obligatoria de seguridad de CSV
- **CSV Formula Injection:** proteger toda celda antes de serializar si, tras espacios/control chars iniciales (incluidos tab, CR, LF, BOM y variantes relevantes), comienza con `=`, `+`, `-`, `@`, o construcciones equivalentes interpretables como fórmulas por Excel/LibreOffice. Usar estrategia defensiva comprobada (por ejemplo, prefijo apóstrofe dentro del valor serializado, testeado en casos de control). Citar en informe sus límites conocidos; jamás confiar solo en encerrar entre comillas.
- Aplicar sanitización **también a encabezados, etiquetas, aliases y valores provenientes de Kubernetes**, no solo a una columna.
- **Secrets:** exportar solo metadatos autorizados y visibles (nombre, namespace, type, nombres de claves, edad/fecha). Nunca exportar `data`, `stringData`, contenido base64/decodificado, tokens, claves privadas ni objetos completos. Para recursos arbitrarios/CRDs usar allowlist de columnas y evitar serialización de campos sensibles por defecto.
- No agregar telemetría, logs del contenido exportado, uploads ni copias automáticas al portapapeles.
- Confirmar filtrado/clúster actual antes de exportar, especialmente en producción; exportar es lectura, no pide permisos de mutación.

## 3. Filtros rápidos de tabla
Crear barra/chips de filtros **contextuales** reutilizables, no una casuística acoplada a Pods:
- Estado: Running/Pending/Failed para Pods; Ready/NotReady u otros estados según kind si se dispone de campo confiable, sin inventar un esquema universal.
- Labels: clave, valor y existencia de clave (ej. `app=backend`, `tier=frontend`); combinar con búsqueda textual y namespaces existentes.
- Mostrar chips activos, botón `Clear`, contador `N visibles / M disponibles`, y preservar filtros apropiadamente al cambiar de vista/clúster evitando fugas de criterios globales no relacionados.
- Mantener el filtrado **reactivo** ante actualizaciones Watch del clúster, eficiente con miles de objetos. Evitar modificar Store API o realizar requests extra por cada pulsación.
- Integrar filtros en el mismo pipeline del getter de elementos filtrados para que tabla, contador, selección y CSV representen el **mismo snapshot lógico**.
- Compatibilidad con configuración de columnas, columnas de extensiones y virtualización; accesible con teclado y visualmente coherente con R2-01.

## 4. Calidad y pruebas de aceptación
Crear pruebas unitarias y de integración para:
- Seguridad CSV: `=1+1`, `+SUM(...)`, `-2+3`, `@cmd`, `\t=...`, `\r=...`, `\n=...`, Unicode, alias/headers hostiles, quotes, commas, CRLF y celdas multilínea; comprobar que la mitigación se aplica en **todos** los campos.
- Secrets: fixture con valores `data`/`stringData` o credenciales ficticias **no presentes en la descarga**; permitir únicamente nombres de claves y metadatos.
- Orden y exactitud: búsqueda + namespace + status + labels + sort + columnas ocultas + filas virtualizadas, incluyendo selección y vacíos. La cantidad de CSV debe corresponder a la vista filtrada, no al subconjunto renderizado.
- Filtros y UX: cambios de estado/labels por Watch, limpiar filtros, cambiar de clúster, listas grandes, casos de error/carga parcial, compatibilidad de descarga y cleanup de blobs.
- Regresiones R1 y R2: pines y producción, YAML/Secrets, logs, terminal, port-forward y persistencia.

## 5. Build y validación real obligatorios
1. Ejecutar tests focalizados, regresiones y `tsc -p packages/core/tsconfig.json --noEmit`, bajo **Node v20.20.2**. Informar ejecutados, omitidos y fallidos por separado.
2. Compilar monorepo y empaquetar `OpenLens DevOps.app` para **macOS ARM64** en `open-lens/dist-stage`; sin publicación, firma de distribución ni notarización. Conservar `open-lens/dist` y cualquier instancia habitual en ejecución.
3. Ejecutar el **binario empaquetado actual** con `HOME`/`CICD` aislados y `KUBECONFIG=/dev/null`; smoke Playwright + montar la tabla real en GUI con datos sintéticos de varios namespaces, estados, labels y recursos de tipo Secret.
4. Con Playwright comprobar botones/chips, conteos, filtros combinados, columnas visibles, orden de filas y exportación real. Abrir/inspeccionar el archivo CSV generado, demostrar seguridad ante fórmulas y ausencia de datos secretos; capturas solo con fixtures ficticios.
5. Si solo se prueba Welcome, no declarar el hito validado: se requiere **pantalla real de tablas con datos ficticios**. No acceder a clústeres productivos ni perfiles existentes.

## 6. Documentación y avance
Crear `docs/revival/R2_05_VALIDATION.md` con archivos tocados, arquitectura (fuente común de filtrado/orden), suite de seguridad CSV, resultados de build y tests, evidencia real GUI, ruta/hash del `.app`, capturas, limitaciones y criterios pendientes. Actualizar **únicamente checks demostrados** en `docs/revival/R2_IMPLEMENTATION_CHECKLIST.md`. Mantener el resultado R2-04 sin alteraciones.

Si R2-05 termina con pruebas reales aprobadas, continuar automáticamente a **R2-06 (validación integral de Release 2)**. Detener solo frente a bloqueo de seguridad, acción irreversible o necesidad de clúster real sin autorización. No hacer `git reset --hard`, `git clean`, commits automáticos, eliminación de perfiles ni borrado de builds de respaldo.

**Empezar ahora por R2-05.**
