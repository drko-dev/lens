/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./split-panel.module.scss";
import React, { useContext, useRef } from "react";
import { observer } from "mobx-react";
import { ResizeDirection, ResizeGrowthDirection, ResizingAnchor } from "@openlens/resizing-anchor";
import { Icon } from "../icon";
import { PanelContainer, accentStyle } from "./panel-container";
import type { PanelAccent } from "./panel-container";
import { PanelContentResolver } from "./panel-content-resolver";
import { PanelMoveMenu } from "./panel-move-menu";
import { getCatalogItem } from "./panel-catalog";
import type {
  SplitLayoutBranch,
  SplitLayoutLeaf,
  SplitLayoutNode,
} from "./split-panel-types";
import {
  isBranchNode,
  isGroupNode,
  isLeafNode,
} from "./split-panel-types";
import type { SplitPanelStore } from "./split-panel-store";

export interface DynamicLayoutRendererProps {
  readonly node: SplitLayoutNode;
  readonly splitPanelStore: SplitPanelStore;
}

/** True inside the global docking host (H7.3): compact headers with collapse controls. */
export const CompactPanelControlsContext = React.createContext(false);

/** Cluster identity of the panels inside the global docking host (H7.4). */
export const PanelAccentContext = React.createContext<PanelAccent | undefined>(undefined);

interface LeafPanelRendererProps {
  readonly node: SplitLayoutLeaf;
  readonly splitPanelStore: SplitPanelStore;
}

