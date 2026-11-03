/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./split-panel.module.scss";
import React, { useContext } from "react";
import { observer } from "mobx-react";
import type { PanelKind, PanelResourceBinding } from "./split-panel-types";
import { ResourceDetailsPanelContent } from "./resource-details-panel-content";
import { Pods } from "../workloads-pods/pods";
import { Deployments } from "../workloads-deployments/deployments";
import { StatefulSets } from "../workloads-statefulsets/statefulsets";
import { DaemonSets } from "../workloads-daemonsets/daemonsets";
import { ReplicaSets } from "../workloads-replicasets/replicasets";
import { Jobs } from "../workloads-jobs/jobs";
import { CronJobs } from "../workloads-cronjobs/cronjobs";
import { Events } from "../events/events";
import { ConfigMaps } from "../config-maps/config-maps";
import { Services } from "../network-services/services";
import { Ingresses } from "../network-ingresses/ingresses";
import { PersistentVolumeClaims } from "../storage-volume-claims/volume-claims";
import { NodesRoute } from "../nodes/route";
import { TerminalPanelContent } from "./terminal-panel-content";
import { Icon } from "../icon";
import { BoundResourceDetails } from "../../../features/global-docking/renderer/bound-resource-details";
import { BoundPodLogs } from "../../../features/global-docking/renderer/bound-pod-logs";

// The existing Lens route views, mounted unchanged inside a panel.
const listViews: Partial<Record<PanelKind, React.ComponentType>> = {
  pods: Pods,
  deployments: Deployments,
  statefulsets: StatefulSets,
  daemonsets: DaemonSets,
  replicasets: ReplicaSets,
  jobs: Jobs,
  cronjobs: CronJobs,
  configmaps: ConfigMaps,
  services: Services,
  ingresses: Ingresses,
  persistentvolumeclaims: PersistentVolumeClaims,
  nodes: NodesRoute,
};

/**
 * H7.6.2: true inside the global docking host, where a panel replaces its route and so shows
 * the full route view. Kubetail keeps its compact embedded variants (Events limited to 10 rows).
 */
export const RouteViewsContext = React.createContext(false);

export type PanelRenderer = (leafId: string) => React.ReactNode;

const panelRendererRegistry = new Map<PanelKind, PanelRenderer>();

export function registerPanelRenderer(kind: PanelKind, renderer: PanelRenderer): void {
  panelRendererRegistry.set(kind, renderer);
}

export interface PanelContentResolverProps {
  readonly panelKind: PanelKind;
  readonly leafId: string;
  /** H7.6.3: the resource a bound panel (Details) shows, carried by its leaf. */
  readonly resourceBinding?: PanelResourceBinding;
}

export const PanelContentResolver = observer((props: PanelContentResolverProps) => {
  const { panelKind, leafId, resourceBinding } = props;
  const routeViews = useContext(RouteViewsContext);

  const customRenderer = panelRendererRegistry.get(panelKind);

  if (customRenderer) {
    return (
      <div className={styles.embeddedPanelBody} data-testid={`panel-content-${panelKind}-${leafId}`}>
        {customRenderer(leafId)}
      </div>
    );
  }

  const ListView = listViews[panelKind] ?? (routeViews && panelKind === "events" ? Events : undefined);

  if (ListView) {
    return (
      <div className={styles.embeddedWorkloadPanel} data-testid={`panel-content-${panelKind}-${leafId}`}>
        <ListView />
      </div>
    );
  }

  // H7.6.3: inside the global host a Details panel is bound to one resource, not to the route.
  if (routeViews && panelKind === "resource-details" && resourceBinding) {
    return (
      <div className={styles.embeddedPanelBody} data-testid={`panel-content-resource-details-${leafId}`}>
        <BoundResourceDetails binding={resourceBinding} />
      </div>
    );
  }

  // H7.6.3B: inside the global host a Pod Logs panel is bound to a container session.
  if (routeViews && panelKind === "pod-logs" && resourceBinding) {
    return (
      <div className={styles.embeddedPanelBody} data-testid={`panel-content-pod-logs-${leafId}`}>
        <BoundPodLogs binding={resourceBinding} />
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
