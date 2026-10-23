# OpenLens DevOps Revival — R6-04 UX & Workflow Audit

## Auditoría Operacional de Flujos Diarios Kubernetes para Ingenieros DevOps

- **Fecha:** 2026-10-23
- **Hito:** R6-04 (UX: Menos pasos, navegación fluida y continuidad de contexto)
- **Autor del fork:** Gustavo Marcon
- **Worktree:** `/Users/gustavomarcon/Documents/lens/lens-r4`
- **Branch:** `feat/midnight-graphite-branding`
- **HEAD consolidado R6-03:** `dc15b4c9b18e69876e217bd2677b93bc8f61b11e`
- **Filosofía rectora:** Reducir clics, scroll y saltos de foco en operaciones repetitivas cotidianas; garantizar continuidad de contexto entre clústeres, recursos y herramientas de terminal/logs; cero distracciones visuales; ergonomía pura.

---

## 1. Matriz de Auditoría de los 11 Flujos Operacionales

| # | Flujo Operacional | Pasos y Clics Actuales | Scroll y Foco Requerido | Fricciones Identificadas | Solución y Mejora R6-04 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Seleccionar un clúster** | 1–2 clics desde WorkspaceTabBar o Hotbar; 2–3 clics desde Catálogo. | Scroll en catálogo largo si no está filtrado. Foco inicial en la vista de clúster. | En catálogos grandes, falta persistencia del filtro de entorno al regresar del clúster. | Filtros DEV/STG/PROD y Pinned reactivos persistentes; hotbar con acceso directo en 1 clic; conmutación instantánea de Workspace Tab sin recarga. |
| **2** | **Cambiar de namespace** | 2–3 clics: abrir selector de namespace, tipear o scrollear, seleccionar. | Scroll si hay 15+ namespaces en el clúster. Foco en el menú desplegable. | Volver a "All namespaces" requiere abrir el dropdown y buscar la opción o desmarcar uno a uno. | Quick Action de reseteo a "All namespaces" con 1 clic directo en el badge cuando hay filtro activo; filtrado por texto optimizado en el select. |
| **3** | **Buscar un Pod o Deployment** | 1 clic o `Cmd+F` / `Ctrl+F` para enfocar; filtrado reactivo al escribir. | 0 scroll (SearchInput fijo en cabecera a 28 px). Foco en `<input>`. | Al terminar de buscar, el foco queda atrapado en el input; el usuario debe tomar el mouse para abrir el recurso. | Soporte de navegación por teclado: `Escape` limpia la búsqueda al instante; foco transferible a filas de tabla; preservación del query en URL (`?search=...`). |
| **4** | **Filtrar recursos por estado** | 1 clic por chip de estado (`Running`, `Pending`, `Failed`, etc.). | 0 scroll (chips en `KubeQuickFilters` sobre la tabla). Foco en botón de chip. | Falta de un botón global "Clear all" cuando conviven búsqueda de texto y múltiples chips de estado. | Botón "Clear all" unificado en cabecera cuando `activeFilters.length > 0` o búsqueda activa; contador dinámico de recursos filtrados vs totales. |
| **5** | **Abrir detalles de un recurso (Drawer)** | 1 clic en la fila de la tabla; el Drawer abre a la derecha sin recargar la lista. | 0 scroll para abrir (abre con scroll top 0). Foco transferido al Drawer. | Copiar el nombre o namespace para CLI requiere seleccionar texto con mouse si el botón no es evidente. | Botón de copia accesible con 1 clic en `DetailsHeader` para nombre y namespace; acciones rápidas en toolbar (Edit, Logs, Terminal, Delete); cierre con `Escape` preservando filtros de tabla. |
| **6** | **Consultar logs de Pod** | 1–2 clics: botón de Logs en toolbar de Drawer o menú 3 puntos de fila. | 0 scroll de interfaz; scroll interno dentro del buffer de logs. | La cabecera de logs y selector de contenedor antes ocupaban demasiado espacio vertical. | Toolbar de Dock compactada a 28 px (+25% de líneas de log visibles); controles compactos de follow, timestamps y búsqueda regex; cambio de contenedor sin cerrar el Dock. |
| **7** | **Abrir terminal en contenedor** | 1–2 clics: botón Terminal en fila o Drawer. | 0 scroll; foco automático en el cursor de la terminal PTY. | En clústeres PROD se requiere confirmación para evitar comandos destructivos por error. | Terminal Production Gate con advertencia roja `#EF4444` confirmable; terminal PTY con xterm.js optimizado; pestaña compacta de 28 px; persistencia de sesión al conmutar pestañas. |
| **8** | **Editar YAML de recurso** | 1–2 clics: botón "Edit" en Drawer o fila de tabla. | 0 scroll para abrir; editor Monaco en Dock inferior. | Si el usuario edita en PROD, el riesgo de aplicar cambios no validados es crítico. | Banner de advertencia de producción en edición; validación de sintaxis antes de envío; atajo `Cmd+S` para guardar; diff visual contra `resourceVersion` actual. |
| **9** | **Iniciar port-forward** | 2–3 clics: menú de Pod/Service -> Port Forward -> Confirmar puerto. | 0 scroll (diálogo modal centrado). Foco en input de puerto. | Seleccionar puerto libre manualmente cuando hay colisiones. | Precompletado automático de puerto de contenedor y puerto local disponible; gestión en lista de port-forwards con detención en 1 clic. |
| **10** | **Cambiar entre pestañas de trabajo** | 1 clic en la pestaña de `WorkspaceTabBar`. | 0 scroll (barra horizontal compacta con overflow). Foco en tab seleccionada. | Pérdida de estado de navegación si la pestaña se destruye al salir. | Arquitectura de iframes independientes por clúster: el contexto, filtros, scroll y selección de namespace se mantienen intactos al alternar pestañas. |
| **11** | **Volver al listado anterior** | 1 clic en botón "Back" o `Cmd+[` / `Alt+Left`. | 0 scroll; foco en el elemento recién deseleccionado. | Al cerrar un detalle o volver atrás, la lista a veces reiniciaba su posición de scroll. | Sincronización precisa de URL y preservación del índice de virtualización en `VirtualList`; navegación por migas de pan (breadcrumbs) con salto a nivel superior en 1 clic. |

