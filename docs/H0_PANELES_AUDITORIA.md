# H0: Auditoría de Línea Base e Inventario de Componentes para Paneles Flotantes y Workspaces

**Proyecto:** OpenLens DevOps  
**Repositorio:** `/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections`  
**Rama:** `feature/kubetail-native-integration`  
**Commit base:** `a007106` (`docs: roadmap for dockable panels and macOS-first validation`)  
**Fecha:** 2026-11-01  
**Plataforma principal de validación:** macOS Apple Silicon (Mac M4)

---

## 1. Estado Real del Repositorio y Entorno de Ejecución

### 1.1 Verificación de Entorno y Toolchain
- **Node.js:** `v22.22.0` (verificado vía `node -v` en entorno local macOS M4).
- **npm:** `10.9.4` (verificado vía `npm -v`).
- **Electron:** `45.2.0` (verificado en `package.json` raíz, `packages/core/package.json` y `open-lens/package.json`).
- **node-pty:** `1.1.0-beta34` (verificado en dependencias de producción de `packages/core`).
- **React:** `17.0.2` / `@types/react`: `^17.0.45`.
- **MobX:** `^6.9.0` / `mobx-react`: `^7.6.0`.
- **Inyección de dependencias:** `@ogre-tools/injectable` y `@ogre-tools/injectable-react`.

### 1.2 Estado de Git
- **Rama activa:** `feature/kubetail-native-integration`.
- **Historial de commits previos relevantes:**
  - `a007106` - docs: roadmap for dockable panels and macOS-first validation (HEAD)
  - `3ee21e7` - test(kubetail): complete production readiness validation
  - `10d5d56` - feat(kubetail): integrate native resource menus and cluster navigation
  - `c95ba8c` - feat(kubetail): implement milestone 3 native functional mvp
  - `303dbfc` - feat(kubetail): implement milestones 1 and 2 native integration poc and streaming
- **Archivos sin seguimiento preservados:**
  `.codebase-memory/`, `main.js`, `odd/`, `open-lens/lens.css`, `open-lens/scripts/`, `open-lens/static/branding/`, `splash.html`, `trayIcon*.png`.

---

## 2. Inventario de Componentes Existentes

