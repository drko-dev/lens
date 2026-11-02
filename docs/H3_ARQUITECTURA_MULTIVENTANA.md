# H3: Arquitectura Multiventana, Desacoplamiento de Paneles y Soporte Multimonitor

**Proyecto:** OpenLens DevOps  
**Repositorio:** `/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections`  
**Rama:** `feature/floating-panels-h3`  
**Fecha:** 2026-11-01  
**Plataforma de desarrollo y validación:** macOS Apple Silicon (Mac M4)  
**Autor:** Principal Software Engineer & Electron Architect  

---

## 1. Resumen Ejecutivo y Auditoría de Infraestructura Preexistente

El Hito H3 aborda la **extracción de paneles dinámicos a ventanas nativas independientes (`BrowserWindow`)**, permitiendo flujos de trabajo multimonitor en macOS (por ejemplo, Kubetail en pantalla secundaria mientras se examinan Deployments y Pods en la principal), garantizando **propiedad única de sesión** (single owner) y **cero duplicación de streams**.

### 1.1 Auditoría del Subsistema `detached-tool-windows`

La auditoría del código preexistente en `packages/core/src/main/detached-tool-windows/` reveló una base sólida de seguridad que **se reutiliza sin reinventar**:

| Componente | Archivo Fuente | Estado / Capacidad Actual | Adaptación Requerida para H3 |
|---|---|---|---|
| **Registro Central de Ventanas** | `detached-window-registry.ts` | Bookkeeping puro, límite de 16 ventanas, deduplicación por `sessionKey` (`cluster/workspace/tab/toolKind`). | Añadir soporte para Workloads (`Deployment`, `StatefulSet`, `DaemonSet`) en descriptores de logging, además de `Pod`. |
| **Fábrica de BrowserWindow** | `open-detached-tool-window.injectable.ts` | Ventana Electron ultra-aislada: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, CSP estricta, permisos denegados. | Reutilización directa. Carga `detached-tool.html` con preload seguro `detached-tool-preload.js`. |
| **Aislamiento IPC** | `detached-window-ipc.ts` | Allowlist estricta (`get-context`, `request-redock`, `start`, `refresh`), validación de `mainFrame` del sender. | Reutilización directa. Prevención de inyección y suplantación de identidad. |
| **Gestor de Sesiones de Datos** | `detached-tool-session-manager.ts` | Main es dueño exclusivo del stream de datos (`openLogStream` directo a `kube-auth-proxy`). Maneja `onClosed`. | Permitir streaming de Pod asociado a un Workload (`logs.pod`), garantizando el flujo de Kubetail. |
| **Canales Frame <-> Main** | `detached-tool-channels.ts` | `requestDetach`, `requestRedock`, `listDetached`, `redocked`. | Ampliación de tipos de request para aceptar `pod` opcional en opciones de logs. |

---

## 2. Contrato Tipado de Desacoplamiento (H3)

Para desacoplar un panel sin comprometer la seguridad ni perder la reactividad de MobX, se establece el siguiente contrato tipado en `packages/core/src/renderer/components/split-panel/split-panel-types.ts`:

```typescript
export interface DetachedPanelDescriptor {
  readonly panelId: string;
  readonly panelKind: PanelKind;
  readonly workspaceId: string;
  readonly clusterId: string;
  readonly namespace?: string;
  readonly resource?: {
    readonly kind: string;
    readonly name: string;
    readonly namespace?: string;
    readonly uid?: string;
    readonly apiVersion?: string;
  };
  readonly sessionKey: string;
  readonly windowId?: number;
  readonly isDetached: boolean;
  readonly detachedAt?: number;
}
```

### 2.1 Invariantes de Identidad y Ciclo de Vida

Cada panel mantiene una identidad estable a lo largo de las 6 fases del ciclo:

```
[1. Acoplado en Workspace] 
         │ (Usuario hace clic en "Desacoplar a ventana")
         ▼
[2. Transferencia de Sesión: Detener stream local -> Registrar detachedState]
         │ (Main abre BrowserWindow y adquiere el ownership)
         ▼
[3. Ventana Nativa Activa (Multimonitor)] <───> [Workspace Principal: Placeholder Detached]
         │                                              │
         │ (Mover a monitor externo / Redimensionar)    │
         ▼                                              ▼
[4. Reacoplamiento Iniciado] (Clic en "Redock" o botón nativo de cierre de macOS)
         │
         ▼
[5. Destrucción de Ventana Secundaria -> Main envía evento 'redocked' al Cluster Frame]
         │
         ▼
[6. Workspace Principal Restaura Panel Activo y Reactiva Conexión Única]
```

### 2.2 Eliminación de Valores Demo y Rollback Transaccional

