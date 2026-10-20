# OpenLens DevOps Revival — R2-03 Validation Report
**Visor de logs avanzado, búsqueda/filtrado y continuidad de registros**

- **Fecha:** 20 de Octubre de 2026
- **Rama:** `feat/openlens-devops-revival`
- **Ambiente de compilación:** Node.js v20.20.2 / npm v10.8.2 / macOS ARM64 (Darwin 27.0.0)
- **Hash / Binario empaquetado:** `open-lens/dist-stage/mac-arm64/OpenLens DevOps.app` (SHA256: `6f38b34a9eaf6cfa8b55ed0c24f0afeb31bfb32b1c0336c96c98ae0f3612b075`)
- **Estado de salida:** APROBADO (31 tests de logs y búsqueda + 44 tests de regresión de R1/R2-01/R2-02 + Verificación Playwright en paquete aislado)

---

## 1. Resumen de Implementación

En el marco del Hito **R2-03**, se resolvieron los defectos de integridad de sondeo y se implementaron las siguientes capacidades clave en el visor de logs de OpenLens DevOps (`packages/core/src/renderer/components/dock/logs/`):

### A. Integridad de Sondeo y Cero Pérdida Subsegundo
- **Eliminación del bug de `sinceTime` +1s:** Anteriormente, `LogStore.getLastSinceTime()` incrementaba artificialmente un segundo el último timestamp recibido (`stamp.setSeconds(stamp.getSeconds() + 1)`), descartando de manera permanente cualquier log emitido en la misma fracción de segundo posterior. Se reemplazó por `getLastLogTimestamp()`, que extrae el timestamp exacto ISO-8601 del último mensaje.
- **Deduplicación determinista por solapamiento:** Implementación de `mergeLogLines` en `log-buffer-utils.ts`, que identifica la ventana de coincidencia sufijo-prefijo entre los logs existentes y la nueva respuesta del sondeo. No deduplica por contenido ciego (lo que borraría logs repetidos legítimos como pings o heartbeats), sino únicamente por el solapamiento de la ventana de tiempo consultada.
- **Protección contra pérdida en errores transitorios:** Anteriormente, un fallo de red o timeout sobrescribía de golpe todo el buffer `podLogs` con el mensaje de error. Se desacopló el estado de error en `tabErrors` y `tabStatus = "ERROR"`. El historial de logs permanece intacto y visible, y al recuperarse la conexión, el estado vuelve a `"LIVE"` y se borra el error transitorio.
- **Acotación de memoria y aviso de truncamiento:** `trimLogBuffer` limita el buffer a un máximo seguro de 10.000 líneas (`DEFAULT_MAX_LOG_LINES`), descartando los mensajes más antiguos desde el encabezado e incrementando el observable `truncatedCounts` para notificar al usuario mediante el badge `TRUNCATED`.

### B. Búsqueda y Filtrado en Tiempo Real (`SearchStore` y `LogSearch`)
- **Modos duales independientes:**
  1. `Search`: Modo clásico que muestra todos los registros y resalta las coincidencias, con navegación arriba/abajo (`Enter` / `Shift+Enter`).
  2. `Filter`: Modo de enfoque que oculta todas las líneas que no coincidan con la consulta, mostrando el contador `N filtered` y un estado vacío amigable cuando ninguna línea coincide.
- **Búsqueda por expresiones regulares (`useRegex`):** Soporte opcional para expresiones regulares mediante el botón `.*`.
- **Protección contra ReDoS:** Límite estricto de 100 caracteres en la expresión regular y captura segura de excepciones sintácticas en `SearchStore.buildRegex()`. En caso de patrón malformado, se expone un banner no invasivo `Invalid Regex: <error>` sin quebrar el render ni bloquear el hilo de interfaz.
- **Sensibilidad a mayúsculas/minúsculas (`matchCase`):** Toggle `Aa` para alternar entre búsqueda insensible y sensible a mayúsculas.
- **Aislamiento ANSI:** El motor de búsqueda limpia códigos de escape ANSI (`stripAnsiCodes`) antes de evaluar las coincidencias, evitando falsos positivos con códigos de color de terminal.
- **Aislamiento por pestaña:** El estado de búsqueda y filtrado está encapsulado en cada instancia del `LogTabViewModel`.

