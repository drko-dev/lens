# OpenLens DevOps Revival — R6-03 UI Density & Layout Audit

## Auditoría de Densidad y Organización de Interfaz para Operadores

- **Fecha:** 2026-10-22
- **Hito:** R6-03 (Modernización integral de UI de alta densidad)
- **Autor del fork:** Gustavo Marcon
- **Worktree:** `/Users/gustavomarcon/Documents/lens/lens-r4`
- **Branch:** `feat/midnight-graphite-branding`
- **HEAD consolidado R6-02:** `18f0b88f4367a0acea66aa3f789d259b0b768742`
- **Filosofía rectora:** Máxima información útil visible por pantalla, menor scroll vertical/horizontal, menos clics, controles compactos y ergonomía operacional estilo DBeaver sin saturación visual.

---

## 1. Matriz de Componentes, Dimensiones Actuales y Oportunidades de Mejora

| Área | Archivos Principales | Dimensiones Actuales | Problemas Identificados | Solución R6-03 Propuesta |
| :--- | :--- | :--- | :--- | :--- |
| **1. Layout Principal** | `layout/main-layout.module.scss`<br>`app.scss` | `--main-layout-header: 40px`<br>`--unit: 8px`<br>`--padding: 8px` | Márgenes y paddings generosos que empujan el contenido útil hacia abajo antes de ver datos. | Refinar escala de espaciado en modo Midnight Graphite sin alterar anchos ni contratos globales. |
| **2. TopBar** | `layout/top-bar/top-bar.tsx`<br>`top-bar.module.scss` | `height: 40px`<br>`padding: 0 16px`<br>`brand: 26x28px` | Separación amplia entre controles de ventana, marca y migas de pan. | Ajustar a 36-38px manteniendo soporte de botones nativos de ventana en macOS y alineación de marca. |
| **3. Hotbar** | `hotbar/hotbar-icon.module.scss`<br>`hotbar-selector.module.scss` | Celdas de 40px con sombras grandes y márgenes holgados | Pocos pines visibles en viewports angostos o pantallas de laptop (13-14"). | Reducir márgenes de celda, optimizar anillos hover y activos con paleta Midnight Graphite (#7196D2). |
| **4. Sidebar & Navegación** | `layout/sidebar.module.scss`<br>`sidebar-items.module.scss`<br>`sidebar-cluster.module.scss` | `SidebarCluster`: padding 9.6px<br>`SidebarItem`: padding 6px vertical (32px de alto)<br>Submenu indent: 25px | Cluster header ocupa ~65px. Items de navegación altos desperdician espacio vertical en menús largos (Namespaces, Pods, Deployments, CRDs). | Reducir padding vertical de `SidebarItem` a 4px (alto ~28px, +15% de ítems visibles sin scroll). Header de cluster compacto con PROD red intacto. |
| **5. Workspace Tabs** | `workspace-tabs/renderer/workspace-tab-bar.scss`<br>`workspace-tab-bar.tsx` | Barra `height: 38px`<br>`flex: 0 0 38px`<br>Select max-width: 130px | 38px de altura fija resta espacio directamente al listado de recursos. | Reducir altura a 32px (`flex: 0 0 32px`), tabs internas a 26px con paddings equilibrados. |
| **6. Catálogo** | `catalog/catalog.module.scss`<br>`catalog.tsx` | `.views`: padding 16px<br>Tabs de categoría: `px-8 py-4` (Tailwind = 32px x 16px) | Márgenes exteriores enormes (32px totales horizontal/vertical) y botones de categoría desproporcionados. | Compactar `.views` a 10px 12px; reducir padding de pestañas de categoría; celdas de tabla compactas. |
| **7. Listados de Recursos (ItemListLayout)** | `item-object-list/item-list-layout.scss`<br>`item-list-layout.tsx` | `> .header`: padding 16px en los 4 lados (`--flex-gap: 16px`) | Cabecera consume ~65-75px verticales antes del primer recurso. Filtros y selectores envuelven a múltiples líneas. | Compactar padding a `8px 12px` (ahorro directo de 16px de altura de cabecera); alinear búsqueda, namespace y filtros en una sola barra densa. |
| **8. Tablas y VirtualList** | `table/table.scss`<br>`table-row.scss`<br>`table-cell.scss`<br>`table-head.scss` | **Compact:** 33px fila, padding 8px vertical<br>**Comfortable:** 42px fila, padding 12px vertical | Excelente base R5-04/R5-09. Falta pulir tipografía numérica (`tabular-nums`), encabezado de tabla más nítido y menú de fila accesible. | **Mantener estrictamente 33px Compact (default) y 42px Comfortable.** Encabezado de tabla nítido de 30px, números tabulares para tamaños, CPU/Mem y edades. |
| **9. Filtros y Búsqueda** | `input/search-input.scss`<br>`item-list-layout.tsx` | `SearchInput`: min-width 220px, max-width 900px, padding `6px 10px` | Campo de búsqueda ocupa demasiado espacio estático o salta de tamaño. Icono de borrado poco visible. | Búsqueda compacta de 28px de alto, bordes finos, placeholder discreto y atajo de teclado accesible. |
| **10. Panel de Detalles (Drawer)** | `drawer/drawer.scss`<br>`drawer-item.scss`<br>`kube-object-details/details-header.module.scss` | `Drawer`: padding 24px (`--spacing: 24px`)<br>`DrawerItem`: padding 8px vertical | 24px de padding en bordes y 8px por fila obliga a hacer scroll continuo para ver metadatos básicos de un Pod. | Reducir padding de drawer a 12-14px; `DrawerItem` a 4px vertical (ahorro de ~60-80px en una ficha típica de Pod/Deployment). |
| **11. Dock Inferior** | `dock/dock.scss`<br>`dock-tab.module.scss`<br>`dock-tabs.module.scss` | Pestañas `height: 32px`, container padding 16px, toolbar min-height 32px | La combinación de barra de pestañas y barra de herramientas ocupa ~64px antes de que comience el texto de terminal o logs. | Compactar pestañas a 28px, toolbar a 28px con espaciado uniforme, ganando altura para el buffer de texto. |
| **12. Logs, Terminal & YAML** | `dock/logs/controls.module.scss`<br>`search.scss`<br>`tool-context-header.module.scss` | Controls padding `8px 16px`, min-height 32px | Controles de búsqueda de logs y selectores de contenedor ocupan demasiado alto al redimensionar. | Padding compacto de 4px 8px; botones de alternancia (regex, case, timestamps) compactos de 22px de alto. |

---

## 2. Definición de Tokens de Densidad y Reglas de Implementación

Para asegurar que los cambios sean coherentes y no rompan extensiones ni temas clásicos (Dark / Light):

1. **Tokens Globales:**
   - Aprovechar las variables de `tokens.scss` y los estilos específicos bajo `body.theme-midnight-graphite`.
   - Modificar las reglas en los componentes de manera aditiva y responsiva.
2. **Sincronización Inviolable de VirtualList:**
   - La altura de fila en modo Compact permanece **33 px**.
   - La altura de fila en modo Comfortable permanece **42 px**.
   - Los cálculos de `VirtualList.rowHeights` deben coincidir exactamente con el CSS efectivo del DOM.
3. **Seguridad PROD Inamovible:**
   - Cualquier cluster en entorno `production` muestra el borde rojo `#EF4444`, badges inconfundibles y bloqueos de seguridad.
4. **Preservación Funcional:**
   - Cero modificaciones a la lógica de Kubernetes, Secrets, ConfigMaps, PTY, Monaco, RBAC ni IPC.
