# OpenLens DevOps — Matriz de Auditoría Integral R8/R9 (Hito 0)

**Fecha:** 2026-10-24  
**Auditor / Arquitecto Principal:** Gustavo Marcon  
**Rama:** `feat/r7-09-consolidation`  
**Commit de Auditoría (HEAD):** `5ab3092`  
**Commit Base de Código:** `b73122b` / `78b35d9`  
**Artefacto Auditado:** `releases/R9-RC/OpenLens DevOps.app` (macOS arm64)  
**Roadmap de Referencia:** `docs/revival/POST_R9_STABILITY_VISUAL_ROADMAP.md`  
**Referencia Oficial Lens:** `/Applications/Lens.app` (v2026.10.121159-latest, Electron 44.4.2) y `Documents/lens-app/`  

---

## 1. Baseline Técnico del Proyecto

| Dimensión | Especificación / Valor Observado | Estado de Verificación |
|---|---|---|
| **Rama Git** | `feat/r7-09-consolidation` | Verificado (`git status`) |
| **Commit HEAD** | `5ab3092` (*docs: plan full R8 R9 stability and visual parity audit*) | Verificado (`git log -n 5`) |
| **Commit Base de Código** | `b73122b` (*chore(r9): close out signed RC hashes and targeted validation*) | Verificado (`BUILD_INFO.txt`) |
| **Estado del Árbol Git** | Limpio (archivos sin seguimiento: `.codegraph/`, enlace `node_modules`) | Verificado (sin cambios pendientes) |
| **Versión de Electron** | `22.3.10` (devDependencies en `open-lens/package.json`), target empaquetador `22.3.3` | Verificado |
| **Versión de React** | `17.0.2` (forzada vía `overrides` en root `package.json`) | Verificado |
| **Versión de TypeScript** | `4.9.5` (global en `open-lens` y `packages/*`) | Verificado |
| **Gestor de Estado** | MobX `6.9.0`, `mobx-react` `7.6.0`, `@ogre-tools/injectable` `16.1.0` | Verificado |
| **Librería de Componentes UI** | `@material-ui/core` `^4.12.3`, SCSS Modules, Tailwind `3.3.2` | Verificado |
| **Artefacto Ejecutable** | `releases/R9-RC/OpenLens DevOps.app` (macOS arm64, ~400 MB) | Presente |
| **SHA-256 Ejecutable Principal** | `6e9f9305df394e8cc0119fa0b74980571aa964839f4798f7f2192c9bb5ad042f` | Verificado en manifest |
| **SHA-256 app.asar** | `dfc9910d7fa407551fd31850f625c0c3866c3d3ebd4a84c0af5fcdfeeb4945d3` | Verificado en manifest |
| **Firma de Código macOS** | Apple Development (`codesign --verify --deep --strict` PASS) | Verificado en manifest |
| **Pruebas Automatizadas Existentes** | 13 suites Jest focalizadas (~42-73 pruebas unitarias R8/R9) | Verificado en suites Jest |
| **Pruebas E2E Electron R8/R9** | **CERO pruebas E2E funcionales reales ejecutadas sobre el binario R9-RC** | **NO PROBADO** (Déficit crítico) |

---

## 2. Matriz Exhaustiva de Auditoría R8 y R9

> **Regla de integridad:** Estados permitidos: `PASS` / `FAIL` / `NO PROBADO` / `BLOQUEADO`.  
> No se certifica `PASS` en componentes cuya integración end-to-end o visual en runtime no cuente con evidencia reproducible.