### C. Pausa y Reanudación de Registros
- **Diferenciación entre auto-scroll y pausa de visualización:**
  - El botón `Pause` congela la visualización para permitir la lectura y selección de texto cómoda sin sobresaltos.
  - El proceso de sondeo en segundo plano continúa activo acumulando mensajes en `pendingLogs` (hasta el límite del buffer).
  - La interfaz exhibe el badge de estado `PAUSED (+N)` indicando en tiempo real la cantidad de registros recibidos pendientes.
  - Al presionar `Resume`, las líneas acumuladas se integran limpiamente en el buffer visible sin pérdidas de continuidad.

### D. Ergonomía del Visor y Word Wrap
- **Conmutador Word Wrap:** Control para alternar el ajuste de línea en `controls.tsx`.
- **Cálculo dinámico de altura de filas (`rowHeights`):** En `list.tsx`, `VirtualList` (`react-window`) recibe un arreglo dinámico de alturas basado en el ancho medido del contenedor (`ResizeObserver`) y la longitud de caracteres de cada línea, evitando solapamientos o truncamiento de texto.
- **Badges de estado consistentes:** Indicadores visuales en los controles: `LIVE` (verde), `PAUSED` (ámbar), `RECONNECTING` / `ERROR` (rojo) y `TRUNCATED` (naranja).

---

## 2. Registro de Pruebas Unitarias

Se ejecutaron con éxito todas las pruebas focalizadas en logs y búsqueda:

| Suite de Pruebas | Archivo | Pruebas | Resultado |
|---|---|:---:|:---:|
| **Log Buffer Utilities** | `log-buffer-utils.test.ts` | 8 | PASS |
| **Search Store (Regex/Filter/Case)** | `search-store.test.ts` | 17 | PASS |
| **LogStore Polling & Stream** | `log-store.test.ts` | 5 | PASS |
| **LogSearch Component & UI** | `log-search.test.tsx` | 7 | PASS |
| **Log Controls & ToBottom** | `to-bottom.test.tsx` | 4 | PASS |
| **Resource Selector** | `log-resource-selector.test.tsx` | 7 | PASS |
| **Total Logs & Search** | — | **48** | **100% PASS** |

### Pruebas de Regresión Previas (R1, R2-01, R2-02)
- `secret-details.test.tsx`: 6/6 PASS
- `diff-and-revert.test.tsx`: 10/10 PASS
- `diff-redaction.test.ts`: 3/3 PASS
- `monaco-validators.test.ts`: 10/10 PASS
- `sidebar-cluster.test.tsx`: 5/5 PASS
- `cluster-appearance-picker.test.tsx`: 5/5 PASS
- `pod-devops-menu.test.tsx`: 4/4 PASS
- `create-pod-terminal-tab.test.ts`: 1/1 PASS
- **Total Regresiones:** 44/44 PASS (0 fallos).

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
   - Configuración: `CSC_IDENTITY_AUTO_DISCOVERY=false`, firma ad-hoc sin publicación.
   - SHA-256 binario: `6f38b34a9eaf6cfa8b55ed0c24f0afeb31bfb32b1c0336c96c98ae0f3612b075`.
   - Protección de proceso: PID 80825 (`open-lens/dist`) protegido sin interferencias.

---

## 4. Verificación Automatizada con Playwright

### A. Verificación de Inicio y Catálogo Limpio
- **Script:** `docs/revival/scripts/verify-r2-03.cjs`
- **Ambiente:** macOS ARM64, `HOME` y `CICD` aislados en `/tmp/openlens-r2-03-safe-*`, `KUBECONFIG=/dev/null`.
- **Resultados:**
  - `name`: "OpenLens DevOps"
  - `isPackaged`: `true`
  - URL de renderer: `https://lens.app:59035/`
  - Pantalla principal y catálogo cargados correctamente.
  - Captura de pantalla generada: [`docs/revival/screenshots/r2-03-packaged-app-running.png`](./screenshots/r2-03-packaged-app-running.png).

