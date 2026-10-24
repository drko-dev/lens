# OpenLens DevOps Revival — R7-08 Arquitectura

**Hito:** R7-08 — Diagnóstico Avanzado de Pods (`Attach Debug Container`, Ergonomía de Logs, Headroom de ResourceQuota)
**Fecha:** 2026-10-24
**Rama:** `feat/r7-08-pod-diagnostics`
**Base:** `86d5662c7caa63b2b5de7539a1321aa261ed0fdb` (Integración limpia R7-05 + R7-06 sobre R7-04)

---

## 1. Visión y Objetivos

El hito **R7-08** implementa la suite de observabilidad y diagnóstico operativo en tiempo real de cargas de trabajo Kubernetes en OpenLens, orientada a entornos productivos de alta exigencia, bajo la arquitectura *local-first*, sin telemetría ni dependencias propietarias.

Resuelve tres pilares operacionales críticos:
1. **Pilar A — Ephemeral Debug Containers (`Attach Debug Container`):** Inyección no intrusiva de contenedores de depuración mediante el subrecurso oficial de Kubernetes `pods/ephemeralcontainers` (v1.23+ GA / v1.25+ standard), permitiendo diagnosticar contenedores distroless/scratch sin reiniciar el Pod ni alterar su especificación original de workloads.
2. **Pilar B — Ergonomía Avanzada de Logs:** Filtrado temporal granular (`sinceSeconds`: 15m, 1h, 4h, 24h, All), límite de líneas (`tailLines`: 100, 500, 1000, All), alternancia de modo Raw/JSON estructurado con resaltado sintáctico, extracción de atributos clave, sanitización XSS y descarte reactivo de peticiones asíncronas lentas o fuera de orden.
3. **Pilar C — Headroom de ResourceQuota y Observabilidad:** Parser matemático puro de cantidades Kubernetes (CPU millicores, memoria binaria/decimal SI, contadores enteros), cálculo de headroom `(used / hard) * 100` con umbrales semánticos (`<80%` normal, `80-90%` warning, `>=90%` critical, `N/A` para hard inexistente o cero), y visualización desglosada tanto en el Drawer de Namespace como en el Overview del Clúster.

---