| ID Hito | Funcionalidad | Archivos Involucrados | Dependencias Clave | Pruebas Existentes | Pruebas Faltantes | Riesgos Identificados | Severidad | Estado Verificación | Evidencia Disponible |
|---|---|---|---|---|---|---|---|---|---|
| **R8-01** | **Exportación CSV, JSON y Portapapeles** | `packages/core/src/renderer/utils/csv/csv-builder.ts`<br>`packages/core/src/renderer/components/kube-object-list-layout/kube-csv-extractor.ts`<br>`packages/core/src/renderer/components/kube-object-list-layout/csv-export-dialog.tsx`<br>`csv-export-dialog.module.scss` | `@openlens/utilities`<br>React 17<br>MobX 6<br>Electron IPC | `csv-builder.test.ts`<br>`kube-csv-extractor.test.ts`<br>`csv-export-dialog.test.tsx` (5 suites / 35 tests) | • Exportación de 10.000+ filas en Electron real.<br>• Interacción real con `navigator.clipboard` en renderer.<br>• Prueba E2E de guardado vía `dialog.showSaveDialog`. | • Bloqueo síncrono del hilo de renderizado al procesar grandes volúmenes de datos.<br>• Sanitización incompleta de caracteres de control especiales (`\t`, `\r`) frente a CSV injection. | **MEDIUM** | **PASS (Unitario)** /<br>**NO PROBADO (E2E)** | `csv-builder.test.ts`<br>`R8_CERTIFICATION.md` |
| **R8-02** | **Gateway API Nativo (K8s 1.28+)** | `packages/core/src/common/k8s-api/endpoints/gateway.api.ts`<br>`packages/core/src/common/k8s-api/endpoints/gateway-class.api.injectable.ts`<br>`packages/core/src/renderer/components/network-gateways/gateway-store.ts`<br>`packages/core/src/renderer/components/network-gateways/gateways.tsx`<br>`gateways.scss` | `gateway.networking.k8s.io`<br>`@openlens/kube-object`<br>KubeWatchApi | `r8-02-gateway-api.test.ts`<br>`gateways.test.tsx` (3 suites / 17 tests) | • E2E en clúster real con CRDs Gateway API v1.<br>• Manejo de cluster sin CRDs instaladas (validación mensaje 404).<br>• Navegación entre las 6 pestañas de recursos. | • Si las CRDs no existen en el clúster, watchers pueden generar bucles de polling 404 y saturar logs.<br>• Degradación de rendimiento con gran número de HTTPRoutes. | **HIGH** | **PASS (Unitario)** /<br>**NO PROBADO (Cluster)** | `r8-02-gateway-api.test.ts`<br>`R8_CERTIFICATION.md` |
| **R8-03** | **Políticas de Admisión CEL** | `packages/core/src/common/k8s-api/endpoints/validating-admission-policy.api.ts`<br>`packages/core/src/common/k8s-api/endpoints/mutating-admission-policy.api.injectable.ts`<br>`packages/core/src/renderer/components/config-validating-admission-policies/validating-admission-policies.tsx` | `admissionregistration.k8s.io`<br>Kubernetes 1.28–1.30+ | `r8-03-mutating-admission-policies.test.ts`<br>`validating-admission-policies.test.tsx` (3 suites / 13 tests) | • Auditoría interactiva de expresiones CEL en runtime.<br>• Validación de fallback en clústeres K8s < 1.28.<br>• Manejo de errores de sintaxis en expresiones CEL. | • Incompatibilidad en clústeres antiguos que no tienen habilitado el feature gate CEL.<br>• Formateo defectuoso de expresiones multilinea complejas. | **MEDIUM** | **PASS (Unitario)** /<br>**NO PROBADO (Cluster)** | `r8-03-mutating-admission-policies.test.ts`<br>`R8_CERTIFICATION.md` |
| **R8-04** | **Dynamic Resource Allocation (DRA)** | `packages/core/src/common/k8s-api/endpoints/resource-dra.api.ts`<br>`packages/core/src/renderer/components/cluster-dra/dra.tsx`<br>`packages/core/src/renderer/components/cluster-dra/dra.scss` | `resource.k8s.io`<br>K8s 1.28+ Alpha/Beta APIs | `r8-04-dra.test.ts`<br>`dra.test.tsx` (3 suites / 14 tests) | • Asignación real de aceleradores/GPU en clúster con DRA.<br>• Visualización de DeviceClasses y ResourceClaims vinculados a Pods. | • Inestabilidad en la API de K8s (`v1alpha2` vs `v1alpha3` vs `v1beta1`) provocando fallos de deserialización en clústeres modernos. | **MEDIUM** | **PASS (Unitario)** /<br>**NO PROBADO (Cluster)** | `r8-04-dra.test.ts`<br>`R8_CERTIFICATION.md` |
| **R8-05** | **Kube Applications (Agrupación de Workloads)** | `packages/core/src/common/k8s-api/endpoints/logical-application.ts`<br>`packages/core/src/renderer/components/applications-and-security/applications.tsx`<br>`applications.scss` | Store de Pods, Deployments, StatefulSets, DaemonSets, Services, Ingresses | `r8-05-kube-applications.test.ts`<br>`applications.test.tsx` (3 suites / 11 tests) | • Prueba de estrés con 200+ aplicaciones lógicas y 2.000+ pods.<br>• Reactividad ante escalado rápido de réplicas.<br>• Agrupación correcta con etiquetas Helm no estándar. | • **Alto consumo de memoria y CPU**: suscribir 6 stores simultáneamente en el renderer satura el event loop y provoca microcongelamientos. | **HIGH** | **PASS (Unitario)** /<br>**NO PROBADO (Escala)** | `r8-05-kube-applications.test.ts`<br>`R8_CERTIFICATION.md` |
| **R8-06** | **Demo Cluster Simulado Local** | `packages/core/src/main/demo-cluster/demo-cluster-server.ts`<br>`packages/core/src/main/demo-cluster/demo-cluster-manager.ts`<br>`packages/core/src/renderer/components/welcome/*` | Node `http`, `net`, loopback `127.0.0.1`, Electron IPC | `demo-cluster-server.test.ts`<br>`r8-06-welcome-demo-cluster.test.tsx` (3 suites / 14 tests) | • E2E completo: clic en "Launch Demo Cluster" desde Welcome en Electron real.<br>• Verificación de cierre limpio del servidor HTTP al salir.<br>• Prueba de denegación de mutaciones (403 Forbidden). | • Servidor HTTP huérfano si Electron sufre un cierre abrupto.<br>• Bloqueo en loopback si el puerto dinámico choca con firewalls locales. | **MEDIUM** | **PASS (Unitario)** /<br>**NO PROBADO (Electron E2E)** | `demo-cluster-server.test.ts`<br>`R8_CERTIFICATION.md` |
| **R8-07** | **Consolidación y Empaquetado R8** | Scripts de build, configuraciones Webpack de producción, Webpack 5. | Lerna, Electron Builder | Compilación Webpack y empaquetado ASAR. | • Smoke test funcional de instalación en sistema limpio.<br>• Verificación de arranque sin clústeres previos. | • Dependencias nativas desalineadas con la versión de Node interna de Electron. | **LOW** | **PASS (Empaquetado)** | `releases/R8-RC/`<br>`R8_CERTIFICATION.md` |
| **R9-01** | **Auto-fit y Redimensionamiento de Columnas** | `packages/core/src/renderer/components/table/table-cell.tsx`<br>`packages/core/src/renderer/components/table/table.tsx`<br>`packages/core/src/renderer/components/table/table-model/table-model.ts`<br>`packages/core/src/renderer/components/item-object-list/content.tsx` | `@openlens/utilities`<br>MobX `TableModel`<br>`createStorage` | `table-autofit-resizer.test.tsx` (1 suite / 6 tests) | • Interacción de arrastre en Electron real con Playwright.<br>• Comportamiento con tablas virtualizadas (`scrollWidth` en filas offscreen).<br>• Persistencia al reiniciar la app y cambiar de cluster. | • **Lag / Stuttering:** `onResize` se invoca en cada pixel de `mousemove`, forzando mutación en MobX y re-renderizado síncrono.<br>• `querySelectorAll` solo evalúa celdas en el DOM visible. | **HIGH** | **PASS (Unitario)** /<br>**NO PROBADO (E2E)** | `table-autofit-resizer.test.tsx`<br>`R9_CERTIFICATION.md` |
| **R9-02** | **Reordenamiento de Columnas (Drag-and-Drop)** | `packages/core/src/renderer/components/table/table-cell.tsx`<br>`packages/core/src/renderer/components/item-object-list/content.tsx`<br>`packages/core/src/renderer/components/table/table-model/table-model.ts` | HTML5 Drag & Drop API<br>MobX `TableModel` | `table-column-reordering.test.tsx` (1 suite / 5 tests) | • DND interactivo en Electron real con puntero de mouse.<br>• Persistencia del orden tras recargar la vista.<br>• Sincronización entre encabezados y celdas de datos con columnas agrupadas. | • En Chromium/Electron, los eventos `dragend`/`drop` pueden perderse si el cursor sale del viewport, dejando artefactos visuales (`drop-target-left`). | **MEDIUM** | **PASS (Unitario)** /<br>**NO PROBADO (E2E)** | `table-column-reordering.test.tsx`<br>`R9_CERTIFICATION.md` |
| **R9-03** | **Filtros por Columna en Cabecera** | `packages/core/src/renderer/components/table/column-filter-popover.tsx`<br>`packages/core/src/renderer/components/table/column-filter-popover.scss`<br>`packages/core/src/renderer/components/item-object-list/content.tsx`<br>`packages/core/src/renderer/components/item-object-list/list-layout.tsx` | Material-UI Popover/Menu<br>`PageFiltersStore`<br>`FilterType.COLUMN` | `column-filter-popover.test.tsx` (1 suite / 6 tests) | • Apertura interactiva del popover en Electron real.<br>• Filtrado simultáneo de múltiples columnas combinadas.<br>• Popover con listas de 500+ valores únicos (ej. IPs o nodos). | • Sobrecarga de cálculo de valores distintos (`getDistinctColumnValues`) sin memoización en cada render.<br>• Desborde visual/corte del popover en resoluciones bajas. | **MEDIUM** | **PASS (Unitario)** /<br>**NO PROBADO (E2E)** | `column-filter-popover.test.tsx`<br>`R9_CERTIFICATION.md` |
| **R9-04** | **Workload Insights Summary Bar** | `packages/core/src/renderer/components/kube-object-list-layout/workload-insights-bar.tsx`<br>`packages/core/src/renderer/components/kube-object-list-layout/workload-insights-bar.scss`<br>`packages/core/src/renderer/components/kube-object-list-layout/kube-object-list-layout.tsx` | React 17<br>MobX observer<br>KubeObject | `workload-insights-bar.test.tsx` (1 suite / 4 tests) | • Clic en tarjeta "Degraded" aplicando filtro en la tabla.<br>• Comportamiento visual responsivo en anchos < 1200px.<br>• Métricas en tiempo real durante fallos de pods masivos. | • Cálculos reactivos de salud ejecutados en el hilo principal durante tormentas de eventos K8s.<br>• Ruptura de layout si las tarjetas colapsan en pantallas estrechas. | **MEDIUM** | **PASS (Unitario)** /<br>**NO PROBADO (E2E)** | `workload-insights-bar.test.tsx`<br>`R9_CERTIFICATION.md` |
| **R9-05** | **Packaging y Artefacto ASAR R9** | `open-lens/package.json`<br>Configuración Electron Builder<br>Scripts de notarización macOS | Electron Builder `23.6.0`<br>Electron `22.3.10` | Webpack 5 production build PASS<br>Codesign verify PASS | • Instalación limpia en macOS sin herramientas de desarrollo instaladas.<br>• Prueba de permisos de sandbox / hardened runtime en macOS Sonoma/Sequoia. | • Binario empaquetado contiene advertencias de require dinámico (`keyv` / `cacheable-request`).<br>• Dependencias nativas sin verificar en plataformas no ARM64. | **HIGH** | **PASS (Empaquetado)** /<br>**NO PROBADO (Clean OS)** | `releases/R9-RC/`<br>`BUILD_INFO.txt` |
| **R9-06** | **Temas Oficiales Lens (Dark / Light)** | `packages/core/src/renderer/themes/lens-official-dark.injectable.ts`<br>`packages/core/src/renderer/themes/lens-official-light.injectable.ts`<br>`packages/core/src/renderer/themes/themes.injectable.ts` | Sistema de temas `@openlens/core`<br>Escala neutral 9 niveles | `lens-official-themes.test.ts` (1 suite / 6 tests) | • Selección interactiva en Preferences -> Appearance.<br>• Contraste WCAG AA en modo claro en todos los controles.<br>• Sincronización de tema en ventanas desacopladas (detached terminal/logs). | • Deficiencias de legibilidad en modales y drawers en tema claro.<br>• Inconsistencias de sintaxis en Monaco Editor al alternar temas. | **MEDIUM** | **PASS (Unitario)** /<br>**NO PROBADO (Visual)** | `lens-official-themes.test.ts`<br>`R9_CERTIFICATION.md` |
| **R9-07** | **Midnight Graphite Design System Fusion** | `packages/core/src/renderer/themes/midnight-graphite.injectable.ts`<br>`packages/core/src/renderer/components/midnight-graphite.scss`<br>`packages/core/src/common/vars.ts`<br>`packages/core/src/renderer/themes/lens-dark.injectable.ts` | Sistema de temas `@openlens/core`<br>Guardas de seguridad PROD | `midnight-graphite.test.ts` (1 suite / 5 tests) | • Arranque inicial limpio (perfil nuevo) en Midnight Graphite.<br>• Respeto de colores de entorno (PROD = rojo no negociable).<br>• Ausencia de flash visual de otro tema durante el boot. | • **CRÍTICO: BUG EN CONFIGURACIÓN DE INICIO:** `vars.ts` declara `defaultThemeId = "lens-dark"`; `lens-dark.injectable.ts` tiene `isDefault: true`, mientras que `midnight-graphite.injectable.ts` tiene `isDefault: false`. La app limpia **NO arranca en Midnight Graphite**. | **CRITICAL** | **FAIL (Defecto en Código de Inicio)** | `packages/core/src/common/vars.ts:9`<br>`midnight-graphite.injectable.ts:48` |
| **R9-08** | **Tipografía y Escala Oficial Lens** | `packages/core/src/renderer/fonts/OpenSans-VariableFont.ttf`<br>`packages/core/src/renderer/fonts/OpenSans-Italic-VariableFont.ttf`<br>`packages/core/src/renderer/components/fonts.scss`<br>`packages/core/src/renderer/components/app.scss`<br>`packages/core/src/renderer/components/tokens.scss` | Archivos Open Sans TTF<br>Variables CSS en `:root`<br>Material-UI Typography | `typography-tokens.test.ts` (1 suite / 6 tests) | • Medición con `window.getComputedStyle` en Electron real para sidebar, celdas de tabla, modales y botones.<br>• Verificación de que `document.fonts.check()` devuelve true para Open Sans.<br>• Detección de fuentes Roboto residuales en componentes Material-UI. | • **Divergencia visual oculta:** Las pruebas existentes solo verifican la existencia de variables SCSS y headers de los archivos TTF. Los componentes Material-UI suelen inyectar Roboto en estilos en línea, anulando `--font-primary`. | **HIGH** | **PASS (Estático)** /<br>**NO PROBADO (Runtime)** | `typography-tokens.test.ts`<br>`R9_CERTIFICATION.md` |
| **R9-09** | **Correcciones de Congelamientos y Screen Lock** | `packages/core/src/renderer/components/cluster-manager/cluster-frame-handler.ts`<br>`packages/core/src/renderer/components/cluster-manager/__tests__/cluster-frame-handler-stability.test.ts`<br>`packages/core/src/features/workspace-tabs/renderer/workspace-tab-bar.tsx` | Electron Iframes<br>MobX `when()`<br>ResizeObserver | `cluster-frame-handler-stability.test.ts` (1 suite / 4 tests) | • Prueba de estrés con 5+ clústeres alternando rápidamente.<br>• Recuperación de congelamiento tras bloqueo de pantalla de macOS.<br>• Medición de consumo de RAM tras 60 minutos de sesión activa.<br>• Detección de iframes zombi en el DOM `#lens-views`. | • **Riesgo Crítico de Iframe Leak:** En `cluster-frame-handler.ts:101`, se asigna `iframe.src = ""` y se espera el evento `load` para remover el iframe. Si Electron no emite `load` en un iframe vacío, el nodo jamás se remueve del DOM, reteniendo el renderer en memoria. | **CRITICAL** | **PASS (Unitario)** /<br>**NO PROBADO (Estrés/E2E)** | `cluster-frame-handler-stability.test.ts`<br>`R9_CERTIFICATION.md` |
| **R9-10** | **Correcciones de Análisis Estático y Safety** | `packages/core/src/renderer/components/workloads-deployments/rollout/template-diff.tsx`<br>Correcciones de optional chaining y boxed types en 5 archivos. | TypeScript 4.9.5<br>ESLint | Chequeos `tsc --noEmit` y ESLint estrictos PASS. | • Pruebas de regresión funcional en diff de plantillas de despliegues.<br>• Manejo de casos borde con objetos K8s malformados. | • Errores silenciados mediante guards defensivos que ocultan fallos subyacentes. | **LOW** | **PASS (Estático)** | `R9_CERTIFICATION.md`<br>Commit `78b35d9` |

