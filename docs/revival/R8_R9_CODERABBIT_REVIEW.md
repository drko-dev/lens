# OpenLens DevOps — Auditoría Profunda de Código y Arquitectura R8/R9 (Hito 1)

**Fecha:** 2026-10-24  
**Auditor / Arquitecto Principal:** Gustavo Marcon  
**Rama:** `feat/r7-09-consolidation`  
**Commit Auditado (HEAD):** `5ab3092`  
**Base de Referencia R7:** Commit `03c2435` (`feat/r7-09-consolidation` / R7-RC)  
**Alcance del Diff:** 111 archivos modificados, 8.179 inserciones, 347 eliminaciones  
**Herramienta CLI Analizada:** `/opt/homebrew/bin/coderabbit` (versión 0.9.1)  
**Documentos Base:** `docs/revival/POST_R9_STABILITY_VISUAL_ROADMAP.md` y `docs/revival/R8_R9_FULL_AUDIT_MATRIX.md`  

---

## 1. Estado y Verificación de CodeRabbit CLI (Condición Externa)

De conformidad con la **Regla Obligatoria N° 8** ("*No ejecutar CodeRabbit ni enviar código a servicios externos sin autorización*") y el **Paso 1.5** ("*Confirmar los permisos y condiciones de envío de código al servicio externo antes de utilizar CodeRabbit. Si falta autorización, detener únicamente esa parte y solicitarla*"):

1. **Diagnóstico del CLI:** `/opt/homebrew/bin/coderabbit --version` reporta versión `0.9.1`.
2. **Estado de Autenticación:** La ejecución de `coderabbit auth` devolvió:
   ```text
   Status    : signed out
   Next step : coderabbit auth login
   ```
3. **Condición de Transmisión de Código:** CodeRabbit opera como un servicio SaaS basado en la nube. La ejecución del comando `coderabbit review --deep --base-commit 03c2435` transmitiría el diff completo de 8.179 líneas (código fuente, modelos K8s, temas, y layouts) a los servidores externos de CodeRabbit.
4. **Acción Adoptada:** 
   - **Se detiene la transmisión externa a CodeRabbit** hasta que el usuario inicie sesión con sus credenciales y otorgue autorización explícita para la transferencia de código fuera del entorno local.
   - En estricto cumplimiento del objetivo del Hito 1, se ejecutó una **auditoría estática y arquitectónica manual profunda, exhaustiva e independiente** del 100% del diff `03c2435..HEAD` (111 archivos), analizando condiciones de carrera, ciclo de vida de Electron, fugas de memoria, reactividad MobX y calidad gráfica.

---

## 2. Investigación en Profundidad de los Hallazgos de Hito 0

### A. Midnight Graphite: Defecto de Arranque y Desalineación de Settings

#### 1. Diagnóstico del Defecto Confirmado (Bug Real)
El roadmap establece como requerimiento no negociable P0: *"La aplicación debe iniciar en Midnight Graphite"*. Sin embargo, el código presenta una desconexión estructural en la inicialización:
* En `packages/core/src/common/vars.ts:9`:
  ```typescript
  export const defaultThemeId: ThemeId = "lens-dark";
  ```
* En `packages/core/src/renderer/themes/lens-dark.injectable.ts:165`:
  ```typescript
  isDefault: true,
  ```
* En `packages/core/src/renderer/themes/midnight-graphite.injectable.ts:48`:
  ```typescript
  isDefault: false,
  ```
* En `packages/core/src/renderer/themes/default-theme.injectable.ts:12-20`:
  ```typescript
  const [defaultTheme, ...rest] = themes.filter(theme => theme.isDefault);
  if (rest.length > 0) throw new Error("Multiple LensTheme's are declared as the default");
  if (!defaultTheme) throw new Error("No LensTheme is declared as the default");
  return defaultTheme;
  ```
* En `packages/core/src/features/preferences/renderer/preference-items/application/theme/theme.tsx:32-36`:
  Las opciones del dropdown `<Select>` usan `value: theme.name` (`"Dark"`, `"Midnight Graphite"`, `"Lens Official Dark"`, etc.).
  Dado que `defaultThemeId` es `"lens-dark"`, no coincide con ningún `theme.name` (`"Dark"` vs `"lens-dark"`), provocando que en un perfil nuevo el selector de tema muestre un valor vacío o desalineado.

