# Arquitectura H2 — Catálogo de Paneles, Composición Dinámica y Workspaces Configurables

- **Proyecto:** OpenLens DevOps
- **Hito:** H2 — Catálogo de paneles, composición dinámica y workspaces configurables
- **Fecha:** 1 de noviembre de 2026
- **Plataforma:** macOS Apple Silicon (Mac M4, ARM64)
- **Estado:** Especificación y Diseño Arquitectónico

---

## 1. Principios Arquitectónicos y Restricciones de H2

1. **Evolución No Destructiva sobre H1:**
   - La arquitectura H2 preserva el contrato básico de H1: el modo Split Clásico (Kubetail + Details 58/42) y el modo Mono-panel siguen siendo presets de primera clase con 100% de compatibilidad.
   - Si el feature flag `OPENLENS_FLOATING_PANELS` no está activo o si el usuario elige el modo clásico, el layout colapsa limpiamente a la vista clásica sin overhead.

2. **Árbol de Disposición Tipado (`SplitLayoutTree`):**
   - El motor de layout abandona la limitación binaria plana mediante un árbol jerárquico recursivo (`SplitLayoutNode = SplitLayoutBranch | SplitLayoutGroup | SplitLayoutLeaf`).
   - Soporte nativo para divisiones ortogonales anidadas: horizontal (Side-by-Side) y vertical (Stacked / Arriba-Abajo).
   - Grupos de pestañas (`SplitLayoutGroup`) para acomodar múltiples paneles en una misma zona espacial cuando el espacio es reducido.

3. **Invarianza de Ciclo de Vida y Sesión (Lifecycle Invariance):**
   - Mover, redimensionar, agrupar o maximizar un panel **nunca** debe desmontar el cliente de logs subyacente, watcher de Kubernetes o sesión de terminal.
   - Cada panel cuenta con una identidad estable (`panelId`), asignación de contexto (`clusterId`), namespace y referencias sanitizadas.
   - Un panel no debe duplicar streams ni sockets, y el cierre de un panel no debe interferir con otras instancias concurrentes.

4. **Persistencia Inerte y Segura (Zero-Secret Guarantee):**
   - La serialización del workspace (`SerializedSplitLayoutV2`) persiste exclusivamente geometría, tipos de panel, orden, ratios y referencias públicas de recursos.
   - **Prohibición absoluta:** Nunca persistir tokens, credenciales, certificados, contenidos de logs, variables de entorno sensibles o kubeconfigs.
   - Restauración inerte: Al reabrir OpenLens o cambiar de workspace, la geometría se dibuja sin ejecutar conexiones destructivas o privileged terminals automáticamente.

5. **Restricción de Ventanas:**
   - H2 se circunscribe íntegramente dentro de la ventana principal de Electron.
   - No se crean `BrowserWindow` independientes (diferido a H3: Multi-monitor).
   - No se introducen motores externos de docking pesados (e.g. GoldenLayout o FlexLayout con cientos de dependencias DOM innecesarias); se reutiliza `@openlens/resizing-anchor` con wrappers nativos React 17 + MobX.

---

## 2. Modelo de Datos y Contratos Tipados

```typescript
// Tipos de paneles soportados en el catálogo H2
export type PanelKind =
  | "kubetail"
  | "resource-details"
  | "pods"
  | "deployments"
  | "events"
  | "terminal"
  | "resource-editor";

// Elemento del Catálogo de Componentes
export interface PanelCatalogItem {
  readonly kind: PanelKind;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly category: "observability" | "workloads" | "details" | "tools";
  readonly available: boolean;
  readonly unavailableReason?: string;
  readonly defaultTitle: string;
}

// Nodo Hoja (Panel individual)
export interface SplitLayoutLeaf {
  readonly id: string;
  readonly type: "leaf";
  readonly panelKind: PanelKind;
  readonly title?: string;
  readonly resourceBinding?: PanelResourceBinding;
  readonly isMaximized?: boolean;
}

// Grupo de Pestañas (Múltiples paneles en la misma región)
export interface SplitLayoutGroup {
  readonly id: string;
  readonly type: "group";
  readonly activePanelId: string;
  readonly panels: SplitLayoutLeaf[];
}

// Rama de División (Horizontal o Vertical)
export interface SplitLayoutBranch {
  readonly id: string;
  readonly type: "branch";
  readonly orientation: "horizontal" | "vertical";
  readonly ratio: number; // 0.15 - 0.85
  readonly first: SplitLayoutNode;
  readonly second: SplitLayoutNode;
}

export type SplitLayoutNode = SplitLayoutBranch | SplitLayoutGroup | SplitLayoutLeaf;
```

---

## 3. Plantillas de Workspaces Configurables

Se implementan 3 plantillas iniciales integradas:

1. **Plantilla Operación (`operation`):**
   - Split Horizontal:
     - Izquierda: `Pods` (visión general de workloads en ejecución).
     - Derecha: Split Vertical:
       - Arriba: `Deployments` (estado de réplicas y rollouts).
       - Abajo: `Kubetail` (streaming de logs en tiempo real).

2. **Plantilla Incidentes (`incidents`):**
   - Split Horizontal (60/40):
     - Izquierda: `Kubetail` (streaming multi-pod de logs).
     - Derecha: Split Vertical:
       - Arriba: `Events` (advertencias y eventos del clúster).
       - Abajo: `Resource Details` (inspección detallada de causas de fallo).

3. **Plantilla Desarrollo (`development`):**
   - Split Horizontal:
     - Izquierda: `Pods` (lista interactiva de pods).
     - Derecha: Split Vertical:
       - Arriba: `Terminal` (consola de comandos y depuración).
       - Abajo: `Resource Details` (especificación y condiciones del pod).

4. **Plantilla H1 Default (`h1-default`):**
   - Distribución 58/42 tradicional: Kubetail a la izquierda, Resource Details a la derecha.

---

## 4. Estrategia de Migración y Compatibilidad hacia Atrás

- **Lectura V1:** Si el almacenamiento local contiene un layout con `version: 1` (H1), el convertidor `migrateV1ToV2` genera automáticamente una rama horizontal con Kubetail en `first` y Resource Details en `second`.
- **Sanitización Estricta:** La función `sanitizeSplitLayoutV2` valida de forma recursiva que cada nodo del árbol contenga solo campos permitidos, descartando nodos corruptos o tipos no registrados, con fallback seguro a la plantilla predeterminada.
- **Rollback Instantáneo:** La interfaz ofrece un botón visible en la barra de herramientas para restaurar el layout predeterminado o regresar al modo clásico de panel único.
