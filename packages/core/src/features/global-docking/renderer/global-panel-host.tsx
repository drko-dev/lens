/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./global-panel-host.module.scss";
import React, { useRef, useState } from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { DynamicLayoutRenderer } from "../../../renderer/components/split-panel/dynamic-layout-renderer";
import { PanelCatalogModal } from "../../../renderer/components/split-panel/panel-catalog-modal";
import type { SplitPanelStore } from "../../../renderer/components/split-panel/split-panel-store";
import type { DockPosition } from "../../../renderer/components/split-panel/split-panel-store";
import { dockLeafInTree } from "../../../renderer/components/split-panel/split-panel-store";
import globalPanelStoreInjectable from "./global-panel-store.injectable";
import type { Box } from "./drop-zones";
import { getDockPosition, getDropPreviewBox } from "./drop-zones";

// Set by PanelContainer's header on dragstart; the host adds the cluster of origin.
const panelIdType = "application/openlens-panel-id";
const panelClusterType = "application/openlens-panel-cluster";
const panelContainerPrefix = "panel-container-";
const tabPrefix = "tab-";

interface Dependencies {
  store: SplitPanelStore;
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

const NonInjectedGlobalPanelHost = observer(({ store }: Dependencies) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const draggedLeafId = useRef<string>();
  const [hint, setHint] = useState<DropHint>();

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
      data-testid="global-panel-host"
      data-cluster-id={store.clusterId}
      onDragStart={onDragStart}
      onDragOverCapture={onDragOverCapture}
      onDropCapture={onDropCapture}
      onDragLeave={onDragLeave}
      onDragEnd={clearDrag}
    >
      <DynamicLayoutRenderer node={store.rootNode} splitPanelStore={store} />
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
        onSelectPanel={(kind, orientation) => store.addPanel(kind, undefined, orientation)}
        isKindAllowed={(kind) => store.canAddPanelKind(kind)}
      />
    </div>
  );
});

export const GlobalPanelHost = withInjectables<Dependencies>(NonInjectedGlobalPanelHost, {
  getProps: (di, props) => ({
    ...props,
    store: di.inject(globalPanelStoreInjectable),
  }),
});