---

## 2. Puntos Clave de Implementación para R6-04

1. **Atajos de Teclado y Foco Fluido:**
   - `Cmd+F` / `Ctrl+F`: enfoca la búsqueda inmediatamente en cualquier pantalla de recurso.
   - `Escape`: si la búsqueda tiene texto, la limpia en 1 tecla; si está vacía y el Drawer está abierto, cierra el Drawer; si el Drawer está cerrado, limpia los filtros rápidos.
   - `ArrowDown` / `Enter` desde búsqueda: permite transferir foco a los resultados de la tabla sin levantar las manos del teclado.

2. **Indicador y Reseteo Unificado de Filtros en Cabecera:**
   - En `ItemListLayoutHeader`, cuando hay filtros activos (búsqueda, estado o etiquetas), mostrar un botón visible y compacto de reseteo rápido: `<button className="quick-clear-all" onClick={resetAllFilters}>Clear all</button>`.
   - Mostrar el ratio exacto de recursos visibles: `Filtered: X / Y`.

3. **Acciones Rápidas en Drawer (DetailsHeader):**
   - Incorporar chips de estado claros con código de color (verde `ok`, amarillo `warn`, rojo `err`).
   - Acceso con 1 clic para copiar nombre y namespace con feedback tooltip visual.
   - Preservar la posición de scroll de la tabla subyacente al cerrar el Drawer.

4. **Preservación Incondicional de Densidad y Seguridad:**
   - Mantener las tablas compactas de **33 px**, barra de tabs de **32 px**, toolbar de **28 px**, y tema Midnight Graphite.
   - El entorno **PROD** mantiene estrictamente sus avisos rojos `#EF4444`, hazard rings y bloqueos de confirmación en terminal, borrado y edición.
