/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./global-panel-host.module.scss";
import React, { useEffect, useRef, useState } from "react";
import type { IComputedValue } from "mobx";
import { reaction } from "mobx";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { CompactPanelControlsContext, DynamicLayoutRenderer, PanelAccentContext, PanelDetachContext } from "../../../renderer/components/split-panel/dynamic-layout-renderer";
import type { PanelDetachOptions } from "../../../renderer/components/split-panel/dynamic-layout-renderer";
import { canDetachAsList } from "../../../renderer/components/split-panel/split-panel-store";
import detachedToolWindowsFeatureFlagInjectable from "../../../common/detached-tools/detached-tool-windows-feature-flag.injectable";
import clusterFrameContextForNamespacedResourcesInjectable from "../../../renderer/cluster-frame-context/for-namespaced-resources.injectable";
import type { PanelAccent } from "../../../renderer/components/split-panel/panel-container";
import { accentStyle } from "../../../renderer/components/split-panel/panel-container";
import splitPanelStyles from "../../../renderer/components/split-panel/split-panel.module.scss";
import type { GetClusterById } from "../../cluster/storage/common/get-by-id.injectable";
import getClusterByIdInjectable from "../../cluster/storage/common/get-by-id.injectable";
import { resolvePanelClusterIdentity } from "./panel-cluster-identity";
import { getCatalogItem } from "../../../renderer/components/split-panel/panel-catalog";
import { Icon } from "../../../renderer/components/icon";
import { PanelCatalogModal } from "../../../renderer/components/split-panel/panel-catalog-modal";
import { RouteViewsContext } from "../../../renderer/components/split-panel/panel-content-resolver";
import type { SplitPanelStore } from "../../../renderer/components/split-panel/split-panel-store";
import type { DockPosition } from "../../../renderer/components/split-panel/split-panel-store";
import { dockLeafInTree } from "../../../renderer/components/split-panel/split-panel-store";
import globalPanelStoreInjectable from "./global-panel-store.injectable";
import type { GlobalPanelKind } from "./global-panel-store";
import { openKubetailPanel, openTerminalPanel, showRoutePanel } from "./global-panel-store";
import type { PanelKind } from "../../../renderer/components/split-panel/split-panel-types";
import activeGlobalPanelKindInjectable from "./active-global-panel-kind.injectable";
import type { Box } from "./drop-zones";
import { getDockPosition, getDropPreviewBox } from "./drop-zones";

// Set by PanelContainer's header on dragstart; the host adds the cluster of origin.
const panelIdType = "application/openlens-panel-id";
const panelClusterType = "application/openlens-panel-cluster";
const panelContainerPrefix = "panel-container-";
const tabPrefix = "tab-";

interface Dependencies {
  store: SplitPanelStore;
  getClusterById: GetClusterById;
  isDetachEnabled: () => boolean;
  getDetachNamespace: () => string | undefined;
  activeKind: IComputedValue<GlobalPanelKind | undefined>;
}

/**
 * The docking engine shared by the cluster-frame host and the root-frame host (H7.6.4):
 * drag and drop, drop preview, collapse bar, keyboard move and the panel catalog live here once.
 * `identity` is undefined for root views, which carry no cluster accent.
 */
export interface PanelHostViewProps {
  readonly store: SplitPanelStore;
  readonly activeKind: IComputedValue<PanelKind | undefined>;
  readonly testId: string;
  readonly identity?: PanelAccent;
  readonly detach?: PanelDetachOptions;
  readonly onSelectPanel: (kind: PanelKind, orientation: "horizontal" | "vertical") => void;
  readonly isKindAllowed: (kind: PanelKind) => boolean;
  readonly availableKinds?: readonly PanelKind[];
}

interface DropHint {
  readonly targetLeafId: string;
  readonly position: DockPosition;
  readonly preview: Box;
}