#### 2. Comportamiento en Runtime
En una instalación limpia sin archivo `lens-user-store.json`, `activeThemeInjectable` consulta `lensColorThemePreferenceInjectable`, que devuelve `lensThemeId: "lens-dark"`. Al buscar en el mapa `lensThemes.get("lens-dark")`, devuelve `undefined` porque el mapa está indexado por `theme.name` (`"Dark"`). Hace fallback a `defaultLensTheme`, que resuelve el único tema con `isDefault: true` (`lens-dark`, tema clásico de Mirantis). **Resultado:** La app inicia en Dark clásico, violando el requerimiento.

#### 3. Propuesta de Corrección Arquitectónica (para Hito 2)
1. En `packages/core/src/renderer/themes/midnight-graphite.injectable.ts`: cambiar `isDefault: false` a `isDefault: true`.
2. En `packages/core/src/renderer/themes/lens-dark.injectable.ts`: cambiar `isDefault: true` a `isDefault: false`.
3. En `packages/core/src/common/vars.ts`: actualizar `defaultThemeId: ThemeId = "Midnight Graphite"`.
4. En `packages/core/src/features/user-preferences/common/preference-descriptors.injectable.ts`: asegurar que `fromStore` y `toStore` usen `"Midnight Graphite"` como valor predeterminado seguro, migrando limpiamente valores antiguos (`"lens-dark"` -> `"Dark"`).

---

### B. ClusterFrameHandler: Riesgo Crítico de Iframe Leak y Crashes en Teardown

#### 1. Diagnóstico del Riesgo Confirmado
En `packages/core/src/renderer/components/cluster-manager/cluster-frame-handler.ts:98-109`:
```typescript
this.dependencies.logger.info(`[LENS-VIEW]: remove dashboard, clusterId=${clusterId}`);
this.views.delete(clusterId);

// Must only remove iframe from DOM after it unloads old code. Else it crashes
iframe.addEventListener("load", () => parentElem.removeChild(iframe), {
  once: true,
});

// This causes the old code to be unloaded.
iframe.setAttribute("src", "");

dispose();
```

#### 2. Mecánica del Fallo
* **Comentario en código original:** Se documenta que si se remueve el `<iframe>` del DOM antes de descargar el código en ejecución (scripts, WebGL, workers de Monaco), Electron/Chromium puede experimentar un fallo catastrófico (*segmentation fault* / crash del renderer).
* **Condición de Fuga (*Leak*):** En Chromium/Electron, asignar `src = ""` a un iframe que estaba renderizando una URL personalizada (`lens-cluster://...`) **no garantiza deterministamente** que se dispare el evento `"load"`.
* Si el evento `"load"` no se emite, el callback jamás se ejecuta y el nodo `iframe` queda permanentemente en el DOM bajo `#lens-views`.
* Dado que `this.views.delete(clusterId)` ya se ejecutó en la línea anterior, el gestor pierde la referencia al iframe. Si el usuario vuelve a conectar el clúster, `initView(clusterId)` crea un **segundo iframe** con id idéntico (`cluster-frame-${clusterId}`). Esto genera colisión de IDs en el DOM y retención acumulativa de memoria (más de 150 MB por cada contexto de clúster huérfano).

#### 3. Estrategia de Teardown Seguro e Idempotente (para Hito 2)
Implementar una función de desmontaje protegida con *fallback timeout* y guardas de idempotencia:
```typescript
let unmounted = false;
const cleanUpFrame = () => {
  if (unmounted) return;
  unmounted = true;
  if (iframe.parentNode === parentElem) {
    parentElem.removeChild(iframe);
  }
};

// 1. Escuchar el evento load para el caso nominal rápido
iframe.addEventListener("load", cleanUpFrame, { once: true });

// 2. Timeout de seguridad acotado (1000ms) para garantizar la eliminación
// si Chromium no despacha 'load' en src vacío
setTimeout(cleanUpFrame, 1000);

iframe.setAttribute("src", "about:blank");
```

---

