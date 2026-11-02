/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./split-panel.module.scss";
import React from "react";
import { observer } from "mobx-react";
import type { PanelKind } from "./split-panel-types";
import { ResourceDetailsPanelContent } from "./resource-details-panel-content";
import { Pods } from "../workloads-pods/pods";
import { Deployments } from "../workloads-deployments/deployments";
import { Events } from "../events/events";
import { TerminalPanelContent } from "./terminal-panel-content";
import { Icon } from "../icon";

export type PanelRenderer = (leafId: string) => React.ReactNode;

const panelRendererRegistry = new Map<PanelKind, PanelRenderer>();

export function registerPanelRenderer(kind: PanelKind, renderer: PanelRenderer): void {
  panelRendererRegistry.set(kind, renderer);
}

export interface PanelContentResolverProps {
  readonly panelKind: PanelKind;
  readonly leafId: string;
}

export const PanelContentResolver = observer((props: PanelContentResolverProps) => {
  const { panelKind, leafId } = props;

  const customRenderer = panelRendererRegistry.get(panelKind);

  if (customRenderer) {
    return (
      <div className={styles.embeddedPanelBody} data-testid={`panel-content-${panelKind}-${leafId}`}>
        {customRenderer(leafId)}
      </div>
    );
  }

  switch (panelKind) {
    case "resource-details":
      return (
        <div className={styles.embeddedPanelBody} data-testid={`panel-content-resource-details-${leafId}`}>
          <ResourceDetailsPanelContent />
        </div>
      );

    case "pods":
      return (
        <div className={styles.embeddedWorkloadPanel} data-testid={`panel-content-pods-${leafId}`}>
          <Pods />
        </div>
      );

    case "deployments":
      return (
        <div className={styles.embeddedWorkloadPanel} data-testid={`panel-content-deployments-${leafId}`}>
          <Deployments />
        </div>
      );

    case "events":
      return (
        <div className={styles.embeddedWorkloadPanel} data-testid={`panel-content-events-${leafId}`}>
          <Events compact={true} />
        </div>
      );

    case "terminal":
      return (
        <div className={styles.embeddedWorkloadPanel} data-testid={`panel-content-terminal-${leafId}`}>
          <TerminalPanelContent />
        </div>
      );

    default:
      return (
        <div className={styles.emptyDetailsState} data-testid={`panel-content-unknown-${leafId}`}>
          <Icon material="info" className={styles.emptyIcon} />
          <span className={styles.emptyTitle}>Panel no disponible</span>
          <span className={styles.emptyDescription}>
            El tipo de componente &quot;{panelKind}&quot; no está registrado en el entorno activo.
          </span>
        </div>
      );
  }
});
