# H0: Diseño Técnico de la Arquitectura de Paneles Flotantes, Docking y Workspaces

**Proyecto:** OpenLens DevOps  
**Repositorio:** `/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections`  
**Rama:** `feature/kubetail-native-integration`  
**Commit base:** `a007106`  
**Fecha:** 2026-11-01  
**Plataforma de desarrollo y validación primaria:** macOS Apple Silicon (Mac M4)

---

## 1. Arquitectura Modular de Paneles

La arquitectura de paneles desacopla la **lógica y renderizado del contenido** (Kubetail, Detalles de Recursos, Terminal, Editores) de la **topología de disposición visual** (pantalla completa, splits horizontales/verticales, pestañas o ventanas desacopladas del SO).

```
+-----------------------------------------------------------------------------------+
| WorkspaceLayoutManager                                                            |
|  - Orquesta paneles activos, ratios de división y árbol de layout               |
+-----------------------------------------------------------------------------------+
                                         |
         +-------------------------------+-------------------------------+
         |                                                               |
+-----------------------+                                       +-----------------------+
| SplitPanelLayout      |                                       | DetachedWindowAdapter |
| (Dentro de MainLayout)|                                       | (BrowserWindow en SO) |
+-----------------------+                                       +-----------------------+
         |                                                               |
    [ResizingAnchor]                                              [IPC Sanitizado]
         |                                                               |
   +-----+-----+                                                         |
   |           |                                                         |
+---------+ +---------+                                                  |
| Panel A | | Panel B |                                                  |
| Kubetail| | Details |                                                  |
+---------+ +---------+                                                  |
         \           \__________________________________________________/
          \
     +---------------------------------------------------+
     | PanelContainer                                    |
     |  - Toolbar unificada (Título, Maximizar, Cerrar)  |
     |  - ErrorBoundary independiente por panel          |
     |  - Preservación de montaje (Single-Connection)    |
     +---------------------------------------------------+
```

### 1.1 Contratos TypeScript Fundamentales

```typescript
/**
 * Identificador único y determinístico de un panel.
 */
export type PanelId = string;

/**
 * Variantes de herramientas o vistas que pueden instanciarse en un panel.
 */
export type PanelKind =
  | "kubetail"
  | "resource-details"
  | "terminal"
  | "resource-editor"
  | "chart-viewer";

/**
 * Descriptores de recursos Kubernetes a los que puede enlazarse un panel.
 */
export interface PanelResourceBinding {
  readonly apiVersion?: string;
  readonly kind: string;
  readonly namespace?: string;
  readonly name: string;
  readonly uid?: string;
}

/**
 * Metadatos y configuración de un panel independiente.
 */
export interface PanelDescriptor {
  readonly id: PanelId;
  readonly kind: PanelKind;
  readonly clusterId: string;
  readonly title: string;
  readonly icon?: string;
  readonly closable: boolean;
  readonly pinnable?: boolean;
  readonly resourceBinding?: PanelResourceBinding;
  readonly customState?: Record<string, unknown>;
  readonly createdAt: number;
}

/**
 * Agrupación de pestañas en una misma región de docking.
 */
export interface PanelTabGroup {
  readonly id: string;
  readonly panelIds: readonly PanelId[];
  readonly activePanelId: PanelId;
}

/**
 * Tipología de nodo en el árbol de división (Split Layout).
 */
export type SplitOrientation = "horizontal" | "vertical";

export interface SplitLayoutBranch {
  readonly type: "branch";
  readonly orientation: SplitOrientation;
  readonly ratio: number; // Porcentaje relativo (0.1 a 0.9, defecto 0.5)
  readonly first: SplitLayoutNode;
  readonly second: SplitLayoutNode;
}

export interface SplitLayoutLeaf {
  readonly type: "leaf";
  readonly tabGroup: PanelTabGroup;
}

export type SplitLayoutNode = SplitLayoutBranch | SplitLayoutLeaf;

/**
 * Estado completo del layout de paneles dentro de un Workspace.
 */
export interface WorkspacePanelsState {
  readonly workspaceId: string;
  readonly clusterId: string;
  readonly rootNode: SplitLayoutNode;
  readonly panels: Record<PanelId, PanelDescriptor>;
}
```