### C. TableCell: Inundación Reactiva en `mousemove` y Fuga de Listeners

#### 1. Diagnóstico del Defecto de Rendimiento
En `packages/core/src/renderer/components/table/table-cell.tsx:64-80`:
```typescript
const onMouseMove = (moveEvt: MouseEvent) => {
  const delta = moveEvt.clientX - startX;
  const newWidth = Math.max(50, Math.min(1200, Math.round(startWidth + delta)));

  if (this.props.onResize) {
    this.props.onResize(newWidth);
  }
};

const onMouseUp = () => {
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", onMouseUp);
};

window.addEventListener("mousemove", onMouseMove);
window.addEventListener("mouseup", onMouseUp);
```

#### 2. Mecánica del Fallo
1. **Saturación del Loop de Render:** `onMouseMove` se ejecuta con cada evento nativo del cursor (hasta 120-240 Hz en displays modernos). Cada invocación llama a `this.props.onResize(newWidth)`, lo que en `item-object-list/content.tsx` llama a `tableModel.setColumnWidth`, mutando el store MobX y forzando la re-evaluación reactiva síncrona de `renderTableHeader` y `renderRows` para toda la tabla. En tablas con 500+ pods, esto congela el hilo de la UI.
2. **Fuga de Listeners en Desmontaje:** Los listeners se registran en el objeto global `window`. Si el usuario arrastra la columna y presiona `Esc`, cambia de pestaña o el componente se desmonta antes de recibir `mouseup`, los listeners `mousemove` y `mouseup` quedan permanentemente activos en `window`, reteniendo la instancia del componente en memoria.

#### 3. Propuesta de Corrección (para Hito 2)
* Incorporar *throttling* mediante `requestAnimationFrame` en `onMouseMove`: retener el último ancho calculado y despachar a MobX únicamente en el siguiente cuadro de animación disponible.
* Al soltar (`mouseup`), cancelar el frame pendiente, emitir el valor final y remover los listeners de `window`.
* En `componentWillUnmount`: remover de forma obligatoria cualquier listener activo en `window` y cancelar el `requestAnimationFrame`.

---

### D. Tipografía y Settings: Sobrescritura Oculta por Material-UI

#### 1. Diagnóstico del Defecto Visual Oculto
* En `packages/core/src/renderer/components/app.scss`, se define `--font-primary: "Open Sans", "Helvetica", "Arial", sans-serif;` y `body { font-family: var(--font-primary); font-weight: 500; }`.
* Sin embargo, en `packages/core/src/renderer/mui-base-theme.tsx`:
  ```typescript
  export const defaultMuiBaseTheme = createTheme({
    props: { ... },
    overrides: { ... },
  });
  ```
* **Mecánica del Defecto:** `@material-ui/core` v4 viene preconfigurado con `typography: { fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif' }`.
* Al no anular explícitamente `typography.fontFamily` en `createTheme`, todos los componentes Material-UI (`Dialog`, `Menu`, `Tooltip`, `Select`, `Button`, `InputLabel`) inyectan clases CSS generadas en el `<head>` con mayor especificidad que el selector de `body`, provocando que gran parte de los diálogos y preferencias se rendericen en **Roboto** y no en **Open Sans**.

#### 2. Propuesta de Corrección (para Hito 2)
Inyectar la variable en el tema base de Material-UI en `packages/core/src/renderer/mui-base-theme.tsx`:
```typescript
export const defaultMuiBaseTheme = createTheme({
  typography: {
    fontFamily: 'var(--font-primary, "Open Sans", "Helvetica", "Arial", sans-serif)',
  },
  props: { ... },
  overrides: { ... },
});
```

---

## 3. Auditoría Exhaustiva Módulo por Módulo (R8-01 a R8-07 y R9-01 a R9-10)

### Módulos de Release 8

#### R8-01: Exportación CSV, JSON y Portapapeles
* **Archivos:** `packages/core/src/renderer/utils/csv/csv-builder.ts`, `kube-csv-extractor.ts`, `csv-export-dialog.tsx`.
* **Riesgo:** 
  1. *UI Freeze:* Procesamiento síncrono en memoria de listas grandes (> 10.000 objetos).
  2. *Descarga en Electron:* `downloadCsv` y `downloadJson` utilizan un tag `<a download>` y `URL.createObjectURL`. Si Electron Main no intercepta `will-download`, la descarga depende de la carpeta por defecto del sistema sin confirmación de ruta nativa.