---

## 3. Revisión Arquitectónica Especial (Focos de Inestabilidad y Errores Ocultos)

### 3.1. Arranque, Cierre y Ciclo de Vida de Electron
- **Single Instance Lock:** Implementado en `packages/core/src/main/electron-app/runnables/enforce-single-application-instance.injectable.ts`. Si se inicia una segunda instancia, enfoca la ventana existente.
- **Limpieza de Procesos Secundarios:** Al cerrar la aplicación, se requiere verificar que procesos hijos como `lens-k8s-proxy` y el servidor HTTP local de `demo-cluster-server` se terminen de forma síncrona/segura. Si el proceso principal muere por SIGKILL o error no capturado, el servidor de demo o el proxy pueden quedar escuchando en puertos locales.
- **Ventana y Estado:** `electron-window-state` persiste coordenadas y tamaño. Si el usuario cierra en una pantalla externa que luego se desconecta, la ventana puede abrirse fuera del viewport visible.

### 3.2. Navegación entre Clústeres y Gestión de Marcos (Iframes)
- **Mecanismo de Aislamiento:** Cada clúster activo corre dentro de un `<iframe>` alojado en `<div id="lens-views">`. El cambio de visibilidad se gestiona mediante la clase CSS `.hidden` (`display: none !important;`).
- **Hallazgo Crítico en Descarga de Clúster (`cluster-frame-handler.ts:100-106`):**
  ```typescript
  // cluster-frame-handler.ts
  iframe.addEventListener("load", () => parentElem.removeChild(iframe), { once: true });
  iframe.setAttribute("src", "");
  ```
  *Análisis:* En Chromium/Electron, vaciar el `src` (`src=""`) no garantiza de manera determinista la emisión del evento `"load"`. Si este evento no se dispara o se cancela, `parentElem.removeChild(iframe)` nunca se ejecuta. Dado que `this.views.delete(clusterId)` ya se ejecutó antes (línea 98), el iframe queda huérfano en el DOM pero desvinculado del gestor, causando **fuga de memoria silenciosa (memory leak)** y retención del contexto web.
