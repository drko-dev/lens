/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./split-panel.module.scss";
import React, { Component, type ReactNode } from "react";
import { observer } from "mobx-react";
import { Icon } from "../icon";
import type { PanelId } from "./split-panel-types";

interface ErrorBoundaryProps {
  panelId: PanelId;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage?: string;
}

class PanelErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || "An unexpected error occurred in this panel.",
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[PANEL-ERROR-BOUNDARY] Error in panel "${this.props.panelId}":`, error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.errorBoundaryCard} data-testid={`panel-error-${this.props.panelId}`}>
          <h4>Panel Rendering Failed</h4>
          <p>{this.state.errorMessage}</p>
          <button type="button" onClick={this.handleRetry}>
            Retry Panel
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export interface PanelContainerProps {
  readonly panelId: PanelId;
  readonly title: string;
  readonly icon?: string;
  readonly badgeText?: string;
  readonly isProduction?: boolean;
  readonly onClose?: () => void;
  readonly onCollapse?: () => void;
  /** Global docking (H7.3): 28px header whose controls appear on hover or keyboard focus. */
  readonly compact?: boolean;
  readonly onSwap?: () => void;
  readonly onFocus?: () => void;
  readonly onDropPanel?: (sourceId: string, mode: "group") => void;
  readonly children: ReactNode;
  readonly extraActions?: ReactNode;
}

export const PanelContainer = observer((props: PanelContainerProps) => {
  const {
    panelId,
    title,
    icon,
    badgeText,
    isProduction,
    onClose,
    onCollapse,
    compact,
    onSwap,
    onFocus,
    onDropPanel,
    children,
    extraActions,
  } = props;
  const closeLabel = compact ? `Close ${title} panel` : "Close panel";

  return (
    <div
      className={styles.panelContainer}
      data-testid={`panel-container-${panelId}`}
      onFocus={onFocus}
      onClick={onFocus}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const sourceId = e.dataTransfer.getData("application/openlens-panel-id");
        if (sourceId && sourceId !== panelId && onDropPanel) {
          onDropPanel(sourceId, "group");
        }
      }}
      tabIndex={-1}
    >
      <div
        className={compact ? `${styles.panelHeader} ${styles.panelHeaderCompact}` : styles.panelHeader}
        data-testid={`panel-header-${panelId}`}
        draggable={true}
        onDragStart={(e) => {
          e.dataTransfer.setData("application/openlens-panel-id", panelId);
          e.dataTransfer.effectAllowed = "move";
        }}
      >
        <div className={styles.panelTitleArea}>
          {icon && <Icon material={icon} small />}
          <span>{title}</span>
          {badgeText && (
            <span
              className={`${styles.panelBadge} ${isProduction ? styles.panelBadgeProd : ""}`}
            >
              {badgeText}
            </span>
          )}
        </div>

        <div className={styles.panelActions}>
          {extraActions}
          {onSwap && (
            <button
              type="button"
              title="Swap panels (Left / Right)"
              aria-label="Swap panels"
              onClick={onSwap}
              data-testid={`panel-swap-button-${panelId}`}
            >
              <Icon material="swap_horiz" small />
            </button>
          )}
          {onCollapse && (
            <button
              type="button"
              title="Collapse panel"
              aria-label={`Collapse ${title} panel`}
              onClick={onCollapse}
              data-testid={`panel-collapse-button-${panelId}`}
            >
              <Icon material="remove" small />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              title="Close panel"
              aria-label={closeLabel}
              onClick={onClose}
              data-testid={`panel-close-button-${panelId}`}
            >
              <Icon material="close" small />
            </button>
          )}
        </div>
      </div>

      <div className={styles.panelBody}>
        <PanelErrorBoundary panelId={panelId}>
          {children}
        </PanelErrorBoundary>
      </div>
    </div>
  );
});
