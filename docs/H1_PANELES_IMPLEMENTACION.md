# H1: Implementación del Motor de Paneles Acoplables y Primer Caso de Uso

**Proyecto:** OpenLens DevOps  
**Repositorio:** `/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections`  
**Rama:** `feature/floating-panels-h1`  
**Fecha:** 2026-11-01  
**Plataforma de desarrollo y validación:** macOS Apple Silicon (Mac M4)  
**Estado:** Implementado y Verificado (33/33 tests unitarios PASS, Webpack Dev Server compilado con 0 errores)

---

## 1. Arquitectura Implementada

Se implementó el motor minimalista **`LensSplitLayout` / `SplitPanelLayout`** dentro de la ventana principal de OpenLens DevOps, desacoplando la topología visual de los componentes de negocio (Kubetail y Detalles de Recursos).

```
+---------------------------------------------------------------------------------------+
| MainLayout / KubetailPage (Root)                                                      |
|   - Feature Flag Check (floatingPanelsFeatureFlag.isEnabled)                          |
|   - Modo Clásico vs Modo Split (splitPanelStore.isClassicMode)                        |
+---------------------------------------------------------------------------------------+
                                          |
                     +--------------------+--------------------+
                     |                                         |
     [Modo Clásico (Single Panel)]             [Modo Split H1 (SplitPanelLayout)]
                     |                                         |
             KubetailPage Clásico              +---------------+---------------+
                                               |               |               |
                                          [Left Pane]      [Divider]     [Right Pane]
                                          (58% default)  ResizingAnchor  (42% default)
                                               |               |               |
                                        PanelContainer                 PanelContainer
                                        (ErrorBoundary)                (ErrorBoundary)
                                               |                               |
                                         KubetailPage              ResourceDetailsContent
                                     (preserveStreams=true)         (Desacoplado de Drawer)
```

### Principios Fundamentales Respetados:
1. **Cero Dependencias Externas:** Reutilización de `@openlens/resizing-anchor` sin agregar librerías pesadas de docking que causen desmontajes involuntarios de React.
2. **Propiedad Única de Streaming:** `KubetailStore` mantiene las conexiones activas independientemente de cambios de ancho, swap o visibilidad del panel secundario.
3. **Persistencia Inerte y Sanitizada:** Los esquemas solo guardan metadatos públicos de UI en `SessionSnapshotV1` a través de una allowlist estricta. Cero credenciales, tokens o kubeconfigs.
4. **Rollback Instantáneo:** Toggle de vista clásica disponible en todo momento sin pérdida de estado ni recarga destructiva.

---

## 2. Archivos Modificados y Creados

### Componentes del Motor Split Panel (`packages/core/src/renderer/components/split-panel/`)
- **`split-panel-types.ts`:** Definición de contratos tipados fundamentales (`PanelId`, `PanelKind`, `PanelDescriptor`, `PanelResourceBinding`, `SplitLayoutNode`, `SplitLayoutBranch`, `SplitLayoutLeaf`, `SerializedSplitLayout`).
- **`split-panel-store.ts`:** Store MobX reactivo para la orquestación del layout (ratios de 0.20 a 0.80, default 0.58, swaps, cierre de paneles, restauración de defaults, persistencia local y aislamiento de clúster).
- **`split-panel-store.injectable.ts`:** Inyección de dependencias para el DI container de OpenLens.
- **`split-panel-layout.tsx`:** Contenedor de disposición con soporte para modo clásico, drag con `ResizingAnchor`, barras de reapertura y doble clic para restablecer proporción.
- **`panel-container.tsx`:** Marco unificado con encabezado, ícono, badge de entorno (PROD / DEV), botones de swap y cierre, y `PanelErrorBoundary` independiente con acción de retry.
- **`resource-details-panel-content.tsx`:** Vista de detalles desacoplada del Drawer lateral que resuelve el recurso seleccionado a través de stores existentes (`deploymentStore`, etc.) y muestra `DetailsHeader`, `KubeObjectMenu` y los `kubeObjectDetailItems`.
- **`split-panel.module.scss`:** Estilos consistentes con la paleta Midnight Graphite (`--graphite-*`, `--midnight-*`).
- **`index.ts`:** Barrel de exportación pública.

### Feature Flags y Persistencia en Core
- **`packages/core/src/features/floating-panels/common/floating-panels-feature-flag.injectable.ts`:** Orquesta la habilitación por CLI (`--enable-floating-panels`), variables de entorno (`OPENLENS_FLOATING_PANELS`), query strings de URL y `localStorage`.
- **`packages/core/src/common/workspace/workspace-types.ts`:** Incorporación de `SerializedSplitLayout` en la interfaz `WorkspaceLayout`.
- **`packages/core/src/common/workspace/session-snapshot.ts`:** Función `sanitizeSplitLayout(raw)` con validación de allowlist, clamp de ratios y rechazo de payloads corruptos.