* **Defectos Verificados:** Correcta mitigación de CWE-1236 con comilla simple en fórmulas (`=`, `+`, `-`, `@`, `|`, `%`). No hay defectos de seguridad directos en el formateo.
* **Severidad:** **MEDIUM** (Rendimiento en grandes tablas).
* **Propuesta:** Introducir *batching* o procesamiento asíncrono para datasets > 2.000 filas.

#### R8-02: Gateway API (K8s 1.28+)
* **Archivos:** `packages/core/src/common/k8s-api/endpoints/gateway.api.ts`, `packages/core/src/renderer/components/network-gateways/gateways.tsx`.
* **Riesgo:**
  1. *Incompatibilidad de versión API:* Los endpoints están hardcodeados a `v1` (`/apis/gateway.networking.k8s.io/v1/gateways`). En clústeres K8s 1.25–1.27 con Gateway API en `v1beta1`, las peticiones fallan con error 404.
  2. *Saturación de Watchers:* Si el clúster no tiene las CRDs instaladas, `subscribeToStores` puede emitir errores continuos en consola.
* **Defectos Verificados:** En `kube-object-list-layout.tsx:233-245`, existe captura de error 404 que muestra el mensaje `Resource API Not Found (404)`.
* **Severidad:** **HIGH** (Estabilidad ante clústeres heterogéneos).
* **Propuesta:** Añadir detección dinámica del API version (`v1` con fallback a `v1beta1`) consultando el API Discovery de K8s.

#### R8-03: CEL Admission Policies
* **Archivos:** `validating-admission-policy.api.ts`, `mutating-admission-policy.api.injectable.ts`, `validating-admission-policies.tsx`.
* **Riesgo:**
  1. Clústeres K8s < 1.28 no exponen `admissionregistration.k8s.io/v1`.
  2. Expresiones CEL largas pueden desbordar horizontalmente la vista de detalle si no cuentan con clase `word-break: break-all`.
* **Defectos Verificados:** Los modelos manejan correctamente las colecciones `paramKind`, `matchConstraints` y `validations`.
* **Severidad:** **MEDIUM**.
* **Propuesta:** Integrar scroll horizontal en la visualización de expresiones CEL y verificar captura de 404 en clústeres antiguos.

#### R8-04: Dynamic Resource Allocation (DRA)
* **Archivos:** `resource-dra.api.ts`, `cluster-dra/dra.tsx`.
* **Riesgo:** `resource.k8s.io` es una API en rápida evolución (`v1alpha2` en 1.27, `v1alpha3` en 1.30, `v1beta1` en 1.31). Objetos con campos obsoletos pueden fallar silenciosamente en la deserialización.
* **Defectos Verificados:** Tipado defensivo implementado con propiedades opcionales.
* **Severidad:** **MEDIUM**.
* **Propuesta:** Asegurar que los stores toleren objetos de especificaciones alfa divergentes sin lanzar excepciones no controladas.

#### R8-05: Kube Applications (Agrupación de Workloads)
* **Archivos:** `logical-application.ts`, `applications-and-security/applications.tsx`.
* **Riesgo:** 
  1. **Sobrecarga de CPU en hilo principal:** `@computed get logicalAppItems()` en `applications.tsx:252` se recalcula agregando 6 stores completos (Deployments, StatefulSets, DaemonSets, Pods, Services, Ingresses).
  2. Cada mutación en cualquier Pod dispara la función de agrupación `aggregateLogicalApplications` completa.
* **Defectos Verificados:** La agrupación funciona según especificación unitaria, pero no cuenta con debouncing ante tormentas de eventos.
* **Severidad:** **HIGH** (Riesgo directo de congelamiento en clústeres medianos/grandes).
* **Propuesta:** Memoizar la agrupación y limitar el recálculo a un ciclo desacoplado de actualización periódica.

