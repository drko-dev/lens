# H4: Arquitectura de Persistencia Versionada, Recuperación de Workspaces y Restauración Segura de Ventanas

**Proyecto:** OpenLens DevOps  
**Repositorio:** `/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections`  
**Rama:** `feature/floating-panels-h4`  
**Fecha:** 2026-11-02  
**Autor:** Principal Software Engineer & Electron Architect  

---

## 1. Resumen Ejecutivo y Auditoría de Persistencia (H4-A)

El Hito H4 aborda la **preservación y restauración íntegra de la experiencia visual del usuario** a través de reinicios de OpenLens DevOps, asegurando que árboles de paneles complejos, grupos de pestañas, proporciones de división, workspaces configurables y la intención de ventanas desacopladas en configuraciones multimonitor se reconstruyan con fidelidad absoluta.

### 1.1 Matriz de Auditoría de Estado y Persistencia Existente

| Dominio / Dato | Propietario | Almacenamiento Actual | Esquema Actual | Estrategia de Migración a H4 | Política de Restauración |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Workspace Global Tabs** | `WorkspaceTabsStore` / `WorkspacePersistenceStore` | Archivo `workspace-session-v1.json` vía `FileWorkspaceSessionStorageAdapter` o memory | `SessionSnapshotV1` (`SNAPSHOT_VERSION = 1`) | Preservar compatible; coordinar con `WorkspaceLayout` | Inerte; valida existencia de cluster sin iniciar conexiones. |
| **Split Layout H1 (Legacy)** | `SplitPanelStore` | `localStorage["openlens:split-layout"]` | `SerializedSplitLayoutV1` (`version: 1`) | Convertir a nodo Branch horizontal 58/42 y migrar a `LayoutV1` | Totalmente inerte; sin streaming automático. |
| **Dynamic Tree H2** | `SplitPanelStore` | `localStorage["openlens:split-layout"]` | `SerializedSplitLayoutV2` (`version: 2`) | Promover a `LayoutV1` envolviendo `rootNode` y agregando descriptores de ventanas desacopladas | Inerte; valida profundidad y tipos de panel. |
| **Detached Windows H3** | `SplitPanelStore.detachedPanels` | Solo en memoria (`Map<string, DetachedPanelState>`) | Sin serialización persistente en disco | Integrar en el contrato `LayoutV1.detachedWindows` | **Intención inerte:** Renderiza placeholder con botón explícito de re-apertura. |
| **Geometría de Ventanas** | Electron Main `detachedWindowRegistry` | No persistida | No aplica | Guardar en `LayoutV1.detachedWindows[].geometry` con bounds clamping | Fallback a pantalla principal si el monitor fue desconectado. |

---

## 2. Contrato de Persistencia Versionada: `LayoutV1` (H4-B)

El nuevo esquema de persistencia global para la composición de paneles y ventanas es `LayoutV1` (almacenado con clave `openlens:split-layout` y compatible con `SessionSnapshot`).

```typescript
export interface WindowGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly isMaximized?: boolean;
  readonly displayId?: number;
}

export interface PersistedDetachedWindow {
  readonly panelId: string;
  readonly panelKind: PanelKind;
  readonly workspaceId: string;
  readonly clusterId: string;
  readonly sessionKey: string;
  readonly title?: string;
  readonly resource?: {
    readonly kind: string;
    readonly name: string;
    readonly namespace?: string;
    readonly uid?: string;
    readonly apiVersion?: string;
  };
  readonly geometry?: WindowGeometry;
  readonly detachedAt: number;
}

export interface LayoutV1 {
  readonly schemaVersion: "LayoutV1"; // Identificador inequívoco de H4
  readonly updatedAt: number;
  readonly activeWorkspaceId: WorkspaceTemplateId | string;
  readonly isClassicMode: boolean;
  readonly maximizedPanelId?: string;
  readonly rootNode: SplitLayoutNode;
  readonly detachedWindows: PersistedDetachedWindow[];
  readonly customWorkspaces?: Record<string, {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly layout: SplitLayoutNode;
  }>;
}
```

### 2.1 Principio de Cero Secretos (Zero Credentials Guarantee)

Queda estrictamente prohibido persistir:
- Tokens de autenticación (`token`, `bearer`, `execAuth`).
- Kubeconfigs o certificados (`clientKey`, `clientCertificate`).
- Contenido de logs o búferes de terminal.
- Objetos de Kubernetes completos con metadatos internos (`managedFields`).
- Manejadores de procesos vivos, sockets o PTYs.

---

## 3. Límites Estrictos y Migraciones (H4-C)

Para prevenir denegación de servicio por memoria o inyección de estructuras maliciosas:
1. **Tamaño Máximo:** 2 MB por snapshot.
2. **Profundidad Máxima de Árbol:** 8 niveles.
3. **Cantidad Máxima de Nodos:** 32 paneles.
4. **Cantidad Máxima de Ventanas Desacopladas:** 16 ventanas simultáneas.
5. **Ratios Permitidos:** Clampeados estrictamente entre `0.20` y `0.80`.
6. **Manejo de Corrupción:** Si `JSON.parse` falla o el payload no satisface el validador, se almacena una copia segura en `openlens:split-layout:corrupted-backup` y se restaura el template `h1-default`.

---

## 4. Guardado Automático con Debounce (H4-D)

Se implementa una rutina de persistencia con debounce de 300 ms ante cualquier mutación de UI (splits, ratios, tabs, maximizar, desacoplar, reacoplar). Esto evita escrituras en disco ante cada evento de movimiento del cursor.

---

## 5. Restauración Segura e Inerte al Reinicio (H4-E & H4-F)

### 5.1 Regla de Oro: "Restaurar UI != Iniciar Sesiones"

Al reiniciar OpenLens:
- Los paneles se reconstruyen en memoria y se dibujan visualmente.
- **Kubetail:** Permanece en estado desconectado / inerte. No realiza llamadas de red ni streaming contra Kubernetes hasta que el usuario pulse explícitamente "Conectar" o seleccione un pod.
- **Resource Details:** Renderiza el estado vacío o el inspector en modo solo lectura.
- **Terminal:** NUNCA arranca un shell ni ejecuta procesos nativos en segundo plano.
- **Ventanas Externas:** No se abren automáticamente ventanas nativas secundarias al arrancar la aplicación. El workspace muestra un placeholder informativo con la opción:
  1. *Reabrir ventana externa:* Abre la `BrowserWindow` de forma controlada y con la geometría previa.
  2. *Acoplar al workspace:* Reincorpora el panel al árbol principal.

---

## 6. Geometría y Manejo Multimonitor (H4-G)

Se consultan las pantallas disponibles mediante la API `electron.screen.getAllDisplays()`.
- Si la ventana estaba en un segundo monitor y éste fue desconectado, las coordenadas `(x, y)` se reubican dentro de los límites visibles de la pantalla principal (`primaryDisplay.workArea`).
- Se garantiza tamaño mínimo de `480x320` para evitar ventanas invisibles.

---

## 7. Aislamiento entre Clústeres (H4-H)

Si un workspace fue guardado en el clúster A y OpenLens se reinicia conectado al clúster B:
- Los identificadores de recursos no se trasladan automáticamente.
- El panel muestra advertencia de contexto no coincidente y permanece desconectado.