- **Riesgo de Acumulación de Memoria:** Si un usuario tiene 5 clústeres abiertos, existen 5 contextos web de Chromium activos consumiendo cientos de megabytes de memoria de forma simultánea.

### 3.3. Ciclos de Renderizado y Rendimiento en Tablas
- **Redimensionamiento de Columnas (`table-cell.tsx:64-71`):**
  *Análisis:* El manejador `onMouseMove` en `table-cell.tsx` despacha `this.props.onResize(newWidth)` de manera síncrona por cada píxel de movimiento sin `requestAnimationFrame` ni *throttle*. Esto dispara `TableModel.setColumnWidth`, mutando el almacenamiento y forzando la re-evaluación reactiva de MobX para toda la tabla en tiempo real. En tablas con cientos de pods, esto genera **stuttering** severo y bloqueos perceptibles en la UI.
- **Auto-Fit por Doble Clic (`table-cell.tsx:104-109`):**
  *Análisis:* Se utiliza `tableRoot.querySelectorAll('[data-column-id="..."]')` para medir el `scrollWidth` de las celdas. En tablas virtualizadas (`VirtualList`), las filas fuera de la vista no existen en el DOM, por lo que el cálculo de ancho automático resulta inexacto y recortará datos no visibles.

### 3.4. Persistencia de Settings y Estado de Usuario
- **Dualidad de Almacenamiento:**
  1. `lens-user-store.json`: Configuración general de usuario (tema, proxy, mirrors, extensiones, kubeconfig sync). Gestionado por `userPreferencesPersistentStorageInjectable`.
  2. `app.json` / `<clusterId>.json`: Configuración de tablas (anchos de columnas, orden, ordenamientos). Gestionado por `initialize-state.injectable.ts` en `directoryForLensLocalStorage`.