const LeafPanelRenderer = observer((props: LeafPanelRendererProps) => {
  const { node, splitPanelStore } = props;
  const [isMoveMenuOpen, setIsMoveMenuOpen] = React.useState(false);
  const catalogItem = getCatalogItem(node.panelKind);
  const canClose = splitPanelStore.activePanelsCount > 1;
  const otherLeaves = splitPanelStore.allActiveLeaves.filter(l => l.id !== node.id);
  const isDetached = splitPanelStore.isPanelDetached(node.id);
  const detachedState = isDetached ? splitPanelStore.getDetachedState(node.id) : undefined;
  const canDetach = node.panelKind === "kubetail" || node.panelKind === "resource-details";
  const compact = useContext(CompactPanelControlsContext);
  const accent = useContext(PanelAccentContext);

  // Collapsed panels unmount their content; the host shows them in its restore bar.
  if (splitPanelStore.isLeafCollapsed(node.id)) {
    return null;
  }

  if (compact) {
    return (
      <div className={styles.leafWrapper} data-testid={`leaf-node-${node.id}`}>
        <PanelContainer
          panelId={node.id}
          title={node.title || catalogItem?.defaultTitle || node.panelKind}
          icon={catalogItem?.icon}
          badgeText={node.panelKind.toUpperCase()}
          compact
          accent={accent}
          extraActions={(
            <>
              <button
                type="button"
                onClick={() => splitPanelStore.openCatalog(node.id)}
                title="Add panel"
                aria-label="Add panel"
                data-testid={`panel-add-button-${node.id}`}
              >
                <Icon material="add" small />
              </button>
              <PanelMoveMenu leaf={node} splitPanelStore={splitPanelStore} />
            </>
          )}
          onCollapse={() => splitPanelStore.collapsePanel(node.id)}
          onClose={canClose ? () => splitPanelStore.closePanel(node.id) : undefined}
          onFocus={() => splitPanelStore.setActivePanel(node.id)}
        >
          <PanelContentResolver panelKind={node.panelKind} leafId={node.id} />
        </PanelContainer>
      </div>
    );
  }

  return (
    <div className={styles.leafWrapper} data-testid={`leaf-node-${node.id}`}>
      <PanelContainer
        panelId={node.id}
        title={node.title || catalogItem?.defaultTitle || node.panelKind}
        icon={catalogItem?.icon}
        badgeText={node.panelKind.toUpperCase()}
        onDropPanel={(sourceId) => splitPanelStore.movePanel(sourceId, node.id, "group")}
        extraActions={
          <div className={styles.leafActionButtons}>
            {otherLeaves.length > 0 && (
              <div className={styles.moveMenuContainer}>
                <button
                  type="button"
                  className={`${styles.leafActionBtn} ${isMoveMenuOpen ? styles.activeActionBtn : ""}`}
                  onClick={() => setIsMoveMenuOpen(!isMoveMenuOpen)}
                  title="Mover o reagrupar panel..."
                  data-testid={`panel-move-button-${node.id}`}
                >
                  <Icon material="open_with" small />
                </button>
                {isMoveMenuOpen && (
                  <div className={styles.moveDropdown} data-testid={`panel-move-menu-${node.id}`}>
                    <div className={styles.moveMenuHeader}>Mover o Reagrupar</div>
                    {otherLeaves.map(other => {
                      const otherTitle = other.title || other.panelKind;

                      return (
                        <div key={other.id} className={styles.moveMenuGroup}>
                          <div className={styles.moveTargetName}>Destino: {otherTitle}</div>
                          <button
                            type="button"
                            className={styles.moveMenuItem}
                            onClick={() => {
                              splitPanelStore.movePanel(node.id, other.id, "group");
                              setIsMoveMenuOpen(false);
                            }}
                            data-testid={`move-action-group-${other.id}`}
                          >
                            <Icon material="tab" small /> Agrupar como pestaña
                          </button>
                          <button
                            type="button"
                            className={styles.moveMenuItem}
                            onClick={() => {
                              splitPanelStore.swapLeaves(node.id, other.id);
                              setIsMoveMenuOpen(false);
                            }}
                            data-testid={`move-action-swap-${other.id}`}
                          >
                            <Icon material="swap_horiz" small /> Intercambiar posición
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {canDetach && !isDetached && (
              <button
                type="button"
                className={styles.leafActionBtn}
                onClick={() => splitPanelStore.detachPanel(node.id)}
                title="Desacoplar a ventana independiente"
                data-testid={`panel-detach-button-${node.id}`}
              >
                <Icon material="open_in_new" small />
              </button>
            )}
            <button
              type="button"
              className={styles.leafActionBtn}
              onClick={() => splitPanelStore.openCatalog(node.id)}
              title="Agregar panel aquí (+)"
              data-testid={`panel-add-button-${node.id}`}
            >
              <Icon material="add" small />
            </button>
            <button
              type="button"
              className={styles.leafActionBtn}
              onClick={() => splitPanelStore.toggleMaximizePanel(node.id)}
              title="Maximizar panel"
              data-testid={`panel-maximize-button-${node.id}`}
            >
              <Icon material="fullscreen" small />
            </button>
          </div>
        }
        onClose={canClose ? () => splitPanelStore.closePanel(node.id) : undefined}
        onFocus={() => splitPanelStore.setActivePanel(node.id)}
      >
        {isDetached ? (
          <div className={styles.detachedPlaceholder} data-testid={`panel-detached-placeholder-${node.id}`}>
            <div className={styles.detachedIconWrapper}>
              <Icon material="open_in_new" />
            </div>
            <div className={styles.detachedTitle}>
              {detachedState?.windowId
                ? "Panel activo en ventana independiente"
                : "Ventana desacoplada (restaurada de sesión previa)"}
            </div>
            <div className={styles.detachedDescription}>
              {detachedState?.windowId
                ? "El contenido de este panel está ejecutándose en una ventana nativa de Electron para uso multimonitor."
                : "Esta ventana pertenecía a una sesión previa. Por seguridad, no se abren ventanas ni conexiones automáticas hasta su autorización explícita."}
            </div>
            <div className={styles.detachedMetadata}>
              <span className={detachedState?.windowId ? styles.detachedActiveBadge : styles.detachedInertBadge}>
                {detachedState?.windowId ? "MULTIMONITOR ACTIVO" : "ESTADO INERTE"}
              </span>
              <span>ID: {node.id}</span>
              {detachedState?.geometry && (
                <span>Geometría: {detachedState.geometry.width}x{detachedState.geometry.height}</span>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "12px", flexWrap: "wrap" }}>
              {!detachedState?.windowId && (
                <button
                  type="button"
                  className={styles.redockButton}
                  onClick={() => splitPanelStore.detachPanel(node.id)}
                  data-testid={`panel-reopen-button-${node.id}`}
                >
                  <Icon material="open_in_new" small />
                  Reabrir ventana externa
                </button>
              )}
              <button
                type="button"
                className={styles.redockButton}
                onClick={() => splitPanelStore.redockPanel(node.id)}
                data-testid={`panel-redock-button-${node.id}`}
              >
                <Icon material="vertical_align_bottom" small />
                Volver al workspace (Redock)
              </button>
            </div>
          </div>
        ) : (
          <PanelContentResolver panelKind={node.panelKind} leafId={node.id} />
        )}
      </PanelContainer>
    </div>
  );
});

export const DynamicLayoutRenderer = observer((props: DynamicLayoutRendererProps) => {
  const { node, splitPanelStore } = props;
  const accent = useContext(PanelAccentContext);

  // Maximize check: if a panel is maximized and this node is not that panel, or if we are at root level
  if (splitPanelStore.maximizedPanelId) {
    const isThisNode = node.id === splitPanelStore.maximizedPanelId;

    if (isLeafNode(node)) {
      if (!isThisNode) return null;

      const catalogItem = getCatalogItem(node.panelKind);

      return (
        <div className={styles.maximizedContainer} data-testid={`maximized-panel-${node.id}`}>
          <PanelContainer
            panelId={node.id}
            title={node.title || catalogItem?.defaultTitle || node.panelKind}
            icon={catalogItem?.icon}
            badgeText={node.panelKind.toUpperCase()}
            extraActions={
              <button
                type="button"
                className={styles.restoreMaximizeButton}
                onClick={() => splitPanelStore.toggleMaximizePanel(node.id)}
                title="Restaurar tamaño normal"
                data-testid={`panel-restore-button-${node.id}`}
              >
                <Icon material="fullscreen_exit" small />
                Restaurar
              </button>
            }
          >
            <PanelContentResolver panelKind={node.panelKind} leafId={node.id} />
          </PanelContainer>
        </div>
      );
    }
  }

  // 1. Leaf Node
  if (isLeafNode(node)) {
    return <LeafPanelRenderer node={node} splitPanelStore={splitPanelStore} />;
  }

  // 2. Group Node (Tabs)
  if (isGroupNode(node)) {
    const panels = node.panels.filter(p => !splitPanelStore.isLeafCollapsed(p.id));
    const activeLeaf = panels.find(p => p.id === node.activePanelId) || panels[0];

    if (!activeLeaf) {
      return null;
    }

    return (
      <div className={styles.groupContainer} data-testid={`group-node-${node.id}`}>
        <div className={styles.groupTabBar}>
          {panels.map(panel => {
            const item = getCatalogItem(panel.panelKind);
            const isActive = panel.id === activeLeaf?.id;

            return (
              <button
                key={panel.id}
                type="button"
                className={[styles.groupTab, isActive && styles.activeGroupTab, accent && styles.clusterAccent].filter(Boolean).join(" ")}
                style={accentStyle(accent)}
                onClick={() => splitPanelStore.setActiveTabInGroup(node.id, panel.id)}
                data-testid={`tab-${panel.id}`}
              >
                {item?.icon && <Icon material={item.icon} small />}
                <span>{panel.title || item?.defaultTitle || panel.panelKind}</span>
                <span
                  className={styles.tabExtract}
                  onClick={(e) => {
                    e.stopPropagation();
                    splitPanelStore.extractTabFromGroup(node.id, panel.id);
                  }}
                  title="Desagrupar a panel independiente"
                  data-testid={`tab-extract-${panel.id}`}
                >
                  <Icon material="open_in_new" small />
                </span>
                {panels.length > 1 && (
                  <span
                    className={styles.tabClose}
                    onClick={(e) => {
                      e.stopPropagation();
                      splitPanelStore.closePanel(panel.id);
                    }}
                    title="Cerrar pestaña"
                    data-testid={`tab-close-${panel.id}`}
                  >
                    ×
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className={styles.groupTabContent}>
          {activeLeaf && (
            <DynamicLayoutRenderer
              node={activeLeaf}
              splitPanelStore={splitPanelStore}
            />
          )}
        </div>
      </div>
    );
  }

  // 3. Branch Node (Recursive Split)
  if (isBranchNode(node)) {
    return <BranchLayoutRenderer branch={node} splitPanelStore={splitPanelStore} />;
  }

  return null;
});

interface BranchLayoutRendererProps {
  readonly branch: SplitLayoutBranch;
  readonly splitPanelStore: SplitPanelStore;
}

const BranchLayoutRenderer = observer((props: BranchLayoutRendererProps) => {
  const { branch, splitPanelStore } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const isHorizontal = branch.orientation === "horizontal";

  // A fully collapsed child gives its space to its sibling. The sibling keeps its place
  // in the React tree, so it is not re-mounted (and does not restart its watches).
  const firstCollapsed = splitPanelStore.isSubtreeCollapsed(branch.first);
  const secondCollapsed = splitPanelStore.isSubtreeCollapsed(branch.second);
  const showDivider = !firstCollapsed && !secondCollapsed;
  const firstPercent = firstCollapsed ? 0 : secondCollapsed ? 100 : Math.round(branch.ratio * 1000) / 10;
  const secondPercent = secondCollapsed ? 0 : firstCollapsed ? 100 : Math.round((1 - branch.ratio) * 1000) / 10;

  return (
    <div
      ref={containerRef}
      className={`${styles.branchContainer} ${isHorizontal ? styles.branchHorizontal : styles.branchVertical}`}
      data-testid={`branch-container-${branch.id}`}
      data-orientation={branch.orientation}
    >
      <div
        className={styles.branchChild}
        style={{
          flexBasis: `${firstPercent}%`,
          flexGrow: 0,
          flexShrink: 0,
          overflow: "hidden",
        }}
        data-testid={`branch-first-${branch.id}`}
      >
        <DynamicLayoutRenderer node={branch.first} splitPanelStore={splitPanelStore} />
      </div>

      {showDivider && (
      <div
        className={`${styles.branchDivider} ${isHorizontal ? styles.branchDividerHorizontal : styles.branchDividerVertical}`}
        onDoubleClick={() => splitPanelStore.setBranchRatio(branch.id, 0.5)}
        title="Doble clic para restablecer proporción equitativa (50/50)"
        data-testid={`branch-divider-${branch.id}`}
      >
        <ResizingAnchor
          direction={isHorizontal ? ResizeDirection.HORIZONTAL : ResizeDirection.VERTICAL}
          // The extent is the first child's size, which grows as the divider moves right/down.
          // ResizingAnchor defaults to BOTTOM_TO_TOP (-1), which inverted the drag.
          growthDirection={isHorizontal ? ResizeGrowthDirection.LEFT_TO_RIGHT : ResizeGrowthDirection.TOP_TO_BOTTOM}
          getCurrentExtent={() => {
            const rect = containerRef.current?.getBoundingClientRect();

            if (!rect) return isHorizontal ? 500 : 300;

            return isHorizontal ? rect.width * branch.ratio : rect.height * branch.ratio;
          }}
          onDrag={(extent) => {
            const rect = containerRef.current?.getBoundingClientRect();

            if (!rect) return;

            const total = isHorizontal ? rect.width : rect.height;

            if (total > 0) {
              const newRatio = extent / total;

              splitPanelStore.setBranchRatio(branch.id, newRatio);
            }
          }}
        />
      </div>
      )}

      <div
        className={styles.branchChild}
        style={{
          flexBasis: `${secondPercent}%`,
          flexGrow: 0,
          flexShrink: 0,
          overflow: "hidden",
        }}
        data-testid={`branch-second-${branch.id}`}
      >
        <DynamicLayoutRenderer node={branch.second} splitPanelStore={splitPanelStore} />
      </div>
    </div>
  );
});