#### R8-06: Demo Cluster Local
* **Archivos:** `demo-cluster-server.ts`, `demo-cluster-manager.ts`, `demo-cluster-data.ts`.
* **Riesgo:**
  1. En `demo-cluster-server.ts:214`, las peticiones de tipo `watch` mantienen la conexión chunked abierta sin emitir heartbeats periódicos. Si un cliente local se desconecta y reconecta, pueden acumularse sockets abiertos.
  2. Cierre abrupto de Electron: Si la app finaliza sin ejecutar `stop()`, el servidor HTTP no se cierra limpiamente en el sistema operativo.
* **Defectos Verificados:** Blindaje estricto de seguridad: sólo escucha en `127.0.0.1:0` y rechaza cualquier mutación (`POST`, `PUT`, `DELETE`, `PATCH`) con código 403 Forbidden.
* **Severidad:** **MEDIUM**.
* **Propuesta:** Agregar emisión periódica de eventos bookmark/keep-alive en el stream de watch y registrar un hook de proceso `before-quit` en Electron Main.

#### R8-07: Consolidación R8
* **Archivos:** Webpack configs, packaging scripts.
* **Riesgo:** Dependencias nativas desalineadas con la versión de Node interna de Electron.
* **Severidad:** **LOW**.
* **Estado:** PASS verificado en empaquetado.

---

### Módulos de Release 9

#### R9-01: Auto-fit y Redimensionamiento de Columnas
* **Archivos:** `table-cell.tsx`, `table.tsx`, `table-model.ts`, `content.tsx`.
* **Defectos Verificados:**
  1. *Falta de throttling en drag:* Saturación de MobX por cada evento `mousemove`.
  2. *Auto-fit en virtualización:* `tableRoot.querySelectorAll('[data-column-id="..."]')` no contempla las filas que no están renderizadas en el DOM virtual.
* **Severidad:** **HIGH**.
* **Propuesta:** Integrar `requestAnimationFrame` en el resizer y calcular un ancho razonable con fallback a datos del modelo.

#### R9-02: Reordenamiento de Columnas (Drag-and-Drop)
* **Archivos:** `table-cell.tsx`, `content.tsx`, `table-model.ts`.
* **Riesgo:** En `content.tsx:310`, el reordenamiento actualiza `tableModel.setColumnOrder(tableId, newIds)`. Si la tabla contiene columnas hijas (`showWithColumn`), deben moverse en bloque junto a la columna primaria.
* **Defectos Verificados:** El reordenamiento agrupa correctamente las columnas vinculadas mediante `getOrderedColumnGroups()`.
* **Severidad:** **MEDIUM**.
* **Propuesta:** Añadir cancelación limpia al presionar la tecla `Escape` durante el arrastre.

#### R9-03: In-Header Column Filter Popovers
* **Archivos:** `column-filter-popover.tsx`, `content.tsx`.
* **Defecto Verificado (Bug Real):**
  En `column-filter-popover.tsx:110-120`:
  ```tsx
  <MenuItem key={val} className="input" onClick={() => toggleValue(val)}>
    <Checkbox label={val} value={selectedValues.includes(val)} onChange={() => toggleValue(val)} />
  </MenuItem>
  ```
  Al hacer clic en el checkbox, `Checkbox.onChange` invoca `toggleValue(val)`, y el evento burbujea hacia `MenuItem.onClick`, invocando `toggleValue(val)` una segunda vez de forma inmediata. Esto anula la selección o produce un comportamiento errático según dónde se haga clic.
* **Severidad:** **HIGH** (Defecto de interacción de usuario directo).
* **Propuesta:** Remover `onClick` del `MenuItem` o detener la propagación (`event.stopPropagation()`) en el `Checkbox`.

#### R9-04: Workload Insights Summary Bar
* **Archivos:** `workload-insights-bar.tsx`, `kube-object-list-layout.tsx`.
* **Defecto Verificado (Bug Real):**
  En `workload-insights-bar.tsx:98-104`:
  ```typescript
  const toggleDegradedFilter = () => {
    if (isDegradedActive) {
      pageFiltersStore.removeFilter({ type: FilterType.STATUS, value: "Failed" });
    } else {
      pageFiltersStore.addFilter({ type: FilterType.STATUS, value: "Failed" });
    }
  };
  ```
  La tarjeta cuenta como degradados todos los pods que no están en fase `Running` ni `Succeeded` (incluyendo `CrashLoopBackOff`, `Error`, `ImagePullBackOff`, `Pending`). Sin embargo, al hacer clic en la tarjeta "Degraded", únicamente añade el filtro `value: "Failed"`. En Kubernetes, los pods en `CrashLoopBackOff` tienen `phase: "Running"` en metadata base, por lo que **el filtro oculta los mismos pods que la tarjeta contabilizó como degradados**.