- **Riesgo de Pérdida de Datos en Cierre Rápido:**
  *Análisis:* Ambos sistemas implementan un retraso de guardado perezoso (`storageSaveDelay` = 250 ms en tablas; debounce en preferencias). Si la aplicación se cierra de forma abrupta o se fuerza la salida inmediatamente después de modificar un ancho de columna o una preferencia, la mutación se pierde porque el proceso se termina antes de vaciar el buffer a disco.
- **Settings que Requieren Auditoría Especial de Persistencia:**
  - `colorTheme`: Si se elige `Midnight Graphite`, debe persistirse el ID exacto y sobrevivir a reinicios.
  - `tableDensity`: Cambio entre `compact` y `comfortable`.
  - `hiddenTableColumns`: Map serializado en arrays `[tableId, columnIds[]]`.
  - `syncKubeconfigEntries`: Sincronización de carpetas de kubeconfig.

---

## 4. Auditoría Visual y Paridad frente a Lens Oficial

### 4.1. Defecto Crítico: Tema Predeterminado en Arranque Limpio
- **Requerimiento No Negociable (Roadmap):** La aplicación debe iniciar obligatoriamente en **Midnight Graphite**.
- **Evidencia en Código:**
  - `packages/core/src/common/vars.ts:9`: `export const defaultThemeId: ThemeId = "lens-dark";`
  - `packages/core/src/renderer/themes/lens-dark.injectable.ts:165`: `isDefault: true`
  - `packages/core/src/renderer/themes/midnight-graphite.injectable.ts:48`: `isDefault: false`
