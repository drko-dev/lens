/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./split-panel.module.scss";
import React, { useRef } from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { ResizeDirection, ResizeGrowthDirection, ResizeSide, ResizingAnchor } from "@openlens/resizing-anchor";
import { Icon } from "../icon";
import { PanelContainer } from "./panel-container";
import { PanelCatalogModal } from "./panel-catalog-modal";
import { DynamicLayoutRenderer } from "./dynamic-layout-renderer";
import type { SplitPanelStore } from "./split-panel-store";
import splitPanelStoreInjectable from "./split-panel-store.injectable";
import type { WorkspaceTemplateId } from "./split-panel-types";

interface Dependencies {
  splitPanelStore: SplitPanelStore;
}

export interface SplitPanelLayoutProps {
  readonly leftContent?: React.ReactNode;
  readonly rightContent?: React.ReactNode;
  readonly leftTitle?: string;
  readonly rightTitle?: string;
  readonly leftIcon?: string;
  readonly rightIcon?: string;
  readonly isProduction?: boolean;
}

const NonInjectedSplitPanelLayout = observer((props: Dependencies & SplitPanelLayoutProps) => {
  const {
    splitPanelStore,
    leftContent,
    rightContent,
    leftTitle = "Kubetail Stream",
    rightTitle = "Resource Details",
    leftIcon = "subject",
    rightIcon = "view_quilt",
    isProduction,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);

  const isDynamicMode =
    splitPanelStore.activeWorkspaceId !== "h1-default" ||
    splitPanelStore.activePanelsCount > 2 ||
    Boolean(splitPanelStore.maximizedPanelId);

  return (
    <div className={styles.workspaceRootLayout} data-testid="workspace-root-layout">
      {/* H2 TOP WORKSPACE TOOLBAR */}
      <div className={styles.workspaceBar} data-testid="workspace-toolbar">
        <div className={styles.leftSection}>
          <div className={styles.workspaceSelectGroup}>
            <label htmlFor="workspace-select">Workspace:</label>
            <select
              id="workspace-select"
              value={splitPanelStore.activeWorkspaceId}
              onChange={(e) => splitPanelStore.selectWorkspace(e.target.value as WorkspaceTemplateId)}
              data-testid="workspace-select"
            >
              <option value="operation">Operación (Pods + Deployments + Kubetail)</option>
              <option value="incidents">Incidentes (Kubetail + Eventos + Detalles)</option>
              <option value="development">Desarrollo (Pods + Terminal + Detalles)</option>
              <option value="h1-default">H1 Clásico (Kubetail + Details)</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>

          <button
            type="button"
            className={`${styles.barBtn} ${styles.primaryBtn}`}
            onClick={() => splitPanelStore.openCatalog()}
            title="Abrir catálogo para agregar componentes a la distribución"
            data-testid="add-panel-catalog-button"
          >
            <Icon material="add" small />
            + Agregar panel
          </button>
        </div>

        <div className={styles.rightSection}>
          <button
            type="button"
            className={`${styles.barBtn} ${!splitPanelStore.isClassicMode ? styles.activeBtn : ""}`}
            onClick={() => splitPanelStore.toggleClassicMode()}
            title={splitPanelStore.isClassicMode ? "Activar vista dividida multicanal" : "Conmutar a vista clásica de panel único"}
            data-testid="toggle-split-layout-button"
          >
            <Icon material="splitscreen" small />
            Split View: {splitPanelStore.isClassicMode ? "OFF" : "ON"}
          </button>

          {!splitPanelStore.isClassicMode && (
            <>
              <button
                type="button"
                className={styles.barBtn}
                onClick={() => splitPanelStore.swapPanels()}
                title="Invertir orden de paneles"
                data-testid="swap-panels-button"
              >
                <Icon material="swap_horiz" small />
                Swap
              </button>

              <button
                type="button"
                className={styles.barBtn}
                onClick={() => splitPanelStore.resetLayout()}
                title="Restablecer distribución predeterminada"
                data-testid="reset-layout-button"
              >
                <Icon material="settings_backup_restore" small />
                Reset
              </button>

              <button
                type="button"
                className={styles.barBtn}
                onClick={() => splitPanelStore.saveCustomWorkspace()}
                title="Guardar distribución personalizada activa"
                data-testid="save-workspace-button"
              >
                <Icon material="save" small />
                Guardar
              </button>
            </>
          )}
        </div>
      </div>

      {/* BODY CONTENT: CLASSIC / DYNAMIC / H1 SPLIT */}
      {splitPanelStore.isClassicMode ? (
        <div className={styles.splitContainer} ref={containerRef} data-testid="split-panel-classic">
          <div className={`${styles.leftPane} ${styles.fullWidth}`}>
            {leftContent}
          </div>
        </div>
      ) : isDynamicMode ? (
        <div
          className={styles.dynamicRoot}
          data-testid="split-panel-layout-container"
          ref={containerRef}
        >
          <DynamicLayoutRenderer
            node={splitPanelStore.rootNode}
            splitPanelStore={splitPanelStore}
          />
        </div>
      ) : (
        /* H1 DUAL PANEL FALLBACK (100% COMPATIBLE) */
        <div
          className={`${styles.splitContainer} ${splitPanelStore.isSwapped ? styles.isSwapped : ""}`}
          ref={containerRef}
          data-testid="split-panel-layout-container"
        >
          {/* LEFT PANEL */}
          {!splitPanelStore.isLeftClosed && (
            <div
              className={`${styles.leftPane} ${splitPanelStore.isRightClosed ? styles.fullWidth : ""}`}
              style={!splitPanelStore.isRightClosed ? { width: `${splitPanelStore.effectiveLeftWidthPercent}%`, flexBasis: `${splitPanelStore.effectiveLeftWidthPercent}%` } : undefined}
              data-testid="split-panel-left"
            >
              {splitPanelStore.isRightClosed && (
                <div className={styles.reopenBar} data-testid="reopen-right-bar">
                  <span>Resource Details panel is closed.</span>
                  <button
                    type="button"
                    onClick={() => splitPanelStore.openRightPanel()}
                    data-testid="reopen-right-button"
                  >
                    <Icon material="open_in_browser" small /> Open Details panel
                  </button>
                </div>
              )}
              <PanelContainer
                panelId="kubetail"
                title={leftTitle}
                icon={leftIcon}
                badgeText={isProduction ? "PROD" : "DEV"}
                isProduction={isProduction}
                onSwap={() => splitPanelStore.swapPanels()}
                onClose={() => splitPanelStore.closeLeftPanel()}
                onFocus={() => splitPanelStore.setActivePanel("kubetail")}
              >
                {leftContent}
              </PanelContainer>
            </div>
          )}

          {/* DIVIDER */}
          {!splitPanelStore.isLeftClosed && !splitPanelStore.isRightClosed && (
            <div className={styles.dividerContainer} data-testid="split-panel-divider">
              <ResizingAnchor
                direction={ResizeDirection.HORIZONTAL}
                placement={ResizeSide.TRAILING}
                growthDirection={ResizeGrowthDirection.LEFT_TO_RIGHT}
                getCurrentExtent={() => {
                  if (containerRef.current) {
                    return containerRef.current.clientWidth * splitPanelStore.ratio;
                  }

                  return 500;
                }}
                minExtent={250}
                maxExtent={containerRef.current ? Math.max(250, containerRef.current.clientWidth - 250) : 1200}
                onDrag={(extent) => {
                  if (containerRef.current && containerRef.current.clientWidth > 0) {
                    const newRatio = extent / containerRef.current.clientWidth;

                    splitPanelStore.setRatio(newRatio);
                  }
                }}
                onDoubleClick={() => splitPanelStore.resetLayout()}
              />
            </div>
          )}

          {/* RIGHT PANEL */}
          {!splitPanelStore.isRightClosed && (
            <div
              className={`${styles.rightPane} ${splitPanelStore.isLeftClosed ? styles.fullWidth : ""}`}
              style={!splitPanelStore.isLeftClosed ? { width: `${splitPanelStore.effectiveRightWidthPercent}%`, flexBasis: `${splitPanelStore.effectiveRightWidthPercent}%` } : undefined}
              data-testid="split-panel-right"
            >
              {splitPanelStore.isLeftClosed && (
                <div className={styles.reopenBar} data-testid="reopen-left-bar">
                  <span>Kubetail panel is closed.</span>
                  <button
                    type="button"
                    onClick={() => splitPanelStore.openLeftPanel()}
                    data-testid="reopen-left-button"
                  >
                    <Icon material="subject" small /> Open Kubetail panel
                  </button>
                </div>
              )}
              <PanelContainer
                panelId="resource-details"
                title={rightTitle}
                icon={rightIcon}
                badgeText={isProduction ? "PROD" : "DEV"}
                isProduction={isProduction}
                onSwap={() => splitPanelStore.swapPanels()}
                onClose={() => splitPanelStore.closeRightPanel()}
                onFocus={() => splitPanelStore.setActivePanel("resource-details")}
              >
                {rightContent}
              </PanelContainer>
            </div>
          )}
        </div>
      )}

      {/* CATALOG MODAL */}
      {splitPanelStore.isCatalogOpen && (
        <PanelCatalogModal
          isOpen={splitPanelStore.isCatalogOpen}
          onClose={() => splitPanelStore.closeCatalog()}
          onSelectPanel={(kind, orientation) => splitPanelStore.addPanel(kind, splitPanelStore.catalogTargetLeafId, orientation)}
        />
      )}
    </div>
  );
});

export const SplitPanelLayout = withInjectables<Dependencies, SplitPanelLayoutProps>(
  NonInjectedSplitPanelLayout,
  {
    getProps: (di, props) => ({
      ...props,
      splitPanelStore: di.inject(splitPanelStoreInjectable),
    }),
  },
);
