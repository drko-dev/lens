# OpenLens DevOps — H4 Technical Implementation Report
## Versioned Persistence, Workspace Recovery & Safe Restoration

**Target:** Milestone H4 — Versioned Persistence, Workspace Recovery, and Safe Restoration of Native Detached Windows  
**Platform:** macOS ARM64 (Apple Silicon Mac M4) · Electron 45.2.0 · React 17 · MobX 6  
**Status:** COMPLETED & VERIFIED  

---

## 1. Executive Summary

Milestone H4 implements declarative, versioned persistence (`LayoutV1`) across application restart cycles for OpenLens DevOps. Complex nested tree layouts, tab groups, split ratios, custom workspace templates, and native detached window intentions are reliably saved and restored.

### 1.1 Invariant: Inert Restoration

A core architectural invariant of Milestone H4 is that **restoring visual state never triggers live operations**:
- **Kubetail:** Restores panel placement and configuration inertly; never connects automatically to cluster log streams.
- **Resource Details:** Restores read-only view state without live API polling.
- **Terminal:** Never spawns background PTYs or shells on layout restoration.
- **Detached Windows:** Rebuilds session intention as a recoverable placeholder in the primary workspace; never opens phantom `BrowserWindow` instances without explicit user authorization.

---

## 2. Key Architecture & Components

### 2.1 The `LayoutV1` Persistence Schema
Defined in `packages/core/src/renderer/components/split-panel/split-panel-types.ts` and `packages/core/src/common/workspace/workspace-types.ts`:

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
  readonly schemaVersion: "LayoutV1";
  readonly version?: 3;
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

### 2.2 Sanitization & Boundary Protections
In `packages/core/src/common/workspace/session-snapshot.ts`:
- **Strict Tree Bounds:** Enforces `depth <= 8` and total node count `<= 32`.
- **Node ID De-duplication:** Automatically assigns unique IDs if duplicates appear in stored trees.
- **Ratio Clamping:** Ratios are clamped between `0.15` and `0.85` (with minimum/maximum split bounds at `0.20` and `0.80`).
- **Zero Sensitive Fields:** Rejects tokens, bearer headers, kubeconfig paths, private keys, passwords, and raw Kubernetes managed fields.

### 2.3 Debounced Persistence Routine
In `packages/core/src/renderer/components/split-panel/split-panel-store.ts`:
- **Debounced Save (300 ms):** UI operations like divider dragging and ratio adjusting debounce writes to disk, avoiding I/O starvation.
- **Immediate Flush:** Explicit workspace actions (`saveCustomWorkspace`, `selectWorkspace`, window close) persist immediately with `persistToStorage(true)`.
- **Corrupted Backup:** If stored JSON fails parsing or schema validation, the raw string is safely archived in `localStorage["openlens:split-layout:corrupted-backup"]` and the default layout is safely restored.

### 2.4 Inert Recovery UX & Placeholders
In `packages/core/src/renderer/components/split-panel/dynamic-layout-renderer.tsx` and `split-panel-layout.tsx`:
- Restored detached windows render a distinct **"ESTADO INERTE"** badge (`.detachedInertBadge`).
- Provides two explicit interactive choices:
  1. **"Reabrir ventana externa":** Launches the native Electron window with its restored multi-monitor geometry (`width`, `height`, `x`, `y`).
  2. **"Volver al workspace (Redock)":** Re-integrates the panel into the main tree directly.

---

## 3. Migration Capabilities

| Source Version | Target | Transformation Applied | Status |
| :--- | :--- | :--- | :---: |
| **H1 Legacy (`version: 1`)** | `LayoutV1` | Converts 58/42 dual split into a horizontal BranchNode with active leaves | **VERIFIED** |
| **H2 Dynamic (`version: 2`)** | `LayoutV1` | Wraps tree into `LayoutV1` with `detachedWindows: []` | **VERIFIED** |
| **H3 Detached Windows** | `LayoutV1` | Extracts `detachedPanels` into `PersistedDetachedWindow[]` with geometry | **VERIFIED** |
| **Malformed / Corrupt** | `LayoutV1` | Creates diagnostic backup in `corrupted-backup`; loads `h1-default` template | **VERIFIED** |
