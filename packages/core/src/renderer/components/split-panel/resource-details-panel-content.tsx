/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./split-panel.module.scss";
import React from "react";
import { observer } from "mobx-react";
import type { IComputedValue } from "mobx";
import type { KubeObject } from "@openlens/kube-object";
import type { DeploymentStore } from "../workloads-deployments/store";
import type { StatefulSetStore } from "../workloads-statefulsets/store";
import type { DaemonSetStore } from "../workloads-daemonsets/store";
import type { PodStore } from "../workloads-pods/store";
import type { SplitPanelStore } from "./split-panel-store";
import { withInjectables } from "@ogre-tools/injectable-react";
import deploymentStoreInjectable from "../workloads-deployments/store.injectable";
import statefulSetStoreInjectable from "../workloads-statefulsets/store.injectable";
import daemonSetStoreInjectable from "../workloads-daemonsets/store.injectable";
import podStoreInjectable from "../workloads-pods/store.injectable";
import splitPanelStoreInjectable from "./split-panel-store.injectable";
import kubeObjectDetailItemsInjectable from "../kube-object-details/kube-object-detail-items/kube-object-detail-items.injectable";
import type { CurrentKubeObject } from "../kube-object-details/current-kube-object-in-details.injectable";
import currentKubeObjectInDetailsInjectable from "../kube-object-details/current-kube-object-in-details.injectable";
import type { IAsyncComputed } from "@ogre-tools/injectable-react";
import { Spinner } from "../spinner";
import { Icon } from "../icon";
import { DetailsHeader } from "../kube-object-details/details-header";
import { KubeObjectMenu } from "../kube-object-menu";

import storesAndApisCanBeCreatedInjectable from "../../stores-apis-can-be-created.injectable";

interface Dependencies {
  splitPanelStore: SplitPanelStore;
  deploymentStore?: DeploymentStore;
  statefulSetStore?: StatefulSetStore;
  daemonSetStore?: DaemonSetStore;
  podStore?: PodStore;
  detailComponents: IComputedValue<React.ElementType<any>[]>;
  currentKubeObjectFromUrl: IAsyncComputed<CurrentKubeObject>;
}

export interface ResourceDetailsPanelContentProps {
  onSelectWorkload?: (workload: { kind: string; name: string; namespace: string }) => void;
}

const NonInjectedResourceDetailsPanelContent = observer((props: Dependencies & ResourceDetailsPanelContentProps) => {
  const {
    splitPanelStore,
    deploymentStore,
    statefulSetStore,
    daemonSetStore,
    podStore,
    detailComponents,
    currentKubeObjectFromUrl,
  } = props;

  const binding = splitPanelStore.resourceBinding;

  // Resolve KubeObject: first from explicit resourceBinding, fallback to URL selection
  let resolvedObject: KubeObject | undefined;

  if (binding && binding.name) {
    const ns = binding.namespace || "default";

    switch (binding.kind) {
      case "Deployment":
        resolvedObject = deploymentStore?.getByName(binding.name, ns);
        break;
      case "StatefulSet":
        resolvedObject = statefulSetStore?.getByName(binding.name, ns);
        break;
      case "DaemonSet":
        resolvedObject = daemonSetStore?.getByName(binding.name, ns);
        break;
      case "Pod":
        resolvedObject = podStore?.getByName(binding.name, ns);
        break;
    }
  }

  // Fallback to URL selection if no direct binding resolved
  if (!resolvedObject) {
    resolvedObject = currentKubeObjectFromUrl.value.get()?.object;
  }

  const isLoading = !resolvedObject && currentKubeObjectFromUrl.pending.get();

  if (isLoading) {
    return (
      <div className={styles.emptyDetailsState} data-testid="resource-details-loading">
        <Spinner center />
        <span className={styles.emptyDescription}>Loading resource details...</span>
      </div>
    );
  }

  if (!resolvedObject) {
    return (
      <div className={styles.emptyDetailsState} data-testid="resource-details-empty">
        <Icon material="info_outline" className={styles.emptyIcon} />
        <span className={styles.emptyTitle}>No Resource Selected</span>
        <span className={styles.emptyDescription}>
          Select a Deployment or workload in Kubetail or the sidebar to view full live details here.
        </span>
      </div>
    );
  }

  return (
    <div
      className="KubeObjectDetails flex column"
      style={{ padding: "16px", overflowY: "auto", height: "100%" }}
      data-testid="resource-details-content"
    >
      <div className="flex align-center justify-space-between" style={{ marginBottom: "16px" }}>
        <DetailsHeader object={resolvedObject} />
        <KubeObjectMenu object={resolvedObject} toolbar={true} />
      </div>

      {detailComponents.get().map((DetailComponent, index) => (
        <DetailComponent key={index} object={resolvedObject as KubeObject} />
      ))}
    </div>
  );
});

export const ResourceDetailsPanelContent = withInjectables<Dependencies, ResourceDetailsPanelContentProps>(
  NonInjectedResourceDetailsPanelContent,
  {
    getProps: (di, props) => {
      const storesCanBeCreated = di.inject(storesAndApisCanBeCreatedInjectable);
      let deploymentStore: DeploymentStore | undefined;
      let statefulSetStore: StatefulSetStore | undefined;
      let daemonSetStore: DaemonSetStore | undefined;
      let podStore: PodStore | undefined;

      if (storesCanBeCreated) {
        try { deploymentStore = di.inject(deploymentStoreInjectable); } catch {}
        try { statefulSetStore = di.inject(statefulSetStoreInjectable); } catch {}
        try { daemonSetStore = di.inject(daemonSetStoreInjectable); } catch {}
        try { podStore = di.inject(podStoreInjectable); } catch {}
      }

      return {
        ...props,
        splitPanelStore: di.inject(splitPanelStoreInjectable),
        deploymentStore,
        statefulSetStore,
        daemonSetStore,
        podStore,
        detailComponents: di.inject(kubeObjectDetailItemsInjectable),
        currentKubeObjectFromUrl: di.inject(currentKubeObjectInDetailsInjectable),
      };
    },
  },
);