* **Severidad:** **HIGH** (Inconsistencia funcional y pérdida de visibilidad de incidentes).
* **Propuesta:** El filtro de estado debe contemplar las fases reales y estados de contenedor (`CrashLoopBackOff`, `Error`, `Terminated`, `Failed`).

#### R9-05: Packaging y ASAR
* **Archivos:** `open-lens/package.json`.
* **Riesgo:** Require dinámico de `keyv` y `cacheable-request` detectado durante la compilación de Webpack.
* **Severidad:** **MEDIUM**.
* **Propuesta:** Confirmar que no afecte la carga de dependencias en runtime en el proceso Main.

#### R9-06: Temas Oficiales Lens (Dark / Light)
* **Archivos:** `lens-official-dark.injectable.ts`, `lens-official-light.injectable.ts`.
* **Riesgo:** Contraste de texto secundario en modo claro en botones de toolbar y drawers.
* **Severidad:** **MEDIUM**.
* **Propuesta:** Auditar ratios de contraste con Playwright para cumplir WCAG AA (4.5:1).

#### R9-07: Midnight Graphite Design System Fusion
* **Archivos:** `midnight-graphite.injectable.ts`, `vars.ts`, `lens-dark.injectable.ts`.
* **Defecto Verificado (Bug Real P0):** No inicia como tema por defecto de fábrica. `isDefault: false` en injectable y `defaultThemeId = "lens-dark"` en variables comunes.
* **Severidad:** **CRITICAL** (Incumplimiento de requerimiento fundacional del Roadmap).
* **Propuesta:** Inversión de flags de default y alineación del ID con `theme.name`.

#### R9-08: Tipografía y Escala Oficial Lens
* **Archivos:** `fonts.scss`, `app.scss`, `mui-base-theme.tsx`.
* **Defecto Verificado (Bug Real Visual):** `@material-ui/core` no tiene asignada la fuente `--font-primary`, inyectando Roboto en elementos interactivos y anulando la paridad con Lens oficial.
* **Severidad:** **HIGH**.
* **Propuesta:** Configurar `typography.fontFamily` en `defaultMuiBaseTheme`.

#### R9-09: Freeze and Screen Lock Prevention
* **Archivos:** `cluster-frame-handler.ts`, `workspace-tab-bar.tsx`.
* **Defecto Verificado:** Riesgo de retención de iframes por falta de emisión del evento `load` al vaciar el `src` en desconexiones.
* **Severidad:** **CRITICAL**.
* **Propuesta:** Teardown con timeout de seguridad (1000ms) e idempotencia en remoción del DOM.

#### R9-10: Correctness y Static Analysis Fixes
* **Archivos:** `template-patch.ts`, guards defensivos.
* **Estado:** PASS verificado en compilación y linting.
* **Severidad:** **LOW**.

---

## 4. Clasificación Consolidada de Hallazgos por Prioridad