- **Diagnóstico:** En una instalación limpia (sin archivo de preferencias previo), OpenLens DevOps ignora Midnight Graphite y carga el tema clásico Dark de Mirantis. **Estado: FAIL**.

### 4.2. Tipografía y Jerarquía
- **Tokens y Archivos:** Los archivos `OpenSans-VariableFont.ttf` y `OpenSans-Italic-VariableFont.ttf` están físicamente presentes en `packages/core/src/renderer/fonts/` y declarados en `fonts.scss` y `app.scss`.
- **Problema de Validación en Runtime:** Ninguna prueba actual mide las fuentes computadas en el DOM real. Muchos componentes basados en Material-UI v4 (`@material-ui/core`) inyectan la familia `"Roboto"` de forma explícita en sus reglas de tema o clases Mui, anulando `--font-primary`. Es imprescindible validar en Playwright mediante `window.getComputedStyle(element).fontFamily`.

### 4.3. Densidad de Tablas y Espaciados
- **Escala de Densidad:**
  - `compact`: `rowPadding` = 8px, `rowLineHeight` = 17px.
  - `comfortable`: `rowPadding` = 12px, `rowLineHeight` = 18px.
- **Diferencia frente a Lens Oficial:** Lens oficial utiliza una densidad calculada con tokens `--unit` (4px base) con padding vertical de 6px en tablas de alta densidad. Se debe medir la alineación vertical de badges de estado y botones de acción en las celdas para evitar saltos de línea indeseados.