### Adaptaciones en Kubetail
- **`packages/core/src/renderer/components/kubetail/kubetail-page.tsx`:**
  - Integración reactiva con `SplitPanelLayout` y `ResourceDetailsPanelContent`.
  - Prop `preserveStreamsOnUnmount={true}` para evitar que `kubetailStore.stopAllStreams()` interrumpa logs durante transiciones visuales.
  - Sincronización automática de `kubetailStore.selectedResource` hacia `splitPanelStore.setResourceBinding` con `fireImmediately: true`.
  - Aislamiento de foco en `handleKeyDown`: atajos de teclado (`Space`, `p`, `c`, `/`, `Cmd+F`, `Cmd+K`) solo capturan eventos cuando el contenedor de Kubetail tiene el foco del documento, impidiendo colisiones con terminales y editores.
  - Controles de barra de herramientas para Split View (ON/OFF), Swap, Reset y Details (ON/OFF).

---

## 3. Contratos Tipados Definitivos

```typescript
export type PanelId = string;

export type PanelKind =
  | "kubetail"
  | "resource-details"
  | "terminal"
  | "resource-editor";

export interface PanelResourceBinding {
  readonly apiVersion?: string;
  readonly kind: string;
  readonly namespace?: string;
  readonly name: string;
  readonly uid?: string;
}

export interface SerializedSplitLayout {
  readonly version: 1;
  readonly ratio: number;
  readonly isSwapped: boolean;
  readonly isLeftClosed: boolean;
  readonly isRightClosed: boolean;
  readonly isClassicMode: boolean;
  readonly leftPanelKind: PanelKind;
  readonly rightPanelKind: PanelKind;
  readonly resourceBinding?: {
    readonly kind: string;
    readonly name: string;
    readonly namespace: string;
  };
}
```

---

## 4. Decisiones de Diseño y Trade-offs

1. **Motor Propio vs Librerías de Terceros (`dockview` / `rc-dock`):**
   - *Decisión:* Para H1 (dos paneles internos) se implementó un motor minimalista con `ResizingAnchor`.
   - *Motivo:* Elimina el riesgo de desmontajes virtuales de DOM en React 17 durante redimensionamientos, manteniendo la continuidad de los streams HTTP de Kubetail sin recrear sockets. Cero bytes de librerías externas superfluas.
2. **Ciclo de Vida de Streaming en Kubetail:**
   - *Decisión:* Separar el ciclo de vida del stream de la presencia visual mediante `preserveStreamsOnUnmount`.
   - *Motivo:* En React, alternar entre un layout compuesto y un contenedor directo puede desmontar componentes. La propiedad de la sesión pertenece a `KubetailStore`, no al nodo del árbol de render.
3. **Desacoplamiento de KubeObjectDetails:**
   - *Decisión:* Montar directamente el contenido de detalles con sus `detailComponents` en `ResourceDetailsPanelContent` sin invocar la mutación de URL de detalle (`/details?kind=...`) que disparaba el `Drawer` global.
   - *Motivo:* Permite observar el Deployment a la derecha mientras Kubetail corre a la izquierda sin superponer modales ni interferir con la navegación principal.

---

## 5. Pruebas Automatizadas Desarrolladas

Se desarrollaron 6 suites dedicadas con **33 pruebas unitarias e integración** en `packages/core/src/renderer/components/split-panel/__tests__/`:
1. **`split-panel-store.test.ts` (12 tests):** Inicialización, límites de ratio (0.20–0.80), swapping, cierre/reapertura, reseteo a 58/42, rollback a modo clásico y aislamiento de clúster.
2. **`kubetail-lifecycle-resilience.test.ts` (4 tests):** Comprobación de que redimensionar, intercambiar paneles o cerrar el panel derecho **no interrumpe ni duplica** los streams de Kubetail.
3. **`split-panel-layout.test.tsx` (5 tests):** Renderizado de paneles, redimensionamiento, swaps, reapertura de paneles cerrados y aislamiento de fallos con `ErrorBoundary`.
4. **`split-panel-persistence.test.ts` (5 tests):** Serialización y sanitización mediante allowlist, rechazo de payloads inválidos y prevención de estados imposibles.
5. **`split-panel-security.test.ts` (4 tests):** Aislamiento estricto de `clusterId`, verificación de que nunca se persisten tokens ni secretos y sanitización de longitud de strings.
6. **`resource-details-panel-content.test.tsx` (3 tests):** Estados empty, loading y renderizado completo de detalles cuando un Deployment está enlazado.

Todas las pruebas pasan con 100% de éxito (`33 passed, 33 total`).