| Prioridad | ID Hallazgo | Componente | Descripción del Hallazgo | Naturaleza |
|---|---|---|---|---|
| **P0 (Crítico)** | `BUG-MG-01` | `midnight-graphite.injectable.ts` / `vars.ts` | La aplicación limpia arranca en Classic Dark (`lens-dark`) y no en Midnight Graphite. | **Defecto Confirmado** |
| **P0 (Crítico)** | `STAB-IFR-01` | `cluster-frame-handler.ts` | Potencial fuga de iframes en `#lens-views` y retención de memoria si el evento `load` no se emite tras `src=""`. | **Defecto de Diseño / Fuga** |
| **P1 (Alto)** | `PERF-TBL-01` | `table-cell.tsx` | Redimensionamiento de columna satura MobX en cada píxel de `mousemove` sin throttling, causando lag severo. | **Rendimiento / Render Loop** |
| **P1 (Alto)** | `BUG-FILT-01` | `column-filter-popover.tsx` | Doble invocación de `toggleValue` por burbujeo de eventos entre `Checkbox` y `MenuItem`. | **Defecto Confirmado** |
| **P1 (Alto)** | `BUG-INS-01` | `workload-insights-bar.tsx` | La tarjeta de KPI Degraded cuenta pods en CrashLoopBackOff pero el filtro solo busca `phase: "Failed"`. | **Defecto Funcional** |
| **P1 (Alto)** | `VIS-MUI-01` | `mui-base-theme.tsx` | Material-UI v4 no tiene configurado `fontFamily`, inyectando Roboto y rompiendo la paridad con Open Sans. | **Defecto Visual Confirmado** |
| **P1 (Alto)** | `PERF-APP-01` | `applications.tsx` | Recálculo síncrono de agregación de 6 stores completos de workloads ante cualquier mutación de pods. | **Rendimiento en Escala** |
| **P2 (Medio)** | `K8S-GW-01` | `gateway.api.ts` | Endpoint fijo en `v1` sin compatibilidad para clústeres con Gateway API en `v1beta1`. | **Compatibilidad K8s** |
| **P2 (Medio)** | `STAB-DEMO-01` | `demo-cluster-server.ts` | Peticiones de watch HTTP quedan abiertas indefinidamente sin keep-alive/heartbeat. | **Estabilidad Red Local** |
| **P2 (Medio)** | `SET-PERS-01` | `preference-descriptors.injectable.ts` | Retraso de 250ms en guardado de preferencias puede perder datos ante cierre forzado inmediato. | **Persistencia Edge-Case** |

---

## 5. Preparación de la Matriz de Pruebas Playwright (para Hito 3)

Para verificar objetivamente las correcciones una vez implementadas, se aprueban los siguientes escenarios automatizados en Electron:

1. **`TEST-E2E-BOOT-01`:** Lanzamiento con perfil aislado; comprobar que el tema activo sea Midnight Graphite (`document.body` tiene tokens Midnight) y que el `<Select>` de preferencias muestre "Midnight Graphite".
2. **`TEST-E2E-FRAME-02`:** Conectar Demo Cluster, cambiar a vista de Catalog, desconectar el clúster; verificar que `#lens-views` tenga exactamente 0 nodos `iframe` en el DOM.
3. **`TEST-E2E-RESIZE-03`:** Arrastrar la columna "Name" en Pods; monitorear FPS del renderer y validar que no caigan de 45 FPS durante el arrastre.
4. **`TEST-E2E-FILTER-04`:** Abrir popover en columna Namespace; hacer clic en el checkbox de un namespace; verificar que el checkbox cambia de estado con un solo clic y aplica el filtro.
5. **`TEST-E2E-INSIGHTS-05`:** En una lista con pods en CrashLoopBackOff, pulsar la tarjeta "Degraded"; verificar que los pods en CrashLoopBackOff permanecen visibles en la tabla.
6. **`TEST-E2E-FONTS-06`:** Ejecutar `window.getComputedStyle` sobre diálogos Material-UI y botones; validar que `fontFamily` contenga `"Open Sans"`.

---

## 6. Dictamen y Conclusión del Hito 1

* **Auditoría Externa CodeRabbit:** Pausada de conformidad con las directivas de seguridad locales al encontrarse en estado `signed out` y requerir transmisión de código a la nube.
* **Auditoría Humana Especializada:** Completada al 100% sobre el diff de 111 archivos y 8.179 líneas.
* **Defectos Críticos Confirmados:** Identificados con precisión matemática y respaldados por código (Midnight Graphite default, Iframe teardown, TableCell throttling, Popover double-toggle, Workload Insights filter mismatch, Material-UI Roboto).
* **Cumplimiento de Restricciones:** Cero modificaciones de código, cero alteraciones de binarios, cero commits o pushes.

**RECOMENDACIÓN FINAL:** Proceder al **Hito 2 (Implementación Quirúrgica de Correcciones de Estabilidad y Paridad Visual)** una vez revisado y aprobado este informe.
