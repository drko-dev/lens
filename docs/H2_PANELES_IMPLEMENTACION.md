# H2: Implementación de Catálogo de Paneles, Composición Dinámica y Workspaces Configurables

**Proyecto:** OpenLens DevOps  
**Repositorio:** `/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections`  
**Rama:** `feature/floating-panels-h2`  
**Fecha:** 2026-11-01  
**Plataforma de desarrollo y validación:** macOS Apple Silicon (Mac M4)  
**Estado:** Implementado, Verificado Unitariamente (100% PASS, 46/46 split-panel, 141 tests globales) y Validado en Electron 45 (19/19 PASS)

---

## 1. Resumen Ejecutivo de la Arquitectura H2

El Hito H2 evoluciona el divisor estático bidireccional de H1 hacia un **motor de composición dinámica de árbol (N paneles)** y un **sistema de workspaces configurables**, manteniendo la identidad visual Midnight Graphite y preservando los invariantes críticos de seguridad, aislamiento de clústeres y estabilidad del streaming de logs de Kubetail.

```
+------------------------------------------------------------------------------------------------------+
| Top Workspace Toolbar (SplitPanelLayout)                                                             |
|   - Workspace Selector: [Operación | Incidentes | Desarrollo | H1 Clásico | Personalizado]           |
|   - Botón [+ Agregar panel] -> Modal Catálogo de Componentes                                         |
|   - Toggle [Split View: ON/OFF] | [Swap] | [Reset] | [Guardar]                                       |
+------------------------------------------------------------------------------------------------------+
                                                  |
                     +----------------------------+----------------------------+
                     |                                                         |
     [Modo Clásico (Single Panel)]                              [Modo Dinámico / Multi-Split]
                     |                                                         |
       KubetailPage a 100% ancho                                    DynamicLayoutRenderer
       (Barra de Workspace activa)                                             |
                                                      +------------------------+------------------------+
                                                      |                                                 |
                                            [Branch Node: Horizontal]                 [Maximized Panel Container]
                                            (Ratio 0.20 - 0.80)                        (100% Viewport con acción
                                                      |                                 de "Restaurar")
                                  +-------------------+-------------------+
                                  |                                       |
                         [Leaf Node: Pods]                      [Branch Node: Vertical]
                                                                (Ratio 0.50 equitativo)
                                                                          |
                                                        +-----------------+-----------------+
                                                        |                                   |
                                              [Leaf Node: Terminal]             [Leaf Node: Details]
```

### Principios Arquitectónicos Aplicados:
1. **Topología de Árbol Recursiva Pura:** Estructura de nodos `SplitLayoutBranch | SplitLayoutGroup | SplitLayoutLeaf` que soporta anidamientos arbitrarios sin requerir librerías externas de docking (evitando recreación innecesaria del DOM y rotura de WebSockets).
2. **Desacoplamiento mediante Inversión de Control:** Eliminación de dependencias circulares (`kubetail-page` <-> `panel-content-resolver`) a través del patrón `registerPanelRenderer(kind, renderer)`.
3. **Persistencia Inerte Versionada (V2):** Serialización del árbol en `openlens:split-layout` con migración fluida de payloads legacy V1 hacia el workspace `h1-default`. Cero almacenamiento de secretos, tokens, kubeconfigs o buffers.
4. **Resiliencia Operativa:** Integración de `PanelErrorBoundary` independiente en cada contenedor de hoja y preservación de streams de Kubetail (`preserveStreamsOnUnmount`) ante mutaciones del árbol.

---

## 2. Componentes Creados y Modificados

### 2.1 Modelos y Tipos (`packages/core/src/renderer/components/split-panel/`)
- **`split-panel-types.ts`:**
  - Tipado de nodos del árbol: `SplitLayoutBranch`, `SplitLayoutGroup`, `SplitLayoutLeaf`, `SplitLayoutNode`.
  - Discriminadores de tipo: `isBranchNode()`, `isGroupNode()`, `isLeafNode()`.
  - Definición de catálogo y plantillas: `PanelCatalogItem`, `WorkspaceTemplateId`, `WorkspaceTemplate`.
  - Esquemas de persistencia: `SerializedSplitLayoutV1` y `SerializedSplitLayoutV2`.