### 1.2 Responsabilidades de Componentes
1. **`PanelContainer`:**
   - Envuelve el componente de la herramienta (ej. `KubetailPage` o `KubeObjectDetailsContent`).
   - Provee una cabecera homogénea (`PanelHeader`) con título, badge de entorno (PROD / DEV), menú contextual, botón de maximizar/restaurar, botón de desacoplar (`detach`) y botón de cerrar.
   - Incorpora un [`ErrorBoundary`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/dock/dock.tsx#L210) individual para aislar fallos de renderizado y evitar la caída del workspace completo.
2. **`SplitPanelLayout`:**
   - Renderiza recursivamente los nodos hoja (`SplitLayoutLeaf`) y ramas (`SplitLayoutBranch`).
   - Enlaza el divisor arrastrable utilizando el [`ResizingAnchor`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/layout/main-layout.tsx#L47) nativo de OpenLens con restricciones mínimas de tamaño (mínimo 200px por panel).
3. **`PanelRegistry`:**
   - Servicio centralizado en el proceso Renderer (inyectable vía DI de `@ogre-tools/injectable`) que registra los componentes de vista asociados a cada `PanelKind`.

---

## 2. Comparativa Exhaustiva de Motores de Docking y Layout

Se evaluaron formalmente las principales soluciones del ecosistema de React y layouts de escritorio frente a una implementación propia minimalista para OpenLens DevOps:

| Criterio | `dockview` | `flexlayout-react` | `rc-dock` | `golden-layout` (v2) | **Motor Propio Minimalista (Lens Native)** |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Compatibilidad React 17** | Excelente (React 16.8+) | Excelente | Aceptable | Problemático (wrappers frágiles) | **Nativa y Total (React 17 + MobX 6)** |
| **Soporte TypeScript** | Nativo de primer nivel | Nativo de primer nivel | Parcial | Nativo (pero wrappers React débiles) | **100% tipado estricto propio** |
| **Splits H / V & Tabs** | Sí (estilo VS Code) | Sí (estilo Eclipse/Matlab) | Sí | Sí | **Sí (Splits H/V + Tabs para H1)** |
| **Persistencia Layout (JSON)** | Sí (`toJSON` / `fromJSON`) | Sí (JSON serializable) | Sí | Sí | **Sí (Esquema SessionSnapshotV1)** |
| **Footprint de Bundle** | ~65 KB gzipped | ~50 KB gzipped | ~80 KB gzipped | ~75 KB gzipped | **0 KB adicionales (código interno < 8 KB)** |
| **Estilado SCSS / Themes** | Modular (variables CSS) | Variables CSS / Clases | Rígido | Rígido | **Integración perfecta con Midnight Graphite** |
| **Gestión de Ciclo de Vida** | Excelente (control de DOM) | Desmonta pestañas inactivas | Desmonta DOM | Desmonta DOM en drops | **Control total: Cero remounts involuntarios** |
| **Licencia** | MIT | MIT | MIT | MIT | **MIT (Código OpenLens)** |
| **Dependencias externas** | Mínimas | Bajas | Medias (react-dnd desactualizado) | Medias | **Ninguna (usa `@openlens/resizing-anchor`)** |

### Justificación Técnica y Recomendación Fundamentada

1. **Descarte de `golden-layout` y `rc-dock`:**
   - `golden-layout` fue concebido fuera del paradigma de React. Sus wrappers para React sufren de problemas crónicos de reconciliación virtual DOM donde mover o redimensionar paneles desmonta (`unmount`) y monta (`mount`) componentes internos. En una herramienta DevOps como OpenLens, esto causaría la cancelación inmediata de conexiones HTTP Streaming de Kubetail y sesiones de PTY de terminal.
   - `rc-dock` arrastra deuda técnica en sus dependencias de drag & drop y no mantiene un ciclo de lanzamientos ágil.
2. **Evaluación de `dockview` vs. `flexlayout-react`:**
   - `dockview` es hoy el referente moderno de UI de ingeniería (modelo VS Code). Si en etapas avanzadas (H3/H4) se requiere drag-and-drop libre de 5+ paneles simultáneos, `dockview` es el candidato externo más idóneo por su manejo de portales DOM que preserva el estado de componentes React sin desmontarlos.
3. **Decisión Arquitectónica para OpenLens DevOps:**
   - **Para el Hito H1 (y baseline H0):** Se aprueba una **Implementación Propia Minimalista (`LensSplitLayout`)** que consume directamente el componente de redimensionamiento nativo [`@openlens/resizing-anchor`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/layout/main-layout.tsx#L16).
   - **Por qué esta decisión es superior:**
     - **Cero dependencias externas:** No introduce riesgos de vulnerabilidades (`npm audit`), ni incompatibilidad con Node 22 ni conflictos con React 17.
     - **Preservación absoluta del ciclo de vida:** Garantiza que cambiar el ancho del split no toque el ciclo de vida de React, manteniendo vivas las conexiones de Kubetail.
     - **Consistencia visual 100%:** Adopta de forma inmediata la paleta centralizada Midnight Graphite (`--graphite-*`, `--midnight-*`) ya refinada en el Hito 5 de Kubetail.
     - **Arquitectura desacoplada:** La interfaz `PanelDescriptor` y el modelo de datos `SplitLayoutNode` son agnósticos; si en H4 se decide adoptar `dockview` para grids complejos, la interfaz pública de paneles se mantendrá inmutable.

---

## 3. Diseño del Primer Caso de Uso (E1): Kubetail + Deployment Details

El escenario piloto E1 define un layout de **dos columnas en la ventana principal**:
- **Panel Izquierdo (55% a 60% del ancho):** Visor multiplexado nativo de logs de Kubetail.
- **Panel Derecho (40% a 45% del ancho):** Vista detallada del recurso K8s (Deployment, StatefulSet, DaemonSet o Pod) actualmente seleccionado.

```
+-------------------------------------------------------------------------------------------------------+
| TOP BAR / WORKSPACE TABS STRIP                                                                        |
+-------------------------------------------------------------------------------------------------------+
| SIDEBAR    | SPLIT CONTAINER (Main Content Area)                                                      |
|            |-------------------------------------------------------+----------------------------------|
|            | PANEL IZQUIERDO: KUBETAIL LOGS                        | PANEL DERECHO: RESOURCE DETAILS  |
|            | [Deployment: frontend-gateway | Pods: 3/3]            | Deployment: frontend-gateway     |
|            |-------------------------------------------------------|----------------------------------|
|            | 2026-11-01 12:00:01 [pod-1] GET /api/v1/health 200    | Replicas: 3 desired / 3 updated  |
|            | 2026-11-01 12:00:02 [pod-2] POST /api/v1/order 201    | Pods status: 3 Running           |
|            | 2026-11-01 12:00:03 [pod-1] GET /metrics 200          | Selector: app=frontend-gateway   |
|            |                                                       | Strategy: RollingUpdate          |
|            |                                                       | Conditions: Available=True       |
|            |                                                       | [Show YAML] [Scale] [Restart]    |
|            |                                                       |                                  |
|            | (Streaming continuo sin reconexiones)                 | (Watch pasivo sin recarga)       |
+--------------------------------------------------------------------+----------------------------------+
| DOCK FOOTER (Opcional / Minimizado)                                                                   |
+-------------------------------------------------------------------------------------------------------+
```

### 3.1 Garantía de Única Conexión (Single-Connection Ownership)

Uno de los mayores riesgos en UIs de observabilidad con múltiples paneles es la duplicación oculta de streams o peticiones al API Server al alterar la interfaz. Se establecen las siguientes reglas contractuales:

1. **Invarianza de Montaje ante Resize:**
   - La redimensión mediante `ResizingAnchor` actualiza exclusivamente variables de flexbox (`flex-basis` o `width: ${ratio * 100}%`) en el DOM mediante `requestAnimationFrame`.
   - **Regla:** Ningún evento de `onDrag` o cambio de layout produce re-renderizados que desmonten (`unmount`) el componente hijo.
2. **Kubetail Single Stream Client:**
   - El stream HTTP de logs está atado a [`KubetailStore`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/kubetail/kubetail-store.ts#L65).
   - Aunque el panel se minimice o se oculte en una pestaña secundaria, el store mantiene su buffer en memoria. Si el panel pasa a segundo plano, se aplica **estrategia de desconexión pasiva o buffer en pausa** controlada por el usuario, evitando reconexiones inesperadas.
3. **Kube Object Watcher Dedicado:**
   - [`KubeObjectDetails`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/kube-object-details/kube-object-details.tsx) utiliza el store de kube-watch correspondiente a la entidad seleccionada. Al estar visible en el split derecho, consulta del cache de MobX sin crear un canal HTTP duplicate hacia Kubernetes.
4. **Terminal / PTY Protection:**
   - Toda sesión interactiva de terminal asociada a un panel está gobernada por un identificador de sesión único (`sessionKey`). Mover o redimensionar el panel no reinicia el proceso del shell en el backend node-pty.

---

## 4. Aislamiento por Contexto, Seguridad y Persistencia Inerte

### 4.1 Scoping Estricto por ClusterId y Namespace
- **Invariante:** Todo panel instanciado pertenece estrictamente a un `clusterId`.
- **Protección cross-cluster:** Un panel de un clúster no puede consumir datos, streams ni proxies de otro clúster. Al cambiar de pestaña de clúster en la barra de workspaces, el `ClusterFrameHandler` oculta el iframe del clúster anterior y visibiliza el clúster activo, asegurando aislamiento total de memoria y red.
- **Validación de Namespace:** Cuando un recurso es de alcance namespaced, el panel valida que el usuario posea permisos RBAC sobre dicho namespace antes de instanciar componentes reactivos.

### 4.2 Fronteras IPC y Desacople
- El proceso Renderer jamás maneja tokens de acceso en texto plano ni certificados TLS de Kubernetes; todo el tráfico fluye a través del proxy local de Lens en `127.0.0.1` autenticado vía cabecera local interna.
- En caso de desacoplar un panel a una ventana externa del SO (`BrowserWindow`), se aplican estrictamente las reglas de [`openDetachedToolWindowInjectable`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/main/detached-tool-windows/open-detached-tool-window.injectable.ts):
  - `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`.
  - La ventana desacoplada no conoce URLs de proxy ni kubeconfigs: sólo recibe datos filtrados desde Main mediante IPC seguro.

### 4.3 Política de Persistencia Inerte (Inert Layout Restoration)
Para evitar incidentes de seguridad y picos de tráfico al abrir la aplicación:
- **Lo que SÍ se persiste:**
  - Estructura topológica del layout (splits, orientaciones, ratios de tamaño).
  - Referencias públicas del recurso (`kind`, `namespace`, `name`, `clusterId`).
  - Preferencias de visualización (filtros de texto, timestamps activados, auto-scroll activado).
- **Lo que NUNCA se persiste:**
  - Tokens, certificados, secretos o credenciales.
  - Contenido o valores de Secrets de K8s (`data` o `stringData`).
  - Buffers de logs históricos o capturas de terminal.
  - Descriptores de archivos o handles de PTY activos.
- **Comportamiento en arranque:** Al restaurar la sesión tras reiniciar la aplicación, el layout se despliega en estado **inerte** (panel montado con su configuración visual). Los streams de logs de Kubetail inician de forma controlada y resiliente únicamente cuando la vista es confirmada como activa y visible por el usuario.

### 4.4 Recuperación ante Fallos y Crash Granular
- Cada panel está protegido por un `ErrorBoundary` individual.
- Si un componente de terceros o un error de parseo de YAML genera una excepción no controlada en el panel derecho (detalles), el panel izquierdo (Kubetail) continúa operando sin interrupción.
- El panel fallido muestra una tarjeta de recuperación con opción de reintentar (`Reload panel`) sin necesidad de recargar la ventana de Lens.

---

## 5. Plan de Implementación Concreto para H1

El Hito H1 ("Infraestructura de docking y primer caso de uso en ventana principal") se estructura en 5 fases secuenciales:

### Fase 1: Capa de Tipos y Store de Layout
1. Crear `packages/core/src/renderer/components/split-panel/split-panel-types.ts` con las interfaces de `PanelDescriptor`, `SplitLayoutNode`, `PanelTabGroup` y `PanelRegistration`.
2. Crear `split-panel-store.ts` y su injectable MobX para manejar el estado reactivo del split (nodos, ratios, foco y selección).
3. Escribir pruebas unitarias iniciales para la manipulación y serialización del árbol de layout.

### Fase 2: Componente `SplitPanelLayout`
1. Implementar `split-panel-layout.tsx` soportando división horizontal con [`ResizingAnchor`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/layout/main-layout.tsx#L47).
2. Integrar límites de redimensionamiento (mínimo 250px o 20% del viewport) y persistencia del ratio en memoria reactiva.
3. Crear estilos en `split-panel.module.scss` consistentes con la paleta Midnight Graphite (`--graphite-*`).

### Fase 3: Wrapper y Desacople de Componentes (E1)
1. **Desacople de `Kubetail`:** Crear `KubetailPanel` que envuelva la vista de Kubetail para su consumo como panel con cabecera estandarizada.
2. **Desacople de `KubeObjectDetails`:** Crear `ResourceDetailsPanelContent` que renderice la ficha técnica del recurso K8s sin forzar la apertura del `Drawer` overlay lateral.
3. Implementar la sincronización bidireccional: al hacer clic en un recurso dentro de Kubetail o en la navegación, el panel derecho se actualiza automáticamente.

### Fase 4: Persistencia e Integración con `WorkspacePersistenceStore`
1. Extender el tipo [`WorkspaceLayout`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/common/workspace/workspace-types.ts#L106-L113) en `workspace-types.ts` para incorporar opcionalmente la estructura `splitLayout`.
2. Conectar la hidratación y guardado debounceado en [`WorkspacePersistenceStore`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/features/workspace-tabs/renderer/workspace-persistence-store.ts).
3. Validar la restauración inerte: al recargar, la ventana mantiene exactamente las dimensiones y recursos asignados a cada panel.

### Fase 5: Batería de Pruebas y Validación en macOS M4
1. Desarrollar suite de pruebas unitarias (`split-panel-layout.test.tsx` y `split-panel-store.test.ts`).
2. Validar que ninguna operación de split duplique conexiones hacia el backend de Kubernetes.
3. Verificar rendimiento y fluidez de redimensionamiento (60 FPS estables) en macOS Apple Silicon (M4).

---

## 6. Criterios de Aceptación para H1

- [ ] **CA-01 (Topología E1):** La ventana principal permite visualizar simultáneamente Kubetail Logs en el panel izquierdo y Detalles de Deployment en el panel derecho dentro del área de contenido.
- [ ] **CA-02 (Redimensión fluida):** El divisor central permite ajustar los anchos relativos suavemente mediante arrastre de mouse respetando límites mínimos y máximos.
- [ ] **CA-03 (Single-Connection):** Redimensionar el divisor no interrumpe el streaming de logs de Kubetail ni produce nuevas peticiones HTTP de reconexión.
- [ ] **CA-04 (Persistencia inerte):** La disposición y los recursos seleccionados se guardan localmente; al recargar la ventana, la UI se restaura idéntica sin filtrar credenciales en disco.
- [ ] **CA-05 (Aislamiento de fallos):** Un error inducido en el renderizado del panel de detalles no afecta el funcionamiento del visor de logs en el panel izquierdo.
- [ ] **CA-06 (Calidad de código):** Todas las pruebas unitarias nuevas pasan sin advertencias de TypeScript ni regresiones en las 138 pruebas del baseline.

---

## 7. Adenda técnica vinculante posterior a H0 (2026-11-01)

Esta adenda **matiza los diseños preliminares anteriores** a partir de la revisión real de código y el smoke de macOS. Ver también `H0_PANELES_AUDITORIA.md` §7.

### Decisiones y contratos corregidos para H1

1. **Motor de split:** se mantiene `LensSplitLayout` / `SplitPanelLayout` minimalista para **dos paneles internos en macOS**; sin dependencia adicional. La preservación de montaje **no se supone ni se garantiza a priori**: React key estables + separación vista/sesión + tests que comprueben que el cliente de logs no se detiene/reabre al arrastrar, reordenar, ocultar o cerrar otro panel. Para docking arbitrario en H2/H3, revaluar un motor mantenido antes de crecer el motor propio. Las comparaciones de peso y compatibilidad de librerías del H0 son estimaciones, no benchmarks medidos.
2. **Propiedad única de Kubetail:** hoy `KubetailPage.componentWillUnmount()` ejecuta `kubetailStore.stopAllStreams()`. Diseñar explícitamente **un dueño por sesión**, aislado por `clusterId + namespace + workload/uid + configuración de stream`, sin compartir un `KubetailStore` global accidentalmente entre varias instancias. Un segundo panel no debe duplicar streams ni el cierre de un panel detener otro. Documentar transferencia, suspensión y liberación idempotentes.
3. **Foco y atajos:** sustituir el listener global de Kubetail por un controlador restringido al panel activo, sin interceptar teclado en terminal, editor o búsqueda de otro panel. Probar foco al cambiar de grupo y pestaña.
4. **Detalles de recurso:** desacoplar del `Drawer` solo el contenido útil y su vínculo de recurso. Abrir Details en el split no debe provocar un segundo Drawer, modificar innecesariamente la URL de Kubetail ni crear watches duplicados.
5. **Guardado:** preservar `SessionSnapshotV1` y el adaptador efectivo de `WorkspacePersistenceStore` (normalmente `userData/lens-workspace-sessions.json` con permisos 0600; `localStorage` es fallback). Crear `splitLayout` opcional validado y migración hacia una nueva versión **solo si es necesaria** y compatible con lectura anterior. Evitar cualquier `customState` persistido sin esquema/allowlist. Probar datos corruptos, clústeres eliminados y rollback a vista clásica.
6. **Restauración inerte:** no alcanza con que el store de tabs no navegue; el montaje de un panel Kubetail puede activar `reaction` y streams. Mantener un flag de sesión `activationState: 'inert' | 'active'` (o contrato equivalente) y verificar que restaurar no realiza ninguna llamada a Kubernetes hasta activación explícita.
7. **Fallos:** `ErrorBoundary` cubre errores de render React, no un crash completo de Chromium, errores asíncronos ni conexiones perdidas. Cubrir esos casos por separado; no declarar aislamiento de proceso probado con una simulación de excepción React.
8. **Seguridad:** `PanelDescriptor.customState?: Record<string,unknown>` del borrador es demasiado permisivo para serializar directamente. Persistir únicamente metadatos públicos validados de la UI, sin credenciales, Secrets, YAML sensible ni contenido de logs; revisión de clusterId/namespace/UID antes de instanciar.
9. **Validación real:** la instancia Electron 45.2.0 examinada estaba operativa, pero `OPENLENS_DETACHED_TOOLS` y `--enable-detached-tools` no estaban habilitados. En H1 demostrar split y continuidad de logs con perfil macOS de laboratorio aislado; el E2E nativo detach/redock seguirá `NO PROBADO` hasta poder ensayarse con flag habilitado y sesión no sensible en H3. No forzar cambios al perfil o clúster activos.

### Modificaciones exigidas en la lista de CA de H1

- **CA-03 ampliado:** medir requests/streams reales antes, durante y después del resize/reordenamiento; verificar que no se corta Kubetail ni aparecen conexiones duplicadas. También cerrar Details y cambiar el foco.
- **CA-04 ampliado:** probar ambas rutas de persistencia existentes según disponibilidad, migración y corrupción; restaura *layout inerte* y **cero** requests/terminales a producción hasta autorización explícita.
- **CA-05 precisado:** el error de render en el panel derecho no arrastra el izquierdo; el crash de renderer se trata en un test separado de recuperación y no se presenta como protección de ErrorBoundary.
- **CA-06 ampliado:** tests de teclado y aislamiento, sin atajos globales cruzados, más suites existentes y comprobación de TypeScript.
- **CA-07 nuevo:** el usuario puede volver a la interfaz clásica con un feature flag sin perder sus workspaces actuales.
- **CA-08 nuevo:** evidencia en app real de macOS Apple Silicon (capturas + comprobación de streams/DOM), no aprobar por Jest solamente.

### Salida de H0

**GO técnico para implementar H1, con los requisitos anteriores incorporados.** Se han verificado 142/142 tests en 13 suites durante el repaso focalizado; el desacople nativo en vivo y el split nuevo aún no están probados. El GO de arquitectura **no** autoriza cambios en Kubernetes ni supone aceptación o release de H1.