A diferencia de implementaciones prototípicas, el motor H3 exige:
1. **Binding Real de Recursos:** Se eliminaron por completo valores fijos o simulados (`demo-web`, `demo-apps`, UIDs ficticios). `detachPanel()` exige un recurso real extraído del estado activo (`kind`, `name`, `namespace` y `clusterId` válido). Para inspectores y logs, se valida estrictamente un identificador RFC 4122 hexadecimal (`/^[0-9a-fA-F-]{1,64}$/`). Si falta cualquiera de estos datos, el desacoplamiento se rechaza de forma fail-closed.
2. **Transferencia Segura y Rollback Transaccional:**
   - Previo a la llamada IPC, se solicita detener el stream local (`onStreamStopRequested`).
   - El panel **no** se registra en `detachedPanels` hasta que el proceso Main confirma la creación y el identificador `windowId` de la nueva `BrowserWindow`.
   - Si la apertura de la ventana o el canal IPC falla, se activa automáticamente el rollback: se restaura el stream local (`onStreamResumeRequested`), no se modifica la distribución del workspace y el panel jamás queda en un estado desacoplado huérfano.

---

## 3. Principio de Propiedad Única de Sesión (Single Owner Streaming)

En Kubetail multi-pod:
- **Antes del desacoplamiento:** El renderer en el cluster frame de OpenLens ejecuta el stream mediante `KubetailStore.startStream()`.
- **Durante la transferencia:** 
  1. El renderer invoca `onStreamStopRequested(leafId)` deteniendo el stream local.
  2. El renderer invoca `detachedToolFrameChannels.requestDetach`.
  3. Main recibe el request, verifica credenciales y contexto del cluster frame emisor, y abre el `BrowserWindow`.
  4. Cuando la ventana secundaria emite `detached-tool:start`, Main inicia `openLogStream()` hacia `kube-auth-proxy` enviando líneas en vivo de forma continua con latidos de actividad.
- **Invariante Verificable:** En ningún instante coexisten dos suscripciones de streaming activas al mismo tiempo sobre el cluster proxy (`Streams === 1`).
- **En el Reacoplamiento:**
  1. La ventana secundaria se destruye.
  2. Main finaliza y aborta la conexión upstream.
  3. Main notifica al cluster frame con `detached-tool:redocked`.
  4. El renderer reactiva el panel y reinicia el stream local.

---

## 4. Estrategia Multimonitor en macOS Apple Silicon

1. **Gestión de Pantallas en Electron:**
   - La ventana desacoplada es una instancia estándar de `BrowserWindow` gestionada por el Window Server de macOS Quartz.
   - Las métricas y límites de pantalla se consultan directamente en el proceso Main mediante la API `electron.screen.getAllDisplays()`.
   - Puede arrastrarse libremente a pantallas externas conectadas por Thunderbolt/HDMI/AirPlay.
2. **Resiliencia ante Desconexión de Pantallas:**
   - Si una pantalla externa se desconecta físicamente, macOS reubica automáticamente la ventana dentro de los límites visibles de la pantalla principal (`display-metrics-changed`).
   - El tamaño mínimo se establece en `480x320` para evitar ventanas invisibles.
3. **Persistencia Inerte:**
   - La persistencia V2 en `localStorage` almacena el estado de los paneles del workspace; no serializa manejadores de ventanas del sistema operativo, respetando la seguridad y previniendo aperturas espontáneas de ventanas huérfanas tras reiniciar la aplicación.

---

## 5. Componentes Compatibles para Desacoplamiento (H3)

1. **Kubetail Multi-Pod Logs (`kubetail`):** P0 / Caso de uso principal. Extraíble como ventana nativa con logs en vivo y redock interactivo.
2. **Resource Details (`resource-details`):** P1. Extraíble mediante el modo inspector seguro que consulta y renderiza el manifiesto JSON formateado sin metadatos residuales sensibles (`managedFields` eliminados).
3. **Terminal (`terminal`):** P2. Integrable exclusivamente con la infraestructura existente de `detached-terminal-manager` y `node-pty`. En entornos de producción, requiere confirmación interactiva.

---

## 6. Criterios de Aceptación de H3

- [x] **CRIT-H3-01:** Botón visible "Desacoplar a ventana" en paneles compatibles.
- [x] **CRIT-H3-02:** Apertura de ventana nativa de Electron independiente y con títulos/badges claros.
- [x] **CRIT-H3-03:** En el workspace principal, el panel desacoplado muestra un placeholder con botón "Volver al workspace".
- [x] **CRIT-H3-04:** Streaming de logs continuo en la ventana secundaria sin fugas ni desconexiones.
- [x] **CRIT-H3-05:** Cero streams duplicados (`Streams === 1` estrictamente en todo momento).
- [x] **CRIT-H3-06:** Reacoplamiento limpio al pulsar "Redock" o al cerrar la ventana nativa de macOS.
- [x] **CRIT-H3-07:** Sin regresiones en H1 ni H2 (141+ tests unitarios siguen pasando).
- [x] **CRIT-H3-08:** Suite E2E de 20 escenarios en Electron 45 real con evidencias fotográficas.