- **`panel-catalog.ts`:**
  - Catálogo formal `PANEL_CATALOG` compuesto por 7 componentes:
    1. `kubetail`: Kubetail Multi-Pod Logs (Observabilidad).
    2. `resource-details`: Resource Details Inspector (Detalles).
    3. `pods`: Pods Explorer (Workloads).
    4. `deployments`: Deployments Controller (Workloads).
    5. `events`: Cluster Events Stream (Observabilidad).
    6. `terminal`: Cluster Terminal Console (Herramientas).
    7. `resource-editor`: Live Resource YAML Editor (Detalles, en desarrollo / protegido).
  - Plantillas preconfiguradas `WORKSPACE_TEMPLATES`:
    - `operation`: Pods + Deployments + Kubetail.
    - `incidents`: Kubetail + Eventos + Detalles.
    - `development`: Pods + Terminal + Detalles.
    - `h1-default`: Kubetail (58%) + Resource Details (42%).
    - `custom`: Distribución activa guardada por el usuario.

### 2.2 Motor de Composición y Store (`split-panel-store.ts`)
- **Funciones de Transformación de Árbol Inmutables:**
  - `getAllLeaves(root)`: Recolección plana de todas las hojas activas.
  - `removeLeafFromTree(root, leafId)`: Poda limpia de hojas promoviendo al nodo hermano para evitar ramas vacías o nodos huérfanos.
  - `splitLeafInTree(root, targetId, newLeaf, orientation)`: División interactiva de una hoja específica en una nueva rama horizontal o vertical.
  - `updateBranchRatio(root, branchId, ratio)`: Actualización granular con clamping estricto (0.20 - 0.80).
- **Acciones y Estado MobX:**
  - `rootNode`, `activeWorkspaceId`, `maximizedPanelId`, `isCatalogOpen`.
  - `openCatalog()`, `closeCatalog()`, `addPanel()`, `closePanel()`, `toggleMaximizePanel()`.
  - `selectWorkspace(templateId)`, `saveCustomWorkspace()`.
  - `serializeLayout(targetVersion?: 1 | 2)` y `restoreLayout(data)` con sanitización contra inyección.

### 2.3 Renderizadores de Interfaz
- **`split-panel-layout.tsx`:**
  - Barra superior de Workspaces (`workspace-toolbar`) con selector interactivo, botón `+ Agregar panel`, conmutador `Split View: ON/OFF`, `Swap`, `Reset` y `Guardar`.
  - Orquestación híbrida: conmutación fluida entre modo clásico, fallback H1 de 2 paneles y motor dinámico `DynamicLayoutRenderer`.
- **`dynamic-layout-renderer.tsx`:**
  - Renderizado recursivo de ramas con divisores `@openlens/resizing-anchor` horizontales y verticales.
  - Soporte de doble clic en divisor para restablecer proporciones al 50/50.
  - Soporte nativo de maximizado a 100% del viewport con botón de restauración.
  - Soporte para pestañas agrupadas (`SplitLayoutGroup`).
- **`panel-catalog-modal.tsx`:**
  - Modal accesible con filtros por categoría (`Todos`, `Workloads`, `Observabilidad`, `Detalles`, `Herramientas`).
  - Selector de orientación para la nueva división (`Horizontal` / `Vertical`).
  - Cierre mediante botón, clic en overlay o tecla `Escape`.
- **`panel-content-resolver.tsx`:**
  - Resolución dinámica de vistas por `panelKind`.
  - Patrón de desacoplamiento `registerPanelRenderer` para prevenir ciclos de importación.