function resolveDropTarget(element: Element | null, x: number, y: number): Omit<DropHint, "preview"> & { zone: Element } | undefined {
  // Tab buttons group/reorder; their extract/close controls are spans, not buttons.
  const tab = element?.closest(`button[data-testid^="${tabPrefix}"]`);

  if (tab) {
    return { targetLeafId: tab.getAttribute("data-testid")!.slice(tabPrefix.length), position: "center", zone: tab };
  }

  const panel = element?.closest(`[data-testid^="${panelContainerPrefix}"]`);

  if (!panel) {
    return undefined;
  }

  // Inside a tab group the whole group is the drop zone, matching dockLeafInTree.
  const zone = panel.closest("[data-testid^=\"group-node-\"]") ?? panel;

  return {
    targetLeafId: panel.getAttribute("data-testid")!.slice(panelContainerPrefix.length),
    position: getDockPosition(zone.getBoundingClientRect(), x, y),
    zone,
  };
}

export const PanelHostView = observer(({ store, activeKind, testId, identity, detach, onSelectPanel, isKindAllowed, availableKinds }: PanelHostViewProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const draggedLeafId = useRef<string>();
  const [hint, setHint] = useState<DropHint>();

  // H7.6.1: the host stays mounted across hosted routes; the route only brings its panel into view.
  useEffect(() => reaction(() => activeKind.get(), (kind) => showRoutePanel(store, kind), { fireImmediately: true }), [store, activeKind]);

  const clearDrag = () => {
    draggedLeafId.current = undefined;
    setHint(undefined);
  };

  const isPanelDrag = (event: React.DragEvent) => event.dataTransfer.types.includes(panelIdType);

  const onDragStart = (event: React.DragEvent) => {
    const panel = (event.target as Element).closest?.(`[data-testid^="${panelContainerPrefix}"]`);

    if (!panel || !isPanelDrag(event)) {
      return;
    }

    draggedLeafId.current = panel.getAttribute("data-testid")!.slice(panelContainerPrefix.length);
    event.dataTransfer.setData(panelClusterType, store.clusterId);
  };

  const onDragOverCapture = (event: React.DragEvent) => {
    if (!isPanelDrag(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    const target = resolveDropTarget(event.target as Element, event.clientX, event.clientY);
    const source = draggedLeafId.current;
    const host = hostRef.current?.getBoundingClientRect();
    const isValid = target && source && host
      && dockLeafInTree(store.rootNode, source, target.targetLeafId, target.position) !== undefined;

    if (!isValid) {
      setHint(undefined);

      return;
    }

    const zone = target.zone.getBoundingClientRect();
    const preview = getDropPreviewBox({ left: zone.left - host.left, top: zone.top - host.top, width: zone.width, height: zone.height }, target.position);

    if (hint?.targetLeafId !== target.targetLeafId || hint.position !== target.position) {
      setHint({ targetLeafId: target.targetLeafId, position: target.position, preview });
    }
  };

  const onDropCapture = (event: React.DragEvent) => {
    if (!isPanelDrag(event)) {
      return;
    }

    // Stop here so PanelContainer's legacy "group" drop handler does not also run.
    event.preventDefault();
    event.stopPropagation();

    const target = resolveDropTarget(event.target as Element, event.clientX, event.clientY);
    const source = event.dataTransfer.getData(panelIdType);
    const cluster = event.dataTransfer.getData(panelClusterType);

    if (target && source) {
      store.dockPanel(source, target.targetLeafId, target.position, cluster);
    }

    clearDrag();
  };

  const onDragLeave = (event: React.DragEvent) => {
    if (!hostRef.current?.contains(event.relatedTarget as Node | null)) {
      setHint(undefined);
    }
  };

  return (
    <div
      ref={hostRef}
      className={styles.globalPanelHost}
      data-testid={testId}
      data-cluster-id={store.clusterId}
      onDragStart={onDragStart}
      onDragOverCapture={onDragOverCapture}
      onDropCapture={onDropCapture}
      onDragLeave={onDragLeave}
      onDragEnd={clearDrag}
    >
      <div className={styles.layoutArea}>
        {store.isSubtreeCollapsed(store.rootNode) ? (
          <div className={styles.allCollapsed} data-testid="global-panel-all-collapsed">
            All panels are collapsed. Restore one from the bar below.
          </div>
        ) : (
          <CompactPanelControlsContext.Provider value={true}>
            <PanelAccentContext.Provider value={identity}>
              <PanelDetachContext.Provider value={detach}>
                <RouteViewsContext.Provider value={true}>
                  <DynamicLayoutRenderer node={store.rootNode} splitPanelStore={store} />
                </RouteViewsContext.Provider>
              </PanelDetachContext.Provider>
            </PanelAccentContext.Provider>
          </CompactPanelControlsContext.Provider>
        )}
      </div>
      {store.collapsedLeaves.length > 0 && (
        <div
          className={styles.collapsedBar}
          role="toolbar"
          aria-label="Collapsed panels"
          data-testid="global-panel-collapsed-bar"
        >
          {store.collapsedLeaves.map((leaf) => {
            const item = getCatalogItem(leaf.panelKind);
            const title = leaf.title || item?.defaultTitle || leaf.panelKind;

            return (
              <button
                key={leaf.id}
                type="button"
                className={identity ? `${styles.collapsedChip} ${splitPanelStyles.clusterAccent}` : styles.collapsedChip}
                style={accentStyle(identity)}
                onClick={() => store.restorePanel(leaf.id)}
                aria-label={`Restore ${title} panel`}
                title={identity ? `Restore ${title} (cluster ${identity.name})` : `Restore ${title}`}
                data-testid={`panel-restore-collapsed-${leaf.id}`}
              >
                {item?.icon && <Icon material={item.icon} small />}
                <span>{title}</span>
              </button>
            );
          })}
        </div>
      )}
      {hint && (
        <div
          className={styles.dropPreview}
          data-testid="global-panel-drop-preview"
          data-position={hint.position}
          data-target={hint.targetLeafId}
          style={{ left: hint.preview.left, top: hint.preview.top, width: hint.preview.width, height: hint.preview.height }}
        />
      )}
      <PanelCatalogModal
        isOpen={store.isCatalogOpen}
        onClose={() => store.closeCatalog()}
        onSelectPanel={onSelectPanel}
        isKindAllowed={isKindAllowed}
        availableKinds={availableKinds}
      />
    </div>
  );
});

const NonInjectedGlobalPanelHost = observer(({ store, getClusterById, isDetachEnabled, getDetachNamespace, activeKind }: Dependencies) => (
  <PanelHostView
    store={store}
    activeKind={activeKind}
    testId="global-panel-host"
    // Observed: Settings and the hotbar appearance dialog both edit these cluster preferences.
    identity={resolvePanelClusterIdentity(store.clusterId, getClusterById(store.clusterId))}
    // H7.5: detaching exists only while the detached tool windows are enabled (Main refuses otherwise).
    detach={isDetachEnabled() ? { canDetach: canDetachAsList, getNamespace: getDetachNamespace } : undefined}
    onSelectPanel={(kind, orientation) => (
      // H7.6.3D: Terminal is the one catalog item that opens a bound session, only on this explicit click.
      kind === "terminal" ? openTerminalPanel(store) : kind === "kubetail" ? openKubetailPanel(store) : store.addPanel(kind, undefined, orientation)
    )}
    isKindAllowed={(kind) => kind === "terminal" || kind === "kubetail" || store.canAddPanelKind(kind)}
    availableKinds={["terminal", "kubetail"]}
  />
));

export const GlobalPanelHost = withInjectables<Dependencies>(NonInjectedGlobalPanelHost, {
  getProps: (di, props) => ({
    ...props,
    store: di.inject(globalPanelStoreInjectable),
    activeKind: di.inject(activeGlobalPanelKindInjectable),
    getClusterById: di.inject(getClusterByIdInjectable),
    isDetachEnabled: () => di.inject(detachedToolWindowsFeatureFlagInjectable).isEnabled,
    // The list window shows the single selected namespace, or every namespace otherwise.
    getDetachNamespace: () => {
      const { contextNamespaces, hasSelectedAll } = di.inject(clusterFrameContextForNamespacedResourcesInjectable);

      return !hasSelectedAll && contextNamespaces.length === 1 ? contextNamespaces[0] : undefined;
    },
  }),
});