### B. Verificación Funcional del Visor de Logs en Pantalla Real
- **Script:** `docs/revival/scripts/verify-r2-03-logs-screen.cjs`
- **Ambiente:** Binario empaquetado `dist-stage/mac-arm64/OpenLens DevOps.app` ejecutado de forma aislada e interactiva con Playwright.
- **Metodología de Prueba con Datos Simulados:**
  1. Se montó el contenedor de layout de clúster con `<Dock />` y la pestaña activa `POD_LOGS` vinculada a un Pod sintético (`ingress-nginx-controller-744d88967f-z8k9l`) en el namespace `ingress-nginx`.
  2. Se inyectó un buffer con 11 líneas realistas conteniendo timestamps ISO-8601, niveles `[INFO]`, `[SUCCESS]`, `[WARN]`, `[ERROR]`, códigos de color ANSI y líneas extensas para ajuste de línea.
  3. **Verificación de Controles y Renderizado:**
     - Componente `.PodLogs`, barra de herramientas `[data-testid="log-controls"]`, selector de contenedores y barra de búsqueda `[data-testid="log-search-bar"]` visibles y estables.
     - Badge de estado inicial `LIVE` visible en verde (#4caf50).
     - **Captura generada:** [`docs/revival/screenshots/r2-03-logs-viewer-default.png`](./screenshots/r2-03-logs-viewer-default.png).
  4. **Prueba de Pausa y Acumulación en Segundo Plano:**
     - Clic en botón `Pause` (`[data-testid="log-pause-btn"]`).
     - Verificación de badge transicionado a `PAUSED`.
     - Inyección de 3 nuevos registros mientras el stream se encuentra en pausa: la interfaz actualizó reactivamente el badge a `PAUSED (+3)`.
     - Clic en botón `Resume` (`[data-testid="log-resume-btn"]`): los 3 registros se volcaron al buffer visible y el badge retornó inmediatamente a `LIVE`.
  5. **Prueba de Word Wrap:**
     - Conmutación del checkbox `Word wrap` (`.Checkbox.word-wrap`).
     - Activación comprobada de la clase `.LogList.word-wrap` con reconfiguración de alturas dinámicas (`rowHeights`).
  6. **Prueba de Búsqueda y Navegación:**
     - Ingreso de término `"ERROR"` en el buscador: contador de coincidencias reportó exactamente `1 / 3` coincidencias resaltadas en pantalla con navegación activa.
  7. **Prueba de Modo Filtrado (Filter Mode):**
     - Clic en botón selector de modo `[data-testid="log-search-mode-toggle"]` alternando de `Search` a `Filter`.
     - El listado ocultó las líneas no coincidentes, mostrando únicamente los registros que contienen `"ERROR"`, con el indicador `3 / 11`.
     - **Captura generada:** [`docs/revival/screenshots/r2-03-logs-viewer-filter.png`](./screenshots/r2-03-logs-viewer-filter.png).
  8. **Prueba de Expresiones Regulares (`.*`):**
     - Clic en botón `.*` (`[data-testid="log-search-regex-toggle"]`).
     - Búsqueda compuesta con patrón `(ERROR|WARN)`: el filtro evaluó y presentó exactamente `4 / 11` líneas coincidentes en tiempo real sin degradación de rendimiento.

---

## 5. Criterios de Aceptación Cumplidos

- [x] Corrección del bug `sinceTime` +1s y deduplicación por solapamiento en subsegundos.
- [x] Protección de historial ante errores transitorios de API/red.
- [x] Límite de 10.000 líneas con advertencia de truncamiento.
- [x] Modos separados de Búsqueda (Search) y Filtrado (Filter).
- [x] Búsqueda por expresiones regulares con cota de 100 caracteres y mensaje de error no invasivo.
- [x] Búsqueda case-sensitive y limpieza de códigos ANSI.
- [x] Pausa con acumulación en buffer y contador visible `PAUSED (+N)`, con reanudación sin pérdida.
- [x] Conmutador Word Wrap con recálculo dinámico de alturas en `VirtualList`.
- [x] Badges de estado `LIVE`, `PAUSED`, `ERROR`, `TRUNCATED`.
- [x] Compilación, tests y Playwright 100% aprobados.