### 4.4. Comparación de Componentes Clave

| Componente UI | OpenLens DevOps Actual | Lens Oficial (Referencia) | Gap Visual / Ergonómico Identificado |
|---|---|---|---|
| **Barra Lateral (Sidebar)** | Fondo `#111923` (Midnight Graphite), iconos con hover simple | Fondo `grey80` con gradiente sutil y borde vertical separador `grey60` | Falta validar el padding exacto de los ítems de navegación y el tamaño de los iconos (18px vs 20px). |
| **Cabecera de Tablas** | Fondo `#1A2533`, resizer de 4px, indicadores DND | Fondo `grey40`, tipografía 11px uppercase con peso 600 | Verificar que los títulos de columnas no se solapen con los botones de filtro y flechas de ordenamiento. |
| **Barra de Workload Insights** | 4 tarjetas KPI (Total, Ready, Issues, Namespaces) | Tarjetas similares en vistas de workloads | En pantallas < 1280px las tarjetas pueden envolverse (*wrap*) rompiendo la alineación de la tabla. |
| **Modales y Diálogos** | Fondo `#151B23`, borde `#324052` | Fondo multicapa con `boxShadow` pronunciado y backdrop difuminado | Falta verificar backdrop blur y contraste de botones de acción primarios vs secundarios. |
| **Drawer de Detalles** | Ancho fijo o ajustable, fondo oscuro | Drawer extensible con tabs de navegación interna claras | Verificar scroll independiente entre el contenido del drawer y la tabla inferior. |

---

## 5. Plan de Pruebas Automatizadas Playwright + Electron

Para superar el estado `NO PROBADO` en el Hito 1 y validar la estabilidad y la calidad visual, se define el siguiente catálogo de escenarios obligatorios utilizando Playwright sobre el binario empaquetado `OpenLens DevOps.app`.

### 5.1. Escenarios de Estabilidad y Ciclo de Vida (Fase 2)
1. **`STAB-01` — Arranque Limpio y Configuración de Fábrica:**
   - Lanzar la app con `userData` temporal aislado.
   - Capturar pantalla inicial y medir tiempo hasta interactividad (< 3.0s).
   - Verificar en el DOM que la clase aplicada sea la correspondiente a **Midnight Graphite** y que no exista flash de otro tema.
2. **`STAB-02` — Ciclo de Conexión, Cambio y Cierre de Clúster:**
   - Iniciar el Demo Cluster desde la pantalla de bienvenida.
   - Navegar por Pods, Deployments, Nodos y Storage.
   - Cambiar a un segundo clúster simulado y regresar.
   - Verificar que no queden iframes huérfanos en `<div id="lens-views">`.
   - Desconectar el clúster y verificar que el servidor local y el iframe se destruyan limpiamente.
3. **`STAB-03` — Detección de Congelamientos y Consumo de Recursos:**
   - Ejecutar navegación cíclica continua durante 50 ciclos entre Workloads, Network, Storage y Settings.
   - Medir el tiempo de respuesta del hilo principal cada 5 segundos mediante ping IPC (`window.lens.ping()`).
   - Alertar si el tiempo de respuesta supera los 200 ms o si el uso de RAM del proceso renderer crece sin estabilizarse (fuga de memoria).

### 5.2. Escenarios de Ergonomía de Tablas (Fase 4 y 5)
4. **`TAB-01` — Redimensionamiento Interactivo de Columnas (R9-01):**
   - Localizar el resizer de la columna "Name" en la tabla de Pods.
   - Arrastrar 100px a la derecha; verificar aumento visual en el DOM.
   - Hacer doble clic en el resizer; verificar auto-fit basado en el contenido visible.
   - Cambiar de pestaña y regresar; verificar que el ancho personalizado se mantiene.