- **`terminal-panel-content.tsx`:**
  - Panel informativo que declara el estado no disponible de la terminal en H2 (`Próximamente en H3 (requiere PTY multiventana)`), evitando falsas consolas interactivas simuladas y guiando al usuario al Dock terminal existente.

### 2.4 Integración y Core
- **`packages/core/src/common/workspace/session-snapshot.ts`:**
  - Sanitizador de layout actualizado para validar la estructura de árbol V2 (`sanitizeSplitLayoutNode`) y rechazar campos no autorizados o maliciosos.
- **`packages/core/src/renderer/components/kubetail/kubetail-page.tsx`:**
  - Desacoplamiento de la barra de controles de split (evita duplicación de botones con el layout principal).
  - Integración como root de navegación preservando las conexiones activas ante cambios de layout.
  - Indicador de estado de streaming `[data-testid="kubetail-stats"]` exponiendo contadores observables de `Streams` y `Lines`.

### 2.5 Cierre Correctivo H2 (Resolución de Hallazgos de Auditoría)
1. **Adaptación Responsiva de Vistas Embebidas (Pods, Deployments, Events):**
   - Eliminación de padding rígido de 8px en `.embeddedWorkloadPanel`.
   - Modificación de `.SiblingsInTabLayout` e `.ItemListLayout > .header` con `flex-wrap: wrap`, espaciado reducido de 6px y ajuste de `min-width: 0` para evitar recorte en anchos < 400px.
   - Restricción del scroll horizontal exclusivamente a las tablas internas (`.Table` con `overflow-x: auto`), manteniendo los encabezados de página y filtros fijos.
2. **Invarianza Estricta de Streaming de Kubetail:**
   - Inclusión de contadores de conexión `Streams` y `Lines` en el encabezado.
   - Verificación de que mutaciones como redimensionamiento de divisores, intercambio de paneles, cierre y reapertura de paneles preservan el stream único (`streams === 1`) sin fugas ni desconexiones.
3. **Mover y Reagrupar Paneles (Drag & Drop y Menú Accesible):**
   - Métodos en `SplitPanelStore`: `movePanel(sourceId, targetId, mode)`, `swapLeaves(id1, id2)`, `setActiveTabInGroup(groupId, panelId)` y `extractTabFromGroup(groupId, panelId)`.
   - Soporte para drag-and-drop HTML5 nativo entre paneles con tipo `application/openlens-panel-id`.
   - Botón accesible `panel-move-button` con menú interactivo para intercambiar o agrupar paneles como pestañas (`SplitLayoutGroup`) y botón de extracción (`tab-extract-`).
4. **Sandboxing y Transparencia de Componentes:**
   - Declaración de `terminal` con `available: false` y badge informativo.
   - Comprobación estricta de aislamiento de variables de entorno de Electron (`HOME`, `CICD`, `KUBECONFIG` hacia `/tmp`), verificación de no alteración de kubeconfigs del host y ausencia de credenciales en `localStorage`.

---

## 3. Pruebas Unitarias y de Integración

Se implementó la suite completa `packages/core/src/renderer/components/split-panel/__tests__/dynamic-composition-h2.test.ts` que valida:
1. Conformidad de metadatos de los 7 componentes del catálogo.
2. Composición dinámica de 2 a 4 paneles y poda de ramas sin huérfanos.
3. Maximizado y restauración de paneles individuales.
4. Restricción y clamping de proporciones de división (20% - 80%).
5. Carga y alternancia entre plantillas de Workspace (`operation`, `incidents`, `development`).
6. Guardado de workspace personalizado (`custom`).
7. Serialización y deserialización V2 sin fuga de credenciales.
8. Conversión automática de snapshots legacy V1 a árbol V2.
9. Agrupación y desagrupación interactiva de paneles en pestañas manteniendo identidad.

**Resultado:**
- 7/7 suites de pruebas split-panel pasaron exitosamente (46/46 tests unitarios PASS).
- 18/18 suites del subsistema de workspace, Kubetail y floating panels PASS (141 tests PASS).