## 2. Topología y Separación de Responsabilidades

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 PRESENTATION LAYER (React 17 + MobX)                             │
├───────────────────────────────┬──────────────────────────────────┬───────────────────────────────┤
│    Pillar A: Debug Dialog     │     Pillar B: Dock Logs UI       │  Pillar C: Headroom Widgets   │
│ - Presets (busybox, netshoot) │ - Controls (Since, Tail, Format) │ - ResourceQuotaHeadroom Bar   │
│ - Target container / PID share│ - JSON Structured Log Formatter  │ - NamespaceDetails DrawerItem │
│ - PROD Guard (#EF4444)        │ - Monotonic Request Tracking     │ - ClusterOverview Quota Block │
│ - Immutability Warning Banner │ - Log List with Fallback Parser  │ - Status Badges & Unclamped % │
└───────────────┬───────────────┴─────────────────┬────────────────┴───────────────┬───────────────┘
                │                                 │                                │
                ▼                                 ▼                                ▼
┌───────────────────────────────┐ ┌────────────────────────────────┐ ┌─────────────────────────────┐
│ PodApi (Subresource Client)   │ │ LogStore & TabStore (MobX)     │ │ Pure Math Engines           │
│ - Endpoint:                   │ │ - Active tab isolation         │ │ - quantity-parser.ts        │
│   /api/v1/.../ephemeralcontainers│ - Query params: sinceSeconds,   │ │   (millicores, bytes, int)│
│ - Strategic Merge PATCH       │     tailLines, logFormat         │ │ - headroom-calculator.ts    │
│ - ResourceVersion conflict 409│ - Dynamic request invalidation   │ │   (status brackets, N/A, %) │
│ - Pre-flight cluster checks   │ - XSS Sanitizer & Field Matcher  │ │ - KubeObject store reader   │
└───────────────┬───────────────┘ └────────────────┬───────────────┘ └─────────────┬───────────────┘
                │                                  │                               │
                ▼                                  ▼                               ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   KUBERNETES API SERVER (v1.23+)                                 │
│  - PATCH /api/v1/namespaces/{ns}/pods/{pod}/ephemeralcontainers (application/strategic-merge-patch)│
│  - GET /api/v1/namespaces/{ns}/pods/{pod}/log?sinceSeconds=...&tailLines=...                     │
│  - GET /api/v1/resourcequotas                                                                    │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Pilar A — Arquitectura de Ephemeral Debug Containers

### 3.1 Subrecurso Oficial y Semántica de Parcheo
A diferencia de los contenedores regulares de un Pod (`spec.containers`), los contenedores efímeros se gobiernan exclusivamente mediante el subrecurso:
```http
PATCH /api/v1/namespaces/{namespace}/pods/{name}/ephemeralcontainers
Content-Type: application/strategic-merge-patch+json
```
- **Preservación de contenedores previos:** La llamada inspecciona `pod.spec.ephemeralContainers` y realiza un *append* del nuevo contenedor sin sobrescribir los previamente añadidos.
- **Inmutabilidad y advertencia persistente:** Una vez inyectado, Kubernetes prohíbe eliminar o alterar el contenedor efímero de la especificación del Pod (permanece hasta la terminación del Pod). La UI despliega un banner de advertencia visual explícito informando al operador sobre la persistencia de la modificación.
- **Control de concurrencia optimista (`resourceVersion`):** El payload incluye `metadata: { resourceVersion }` para que Kubernetes pueda rechazar con `HTTP 409 Conflict` un PATCH basado en una versión obsoleta. Las pruebas locales verifican el payload y la propagación de conflictos mediante mocks; no ejercitan un API server real.
- **Nombres RFC 1123 únicos:** Se generan automáticamente con el patrón `debugger-<short-hash>-<timestamp>` y se valida la no-duplicidad antes del despacho.

### 3.2 Presets de Imágenes y Compartición de Namespace de Procesos
- **Presets embebidos:**
  - `nicolaka/netshoot:latest` (Herramientas completas de red: `tcpdump`, `curl`, `dig`, `iperf`, `tshark`).
  - `busybox:latest` (Shell ultraligero estándar).
  - `alpine:latest` (Base ligera con gestor de paquetes `apk`).
  - `curlimages/curl:latest` (Utilidad ligera para pruebas de conectividad HTTP/REST).
  - `Custom` (Entrada libre de imagen privada/corporativa).
- **Process Namespace Sharing (`targetContainerName`):**
  - Permite enlazar el namespace de procesos del contenedor de depuración al contenedor de la aplicación objetivo mediante `targetContainerName`.
  - Permite inspeccionar `/proc/<pid>` del contenedor objetivo incluso si el Pod no tiene habilitado `shareProcessNamespace: true` a nivel global.

### 3.3 PROD Guard y Protección Multi-Clúster
- **Identificación Canónica de Entornos:**
  - La UI consulta la configuración canónica de clústeres mediante `getClusterEnvironmentConfig(cluster?.preferences)`, reconociendo los entornos oficiales: `PRODUCTION`, `STAGING`, `DEVELOPMENT`, `TESTING / QA`, `LOCAL`, `CUSTOM` y `NONE`.
  - Cuando el Pod pertenece a un clúster clasificado como producción (`isProductionEnvironment(cluster)`):
    - La interfaz se tiñe con un banner de alto contraste en rojo `#EF4444`.
    - **Doble confirmación operativa:** El botón de confirmación ("Attach Debug Container") se deshabilita hasta cumplir dos condiciones obligatorias:
      1. Marcar explícitamente el checkbox de confirmación consciente.
      2. Tipear el nombre exacto del Pod objetivo en el campo de texto de confirmación.
    - Si el operador cambia de Pod o de clúster, el diálogo resetea inmediatamente la confirmación para evitar reutilización espuria.
- **Cancelación Cooperativa (GET → Cancel → PATCH):**
  - `PodApi.attachEphemeralContainer()` recibe `signal?: AbortSignal` e `isCancelled?: () => boolean`.
  - El estado se valida al inicio, antes del GET, tras resolverse el GET y justo antes de despachar el PATCH; después del PATCH se vuelve a comprobar para descartar la continuación local si la operación quedó obsoleta.
  - Si se cancela mientras el GET está pendiente, la comprobación cooperativa puede detener el flujo antes de despachar el PATCH. Las pruebas Jest verifican este comportamiento con un cliente HTTP mockeado. `AbortSignal` no revierte un PATCH ya despachado ni una mutación aceptada por Kubernetes; en ese caso el cliente puede abandonar el seguimiento, pero el resultado del PATCH puede seguir completándose.
- **Validación Cooperativa de 9 Precondiciones Antes del PATCH (Hallazgo A):**
  - La interacción entre `AttachDebugContainerDialog` y `PodApi.attachEphemeralContainer()` vuelve a comprobar localmente las precondiciones relevantes al inicio, antes y después del GET, y justo antes del PATCH. La comprobación posterior al PATCH solo protege la continuación del flujo de UI; no puede deshacer una petición enviada.
    1. `options.signal.aborted`: Verificación del `AbortSignal`.
    2. `options.isCancelled()`: Verificación de cancelación explícita del diálogo.
    3. `options.getCurrentGeneration() === options.generation`: Token de generación monótona (invalida operaciones superadas por aperturas posteriores).
    4. `options.getCurrentClusterId() === options.clusterId`: Identidad estricta del clúster activo.
    5. `options.isClusterHealthy()`: Estado de conexión y salud del clúster.
    6. `resource.name === options.expectedName && resource.namespace === options.expectedNamespace`: Descriptores iniciales del objetivo.
    7. `freshPod.getId() === options.expectedPodUid`: Verificación del UID del Pod devuelto por el GET interno de Kubernetes (detecta si el Pod fue eliminado y recreado con el mismo nombre).
    8. `freshPod.getName() === options.expectedName && freshPod.getNs() === options.expectedNamespace`: Verificación del Pod retornado.
    9. `options.validateContext(freshPod)`: Validación contextual del clúster (detecta transiciones espurias a producción sin confirmación).
  - Si una precondición aplicable falla antes del despacho, el flujo termina con `AbortError` / `412 Precondition Failed` sin invocar `request.patch()` en las rutas cubiertas por las pruebas mockeadas. Son comprobaciones cooperativas locales, no un bloqueo atómico frente a cambios ocurridos después de la última comprobación. El `resourceVersion` enviado en el payload es el control de concurrencia del lado de Kubernetes; su comportamiento real no se probó contra un API server en este hito.

- **Barrera de Reentrancia y Prevención de Doble Ejecución (Hallazgo C):**
  - En `AttachDebugContainerDialog`, la bandera observable `this.isExecuting` actúa como candado reentrante en `attachAndLaunch()` (`if (this.isExecuting || this.submitting || this.waitingForReady) return;`).
  - Bloquea dobles clics rápidos y despachos programáticos concurrentes sin abortar ni invalidar la generación de la operación legítima que ya se encuentra en curso.
  - Se libera de forma atómica en bloques `finally`, `close()`, `componentWillUnmount()` y al cambiar de Pod.

- **Validación de Identidad y Conexión Multi-Clúster:**
  - Inmediatamente antes de emitir la llamada de red y en cada iteración de polling, se re-valida que el clúster activo siga coincidiendo con el clúster inicial, que la conexión esté sana (`isClusterConnectionHealthy`), que el Pod UID coincida con el inicial, y que la generación monótona (`currentGeneration`) coincida. Si alguna condición falla, la acción se cancela de forma atómica sin abrir terminales.

---

## 4. Pilar B — Ergonomía de Logs y Formateador Estructurado JSON

### 4.1 Parámetros de Consulta Temporales y de Límite
- **Filtro Temporal (`sinceSeconds`):**
  - `15m` → `900` segundos.
  - `1h` → `3600` segundos.
  - `4h` → `14400` segundos.
  - `24h` → `86400` segundos.
  - `All` → `undefined` (sin restricción).
  - Integrado de forma no conflictiva con el streaming continuo: durante el poll subsiguiente, `sinceSeconds` no compite con `sinceTime`.
- **Límite de Líneas (`tailLines`):**
  - Opciones: `100`, `500`, `1000`, `All` (`undefined`).
  - Protege el consumo de memoria del proceso de renderizado frente a pods altamente verbosos.
- **Aislamiento por Pestaña:**
  - Cada pestaña del Dock mantiene su propia configuración independiente (`sinceSeconds`, `tailLines`, `logFormat`) en el `TabStore` de MobX, respaldada por validación de esquema con `superstruct` (`LogTabDataValidator`).

### 4.2 Motor Formateador JSON y Protección XSS (`json-log-formatter.ts`)
- **Detección inteligente de JSON:**
  - Soporta payloads JSON puros, así como líneas con prefijo RFC 3339 de Kubernetes (`2026-10-24T04:00:00.123456789Z {"level":"info",...}`).
  - Extracción normalizada de campos heterogéneos:
    - Nivel/Severidad: `level`, `lvl`, `severity`, `log_level` → Normalizado a `INFO`, `WARN`, `ERROR`, `DEBUG`.
    - Mensaje principal: `msg`, `message`, `error`, `text`.
    - Marca de tiempo: `ts`, `time`, `timestamp`, `@timestamp`.
    - Llamador: `caller`, `source`, `logger`.
- **Sanitización contra Inyección XSS:**
  - Todas las cadenas extraídas (claves, valores, mensajes y caller) se escapan obligatoriamente a través de `escapeHtml()` antes de ser inyectadas en el árbol DOM.
- **Fallback transparente:**
  - Líneas no estructuradas (texto plano, trazas de excepción Java/Python, logs de inicio) se representan de forma limpia en el visor sin emitir errores de parsing ni desordenar la vista.

### 4.3 Prevención de Respuestas Tardías (Monotonic Request ID)
- Se incorporó un contador incremental de peticiones en `LogStore`:
  - Al cambiar cualquier filtro (`sinceSeconds`, `tailLines`, o contenedor), se incrementa `activeRequestId`.
  - Al resolverse la petición HTTP de logs, se compara el ID de la respuesta con el ID activo de la pestaña. Si el ID no coincide, la respuesta se descarta en silencio sin sobrescribir el búfer visual.

---

## 5. Pilar C — Headroom de ResourceQuota y Observabilidad

### 5.1 Parser Puro de Cantidades (`quantity-parser.ts`)
Implementado como función matemática pura y determinística sin dependencias externas:
- **CPU (millicores):**
  - Notación millicores: `100m` → `100`, `2500m` → `2500`.
  - Notación decimal o entera: `1` → `1000`, `0.5` → `500`, `2.5` → `2500`.
- **Memoria y Almacenamiento (bytes):**
  - Binario SI (base 1024): `Ki` ($1024$), `Mi` ($1024^2$), `Gi` ($1024^3$), `Ti` ($1024^4$).
  - Decimal SI (base 1000): `k` ($1000$), `M` ($1000^2$), `G` ($1000^3$), `T` ($1000^4$).
  - Bytes planos: `1048576` → `1048576`.
- **Contadores de Objetos (enteros):**
  - `pods`, `persistentvolumeclaims`, `services`, `secrets`, `configmaps` procesados directamente como enteros.

### 5.2 Motor de Cálculo de Headroom (`headroom-calculator.ts`)
- **Fórmula de Headroom y Utilización:**
  $$\text{Porcentaje de Uso} = \frac{\text{used}}{\text{hard}} \times 100$$
  $$\text{Headroom (Disponible)} = \text{hard} - \text{used}$$
- **Clasificación por Umbrales Semánticos:**
  - `< 80%` → **Normal** (Verde).
  - `80%` a `< 90%` → **Warning** (Ámbar / Amarillo).
  - `>= 90%` → **Critical** (Rojo `#EF4444`).
- **Comportamiento ante Casos de Borde:**
  - **Distinción Estricta entre Cero Explícito y Datos Desconocidos/Faltantes (Hallazgo B):**
    - Si Kubernetes reporta un uso explícito de `"0"` o `"0m"` o `"0Ki"` con un límite hard válido, se calcula fidedignamente `percentage: 0` y estado `normal`.
    - Si el objeto `ResourceQuota` carece de `status`, o `status.used` es nulo/indefinido, o la clave específica está ausente en `status.used`, el calculador **no** asume 0; clasifica el recurso de forma segura como `status: "na"`, `percentage: undefined` y `usedFormatted: "N/A"`, evitando falsos reportes de disponibilidad.
  - **Límite Hard Faltante o Cero:** Retorna `status: "na"`, `percentage: undefined`, evitando división por cero o NaN.
  - **Uso Excedido (`used > hard`):** El porcentaje **no** se recorta a 100% (ej. si el uso es 12 y el límite 10, muestra `120%` en estado `critical` para advertir sobre la sobreasignación).

### 5.3 Integración en la Interfaz
1. **`ResourceQuotaHeadroom`:** Barra visual de progreso con etiquetas numéricas (ej. `7.5 / 10 Cores (75%)`), tooltip explicativo e indicador de estado de alerta.
2. **`NamespaceDetails`:** Incorporación de la sección "Quota Headroom" en el Drawer lateral de detalles del Namespace, permitiendo al operador ver el estado de saturación de recursos de un vistazo.
3. **`ClusterOverviewResourceQuotaBlock`:** Bloque inyectable en la vista general del clúster que agrupa las cuotas por Namespace y resalta los recursos con estado `warning` o `critical`.

---

## 6. Inyección de Dependencias (DI) e Integración de Ciclo de Vida

El diseño aprovecha `@ogre-tools/injectable` y MobX:
- `openAttachDebugContainerDialogInjectable`: Punto de entrada desacoplado consumido por `pod-devops-menu.tsx`.
- `attachDebugContainerDialogStateInjectable`: Estado observable reactivo desacoplado del ciclo de render.
- `attachDebugContainerDialogClusterFrameChildComponentInjectable`: Registro del componente en el marco del clúster.
- `clusterOverviewResourceQuotaBlockInjectable`: Inyección extensible del bloque de cuotas en la visión general del clúster.
- Ciclo de vida MobX gestionado rigurosamente mediante `reaction()` en `componentDidMount` y desuscrito con `disposeOnUnmount(this, [...])` para prevenir fugas de memoria.

## 7. Alcance de Evidencia y Validación

- Las pruebas de integración del cliente Kubernetes usan mocks; no se ejecutó un API server real ni se mutó un clúster.
- Los cinco escenarios visuales Playwright registrados usan un harness React sintético y no arrancan ni certifican Electron empaquetado.
- Las comprobaciones cooperativas previas al PATCH son locales; `metadata.resourceVersion` es el control de concurrencia separado que se envía a Kubernetes. La respuesta real del API server no se verificó en R7-08.
- La regresión acumulativa de R7-01 a R7-08 y la certificación Electron corresponden a R7-09.