5. **`TAB-02` — Reordenamiento DND de Columnas (R9-02):**
   - Arrastrar el encabezado de "Namespace" antes de "Name".
   - Verificar la aparición de la clase `.drop-target-left`.
   - Soltar y verificar que tanto las cabeceras como las celdas de las filas se hayan reordenado de forma idéntica.
   - Ejecutar "Reset column layout" en el menú de configuración de tabla y validar el retorno al orden original.
6. **`TAB-03` — Filtros por Columna en Cabecera (R9-03):**
   - Abrir el popover de filtro en la columna "Namespace".
   - Buscar un namespace específico en el input interno, seleccionarlo y cerrar el popover.
   - Verificar que la tabla solo muestre filas que coincidan y que el botón muestre el badge de filtro activo.
   - Limpiar el filtro y verificar la restauración de todas las filas.
7. **`TAB-04` — Exportación de Datos Tabulares (R8-01):**
   - Seleccionar 3 filas en la tabla.
   - Abrir el diálogo de exportación, elegir formato JSON y copiar al portapapeles.
   - Verificar el contenido del portapapeles y la notificación de confirmación de 2 segundos.
   - Probar exportación CSV verificando que fórmulas con `=`, `+`, `-`, `@` estén prefijadas con comilla simple `'`.

### 5.3. Escenarios de Paridad Visual y Tipografía (Fase 3)
8. **`VIS-01` — Tipografía Computada Real (R9-08):**
   - En Electron real, consultar vía script:
     ```javascript
     window.getComputedStyle(document.body).fontFamily;
     window.getComputedStyle(document.querySelector('.TableHead .TableCell')).fontFamily;
     window.getComputedStyle(document.querySelector('.Sidebar')).fontFamily;
     document.fonts.check('14px "Open Sans"');
     ```
   - Fallar si la fuente computada es distinta de `"Open Sans"`.
9. **`VIS-02` — Persistencia y Coherencia de Settings:**
   - Navegar a Preferences -> Appearance.
   - Cambiar de tema entre Midnight Graphite, Lens Official Dark y Lens Official Light.
   - Modificar la densidad a "Comfortable".
   - Reiniciar Electron y comprobar que ambos valores se restauran exactamente.
10. **`VIS-03` — Snapshot de Regresión Visual:**
    - Tomar capturas de referencia pixel-a-pixel en resolución 1440x900 para: Welcome, Catalog, Pods con Workload Insights, Gateways, Settings y Detalle de Pod.
    - Comparar contra líneas de base fijadas con umbral de diferencia estricto (< 1%).

---

## 6. Inventario de Riesgos Críticos y Gaps para Hito 1

1. **Riesgo Crítico R9-07 (Bloqueante visual):** La configuración predeterminada en `packages/core/src/common/vars.ts` apunta a `lens-dark` y `isDefault: false` en Midnight Graphite. Requiere un fix puntual de configuración al inicio del Hito 1.
2. **Riesgo Crítico R9-09 (Estabilidad):** Potencial retención zombi de iframes en `cluster-frame-handler.ts` ante desconexión o cambio de cluster. Requiere asegurar la eliminación del nodo del DOM independientemente de si el evento `load` se dispara al vaciar el `src`.
3. **Riesgo Mayor R9-01 (Rendimiento):** Ausencia de *throttling* en el evento `mousemove` del resizer de columnas. Provoca re-renderizados continuos e innecesarios de toda la tabla en el hilo principal.
4. **Déficit de Cobertura E2E:** Todas las funcionalidades de R8 y R9 cuentan únicamente con pruebas unitarias en Jest (JSDOM simulado). Ninguna ha sido ejecutada ni certificada dentro del entorno real de Electron sobre el artefacto empaquetado.

---

## 7. Dictamen y Conclusión del Hito 0

- **Estado General:** **LÍNEA DE BASE ESTABLECIDA — AUDITORÍA E INVENTARIO COMPLETADOS.**
- **Conformidad con Reglas:** Cero líneas de código de producción modificadas; cero dependencias instaladas; clústeres reales intactos; artefacto R9-RC preservado intacto.
- **Autorización Pendiente:** El proyecto se encuentra en condiciones técnicas de iniciar el **Hito 1 (Configuración de Pruebas E2E en Playwright + Corrección de Defectos Críticos de Inicio)**, a la espera de confirmación explícita del usuario.
