/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { reaction, runInAction } from "mobx";
import type { SplitPanelStore } from "../../../renderer/components/split-panel/split-panel-store";
import type { PanelKind, SplitLayoutNode } from "../../../renderer/components/split-panel/split-panel-types";
import type { GlobalLayoutScope } from "../common/global-layout-persistence";
import { showRoutePanel } from "./global-panel-store";
import { globalLayoutStorageKeys, restoreGlobalLayout, serializeGlobalLayout } from "../common/global-layout-persistence";
import type { RestoredSessionGate } from "./restored-session-gate";

export interface GlobalLayoutPersistenceOptions {
  store: SplitPanelStore;
  scope: GlobalLayoutScope;
  clusterId?: string;
  allowedKinds: readonly PanelKind[];
  singleInstance: boolean;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  gate: RestoredSessionGate;
  logger?: { warn(message: string, ...args: unknown[]): void };
  debounceMs?: number;
  now?: () => number;
}

export interface GlobalLayoutPersistence {
  restored: boolean;
  flush(): void;
  dispose(): void;
}

/**
 * H7.7: restores and persists the visual layout of one global docking store under its own
 * versioned keys. Never touches "openlens:split-layout" nor the shared WORKSPACE_TEMPLATES.
 */
export function attachGlobalLayoutPersistence(opts: GlobalLayoutPersistenceOptions): GlobalLayoutPersistence {
  const { store, scope, clusterId, allowedKinds, singleInstance, gate, logger, debounceMs = 300 } = opts;
  const now = opts.now ?? Date.now;
  const keys = globalLayoutStorageKeys({ scope, clusterId });
  const ctx = { scope, clusterId, allowedKinds, singleInstance };

  const storage = (() => {
    try {
      return opts.storage ?? window.localStorage;
    } catch {
      return undefined;
    }
  })();
  const read = (key: string): string | null => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string) => storage?.setItem(key, value);
  // Comparison snapshot ignores updatedAt so equal layouts never trigger a write.
  const snapshot = () => serializeGlobalLayout({ scope, clusterId, rootNode: store.rootNode, collapsedLeafIds: store.collapsedLeafIds, now: 0 });

  let restored = false;
  const primaryRaw = read(keys.primary);
  let result = restoreGlobalLayout(primaryRaw, ctx);

  if (!result.ok) {
    // Keep the unreadable payload aside for diagnostics (a valid ":prev" copy is never overwritten).
    if (primaryRaw) {
      try {
        write(keys.corrupted, primaryRaw);
      } catch (error) {
        logger?.warn("[GLOBAL-LAYOUT] could not back up the corrupted layout", error);
      }
    }

    const fromPrev = restoreGlobalLayout(read(keys.previous), ctx);

    if (fromPrev.ok) {
      result = fromPrev;
    }
  }

  if (result.ok) {
    const applied = result;

    runInAction(() => {
      store.rootNode = applied.rootNode as SplitLayoutNode;
      store.collapsedLeafIds.clear();
      applied.collapsedLeafIds.forEach((id) => store.collapsePanel(id));
    });
    gate.markInert(applied.inertLeafIds);
    restored = true;
    markLayoutRestored(opts.store);
  }

  let lastWritten = snapshot();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }

    const snap = snapshot();

    if (snap === undefined || snap === lastWritten) return;

    try {
      const current = read(keys.primary);

      if (current && restoreGlobalLayout(current, ctx).ok) write(keys.previous, current);

      const out = serializeGlobalLayout({ scope, clusterId, rootNode: store.rootNode, collapsedLeafIds: store.collapsedLeafIds, now: now() });

      if (out === undefined) return;
      write(keys.primary, out);
      lastWritten = snap;
    } catch (error) {
      logger?.warn("[GLOBAL-LAYOUT] could not persist the layout", error);
    }
  };

  const stop = reaction(snapshot, () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  });

  const onUnload = () => flush();
  let live = true;

  try {
    window.addEventListener("pagehide", onUnload);
    window.addEventListener("beforeunload", onUnload);
  } catch { /* no window: unload flush unavailable */ }

  return {
    restored,
    flush: () => { if (live) flush(); },
    dispose: () => {
      live = false;
      stop();

      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;

      try {
        window.removeEventListener("pagehide", onUnload);
        window.removeEventListener("beforeunload", onUnload);
      } catch { /* ignore */ }
    },
  };
}

// Stores whose layout was restored from disk and whose first route reveal has not run yet.
const restoredAwaitingFirstReveal = new WeakSet<object>();

export const markLayoutRestored = (store: object) => restoredAwaitingFirstReveal.add(store);

/**
 * First reveal when the host mounts. A restored layout already says which tab is active, so the
 * route must not override it when its panel exists; later route changes use showRoutePanel as usual.
 */
export function revealRouteOnMount(store: SplitPanelStore, kind: PanelKind | undefined): void {
  const restored = restoredAwaitingFirstReveal.delete(store);

  if (restored && kind && store.allActiveLeaves.some((leaf) => leaf.panelKind === kind)) {
    return;
  }

  showRoutePanel(store, kind);
}