### 2.1 Dock (`packages/core/src/renderer/components/dock/`)
- **Implementación:** [`Dock`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/dock/dock.tsx) (React + MobX observer) y [`DockStore`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/dock/dock/store.ts).
- **Puntos de anclaje visual:** Integrado en el footer de [`MainLayout`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/layout/main-layout.tsx).
- **Mecanismo de redimensionamiento:** Utiliza [`ResizingAnchor`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/dock/dock.tsx#L161) (`@openlens/resizing-anchor`) en dirección vertical (`ResizeDirection.VERTICAL`).
- **Tipos de pestaña soportados ([`TabKind`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/dock/dock/store.ts#L17-L24)):**
  - `terminal` ([`TerminalWindow`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/dock/terminal/view.tsx))
  - `create-resource` ([`CreateResource`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/dock/create-resource/view.tsx))
  - `edit-resource` ([`EditResource`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/dock/edit-resource/view.tsx))
  - `install-chart` ([`InstallChart`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/dock/install-chart/view.tsx))
  - `upgrade-chart` ([`UpgradeChart`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/dock/upgrade-chart/view.tsx))
  - `pod-logs` ([`LogsDockTab`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/dock/logs/view.tsx))
- **Limitación estructural:** El Dock es un contenedor único horizontal al pie de la ventana. No soporta división vertical (splits), ni columnas lado a lado, ni paneles anclados en zonas superiores/laterales sin modificar su contenedor de montaje.

### 2.2 Workspace Tabs (`packages/core/src/features/workspace-tabs/`)
- **Implementación:**
  - Common: [`WorkspaceHistoryManager`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/features/workspace-tabs/common/workspace-history.ts), tipos en [`types.ts`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/features/workspace-tabs/common/types.ts) y [`WorkspaceTabsFeatureFlag`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/features/workspace-tabs/common/workspace-tabs-feature-flag.injectable.ts).
  - Renderer: [`WorkspacePersistenceStore`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/features/workspace-tabs/renderer/workspace-persistence-store.ts), [`WorkspaceTabsStore`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/features/workspace-tabs/renderer/workspace-tabs-store.ts) y [`WorkspaceTabBar`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/features/workspace-tabs/renderer/workspace-tab-bar.tsx).
- **Modelo de datos ([`SessionSnapshotV1`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/common/workspace/workspace-types.ts#L137-L144)):**
  - Maneja múltiples workspaces lógicos (hasta 30).
  - Soporta estructura [`WorkspaceLayout`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/common/workspace/workspace-types.ts#L106-L113) con `splitDirection` (`horizontal` | `vertical`), `dockHeight`, `dockOpen`, y tabs tipadas (`WorkspaceTab`).
  - Almacena estado en almacenamiento local seguro (`workspace-session-storage.ts`).
- **Feature Flag:** Controlado por `--disable-workspace-tabs` / `--enable-workspace-tabs`, variable de entorno `OPENLENS_WORKSPACE_TABS` y almacenamiento local (`openlens:workspace-tabs`).

### 2.3 Detached Tool Windows (`packages/core/src/main/detached-tool-windows/`)
- **Implementación:**
  - [`openDetachedToolWindowInjectable`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/main/detached-tool-windows/open-detached-tool-window.injectable.ts): instancia `BrowserWindow` con aislamiento completo: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `session: session.fromPartition("openlens-detached-tools")`.
  - [`DetachedToolSessionManager`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/main/detached-tool-windows/detached-tool-session-manager.ts): gestiona las sesiones de streaming en el proceso Main. El proceso renderer externo solo recibe datos sanitizados vía IPC; no tiene acceso directo a credenciales, kubeconfig ni al proxy K8s.
  - [`DetachedWindowRegistry`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/main/detached-tool-windows/detached-window-registry.ts): mapa en memoria de ventanas autorizadas, sus descriptores y límites de sesión.
  - Submódulo terminal ([`detached-terminal-manager.ts`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/main/detached-tool-windows/terminal/detached-terminal-manager.ts)): puente de PTY para terminales desacopladas con advertencia de producción (`confirm-production-terminal-detach`).
- **Seguridad y Redacción:** Incluye redacción estricta de Secrets K8s (`redactForInspector`) eliminando `managedFields` y enmascarando `data`/`stringData` como `<redacted>`.

### 2.4 Kubetail Nativo (`packages/core/src/renderer/components/kubetail/`)
- **Implementación:**
  - [`KubetailPage`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/kubetail/kubetail-page.tsx): vista central React integrada como ruta nativa (`kubetail-route-component.injectable.ts`).
  - [`KubetailStore`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/kubetail/kubetail-store.ts): gestión de multiplexación de streams, buffers circulares de logs con límite de 50.000 líneas, deduplicación por clave compuesta y filtros activos.
  - [`kubetailStreamClientInjectable`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/kubetail/kubetail-stream-client.injectable.ts): cliente HTTP streaming contra el proxy local de Lens con reconexión exponencial y backoff.
- **Estado de pruebas:** 73 pruebas pasando al 100% (Hito 5 completado y validado).

### 2.5 Resource Details y Drawer (`packages/core/src/renderer/components/kube-object-details/`)
- **Implementación:**
  - [`KubeObjectDetails`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/kube-object-details/kube-object-details.tsx): renderiza detalles de objetos de Kubernetes (Deployment, Pod, StatefulSet, etc.) dentro de un componente [`Drawer`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/drawer/drawer.tsx).
  - [`Drawer`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/drawer/drawer.tsx): overlay deslizante anclado al margen derecho del cluster frame con `ResizingAnchor` horizontal (redimensionable de 300px hasta 90% del ancho de ventana).
  - Suscripción y watch: [`currentKubeObjectInDetailsInjectable`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/kube-object-details/current-kube-object-in-details.injectable.ts) se acopla a [`kubeWatchApi`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/kube-watch-api/kube-watch-api.ts) y almacena parámetros en la URL (`kube-detail-params`).

### 2.6 Cluster Manager y Frames (`packages/core/src/renderer/components/cluster-manager/`)
- **Implementación:**
  - [`ClusterFrameHandler`](file:///Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections/packages/core/src/renderer/components/cluster-manager/cluster-frame-handler.ts): orquestador de `iframe` por cada clúster conectado en `#lens-views`.
  - Mantiene exactamente **un iframe por clusterId** en memoria, alternando visibilidad mediante la clase `.hidden` sin desmontar el árbol React ni destruir los sockets/watchers activos.
  - Dispone de fallback timer (1500 ms) para evitar memory leaks si Chromium no dispara el evento `load` al navegar a `about:blank`.

---

## 3. Funcionalidades Reutilizables vs. Componentes a Adaptar

| Componente | Estado Actual | ¿Reutilizable Directamente? | Adaptación Requerida para Paneles Flotantes / Workspaces |
| :--- | :--- | :--- | :--- |
| **`@openlens/resizing-anchor`** | Paquete interno de redimensionamiento | **Sí (100%)** | Soporta orientación horizontal y vertical con límites mínimos/máximos. Ya probado en Dock, Drawer y MainLayout. |
| **`WorkspacePersistenceStore`** | Persistencia de sesiones en localStorage | **Sí (80%)** | El esquema `WorkspaceLayout` ya prevé `tabs`, `splitDirection` y `dockHeight`. Debe extenderse para persistir árboles de split (nodos izquierdo/derecho o paneles multi-dock). |
| **`DetachedToolSessionManager`** | Proceso Main para ventanas desacopladas | **Sí (70%)** | Excelente base para desacoplar a ventanas OS externas (`BrowserWindow`). No se utiliza para splits internos en la misma ventana, pero es el estándar para Popouts en H3/H4. |
| **`KubetailPage` / `KubetailStore`** | Vista y store nativo de logs | **Sí (85%)** | Diseñado como página completa (`currentRouteComponent`). Debe extraerse/envolverse para poder instanciarse dentro de un contenedor de panel modular sin depender de la ruta activa global de React Router. |
| **`KubeObjectDetails`** | Detalles de recurso K8s | **Parcial (50%)** | Hoy está fuertemente atado al componente visual `Drawer` (overlay flotante a la derecha) y a los query params de la URL (`?details=...`). Requiere un wrapper desacoplado que permita renderizar el contenido de detalles en un panel estático o docked. |
| **`MainLayout`** | Contenedor principal de vistas | **A Adaptar (60%)** | Disposición fija: `Sidebar` (izq), `Contents` (centro), `Footer/Dock` (abajo). Necesita un slot de renderizado que aloje el layout dinámico de paneles (Split/Docking Grid) en el área de contenido. |
| **`Dock`** | Barra de herramientas inferior | **A Conservar/Extender** | Debe seguir existiendo como dock inferior estándar para terminales rápidas y creación de recursos, pero sus vistas deben poder promoverse o moverse a paneles del workspace. |

---

## 4. Limitaciones Arquitectónicas Identificadas

1. **Aislamiento por `iframe` en `ClusterFrameHandler`:**
   - Cada clúster corre en su propio iframe aislado (`/cluster/:clusterId`).
   - Los paneles no pueden cruzar libremente contextos de clúster dentro del mismo frame. Cualquier docking dentro de un cluster frame está acotado estrictamente al clúster correspondiente.
   - Si se requiere una vista comparativa multi-clúster (ej. Prod vs Stage), debe resolverse a nivel del frame raíz (`RootFrame`) o coordinarse mediante IPC en Main, nunca compartiendo reactividad MobX o stores de renderer entre iframes.
2. **Dependencia de `react-router` en `currentRouteComponent`:**
   - La navegación actual asume una única página activa en el centro del layout.
   - Para tener Kubetail a la izquierda y Resource Details a la derecha de forma permanente y simultánea, el área central no puede depender exclusivamente del `currentRouteComponent` singular. Debe haber un contenedor de split (`SplitPanelLayout`) que mantenga los dos componentes montados concurrentemente.
3. **Acoplamiento de `KubeObjectDetails` con `Drawer` y URL:**
   - Abrir los detalles de un pod o deployment altera la URL con parámetros codificados (`location.search`).
   - Al cerrar el drawer o navegar, el watcher se cancela. Si los detalles se muestran en un panel fijo a la derecha, la selección debe poder conducirse tanto por URL como por eventos de selección internos de panel sin interferir con la navegación de Kubetail a la izquierda.
4. **Ciclo de vida de watchers y streams (Anti-Duplicación):**
   - Redimensionar o reacomodar un panel en el árbol DOM nunca debe provocar desmontaje (`unmount`) y remontaje (`mount`) de React. Un remontaje accidental provocaría que Kubetail aborte la conexión HTTP y abra una nueva, saturando el API server de Kubernetes y generando parpadeo en la UI.

---

## 5. Estado de Pruebas Automatizadas Existentes

Se ejecutaron las suites de pruebas unitarias relevantes en `packages/core` para verificar la estabilidad de los subsistemas base:

| Suite de Pruebas | Archivo | Pruebas | Estado | Tiempo |
| :--- | :--- | :---: | :---: | :---: |
| **Detached Window Registry** | `src/main/detached-tool-windows/__tests__/detached-window-registry.test.ts` | 22 | **PASS** | 0.91 s |
| **Detached Tool Session Manager** | `src/main/detached-tool-windows/__tests__/detached-tool-session-manager.test.ts` | 35 | **PASS** | 0.63 s |
| **Cluster Frame Stability** | `src/renderer/components/cluster-manager/__tests__/cluster-frame-handler-stability.test.ts` | 6 | **PASS** | 0.85 s |
| **Cluster Frame Isolation** | `src/features/workspace-tabs/renderer/__tests__/cluster-frame-handler-isolation.test.ts` | 2 | **PASS** | 0.33 s |
| **Kubetail Native Core** | `src/renderer/components/kubetail/__tests__/` (módulo completo) | 73 | **PASS** | ~3.5 s |

**Total de pruebas ejecutadas directamente en H0:** 138 pruebas unitarias pasando al 100%.

---

## 6. Distinción: Verificado en Ejecución vs. Inspección Estática

### Verificado en Ejecución (Runtime / Tests Reales)
- El compilador de TypeScript compila limpiamente los módulos auditados.
- Las suites de Jest ejecutan y validan:
  - Registro, validación de descriptores, single-ownership y descarte de ventanas stale en `DetachedWindowRegistry`.
  - Aislamiento de sesiones de streaming, redacción de Secrets, control de rate limiting y ciclo de vida de streams en `DetachedToolSessionManager`.
  - Unicidad de iframes y switching limpio sin destrucción de DOM en `ClusterFrameHandler`.
  - Ingesta, buffer circular, deduplicación y resiliencia de streaming en `KubetailStore`.
- Versiones de Node (`v22.22.0`), npm (`10.9.4`), Electron (`45.2.0`) y node-pty (`1.1.0-beta34`) corroboradas en el entorno local macOS Apple Silicon.

### Conocido por Inspección Estática de Código
- La estructura de composición en `MainLayout` y cómo el `ResizingAnchor` maneja el arrastre del mouse.
- El acoplamiento entre `Drawer` y `KubeObjectDetails` que requiere desacoplar el componente de detalle para su uso en paneles regulares.
- La serialización JSON en `WorkspacePersistenceStore` y la necesidad de extender `WorkspaceLayout` para soportar estructuras de árbol de división (split trees).

---

## 7. Revisión independiente de cierre H0 (2026-11-01)

**Método:** inspección de los dos documentos H0, código actual y ventana Electron de desarrollo conectada por DevTools, más ejecución focalizada de Jest en la Mac M4. Esta sección prevalece sobre cualquier conclusión más amplia no verificada en las secciones anteriores.

### Verificaciones efectuadas

| Comprobación | Evidencia / resultado | Estado |
| --- | --- | --- |
| Rama y base | `feature/kubetail-native-integration`, HEAD `a007106`; documentos H0 sin seguimiento; archivos ajenos preservados | PASS |
| Electron de desarrollo | Proceso Electron 45.2.0 abierto y cluster frame funcional en macOS; DevTools identificó UI activa, con pestañas de Dock visibles | PASS (smoke de UI, sin interacción de escritura) |
| Suites focalizadas | Comando Jest de 13 suites: **142/142 tests PASS**; abarca Kubetail, `DetachedToolSessionManager`, `DetachedWindowRegistry`, `ClusterFrameHandler` y `WorkspacePersistenceStore` | PASS (tests unitarios; no E2E nativo) |
| Mecanismo de ventanas separadas | Existe y está protegido por flag `--enable-detached-tools` o `OPENLENS_DETACHED_TOOLS=1`; ambos ausentes en el proceso Electron observado | CONFIRMADO EN CÓDIGO; interacción de desacople/reacople **NO PROBADA** en el proceso actual |
| Kubetail lifecycle | `KubetailPage.componentWillUnmount()` llama a `kubetailStore.stopAllStreams()`, elimina la subscripción y listener de teclas globales; además registra `window.addEventListener('keydown', ...)` | RIESGO CONFIRMADO PARA H1 |
| Persistencia de workspace | `WorkspacePersistenceStore` utiliza normalmente **`FileWorkspaceSessionStorageAdapter`** en `userData/lens-workspace-sessions.json` con archivo `0600`; `LocalStorageWorkspaceSessionStorageAdapter` es fallback. `SessionSnapshotV1` contiene `WorkspaceLayout` plano. | CONFIRMADO EN CÓDIGO |
| Prueba de split/redock real en Electron | No existe todavía un layout H1; el desacople está desactivado en la instancia actual. No se reinició la app ni se tocaron sesiones/credenciales para forzar una prueba. | NO PROBADO; **gate obligatorio en H1** |
| Verificación limpia de TypeScript global | En esta revisión no se ejecutó `tsc` del monorepo ni compilación completa; las suites Jest no sustituyen esa verificación. | NO PROBADO en esta pasada |

**Importante:** las 138 pruebas informadas originalmente por Gemini representan su selección anterior; las **142/142** anteriores son la ejecución propia verificable de esta pasada (13 suites, incluyendo pruebas adicionales de persistencia). No extrapolar esto a cobertura total ni a estabilidad del binario empaquetado.

### Riesgos concretos que deben entrar en H1

1. **Ownership del streaming:** el desmontaje de `KubetailPage` corta *todos* los streams del `KubetailStore` asociado. Se exige evitar montajes múltiples accidentales, duplicados entre ruta y panel, y paradas globales por cerrar un panel. Separar ciclo de vida de la vista de la sesión, o garantizar un único dueño inequívoco con pruebas de ruta ↔ panel, cierre y cambio de clúster. El resize por sí solo puede preservar el montaje, pero **no** garantiza esa propiedad al reordenar/cerrar.
2. **Atajos con varios paneles:** los listeners de teclado globales de Kubetail pueden interceptar eventos destinados a terminales, editores y otros paneles. Limitar su ámbito al panel enfocado y probar teclas `Space`, `/`, `p`, `c`, `Cmd/Ctrl+F` y `Cmd/Ctrl+K`.
3. **Persistencia versionada y sin datos sensibles:** extender el esquema con validación estricta y migración no destructiva usando el **adaptador de almacenamiento efectivo**; no introducir `customState` arbitrario persistible. Usar allowlist para IDs, nombres de recursos y ratios; ningún token, secreto, valor de YAML, log o comando.
4. **Hidratación inerte real:** el almacenamiento actual restaura descriptores sin navegar, pero montar Kubetail con ruta/selección restaurada puede disparar streaming por sus reacciones. Implementar un permiso explícito de activación y testear cero requests Kubernetes en restauración inerte.
5. **Separar estado del recurso y Drawer:** el panel Details necesita un contrato propio de selección por recurso y no debe reescribir URLs/abrir otro Drawer por accidente. No asumir que leer desde el store equivale a cero watchers adicionales; medirlos.
6. **ErrorBoundary:** protege errores de renderizado React, **no** crashes del proceso renderer ni errores asíncronos o de red. Esos escenarios requieren manejo distinto en H1/H5.
7. **Validación visual obligatoria:** el primer build H1 debe probar en macOS real split, resize, foco, cierre, retorno al layout clásico y ausencia de duplicados con contadores observables. Si el feature flag de ventanas desacopladas sigue OFF, marcar su E2E nativo como pendiente para H3, no PASS.

### Veredicto de cierre

**H0 — documentación y selección arquitectónica: COMPLETADO CON OBSERVACIONES.** No se desarrolló código H1 y las suites focalizadas pasan. **Desacople nativo en vivo: NO PROBADO** en esta sesión; no es un motivo para fingir que se validó. La arquitectura puede pasar a H1 si los siete riesgos se convierten en tests/criterios explícitos; H1 no puede darse por cerrado sin pruebas reales en macOS. No ejecutar acciones de Kubernetes ni modificar perfil activo para completar la prueba faltante.
