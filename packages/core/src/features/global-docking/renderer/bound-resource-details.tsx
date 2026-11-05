/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import splitPanelStyles from "../../../renderer/components/split-panel/split-panel.module.scss";
import React, { useEffect } from "react";
import { observer } from "mobx-react";
import type { IComputedValue } from "mobx";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { KubeObject } from "@openlens/kube-object";
import type { ApiManager } from "../../../common/k8s-api/api-manager";
import apiManagerInjectable from "../../../common/k8s-api/api-manager/manager.injectable";
import type { SubscribeStores } from "../../../renderer/kube-watch-api/kube-watch-api";
import subscribeStoresInjectable from "../../../renderer/kube-watch-api/subscribe-stores.injectable";
import kubeObjectDetailItemsInjectable from "../../../renderer/components/kube-object-details/kube-object-detail-items/kube-object-detail-items.injectable";
import { DetailsHeader } from "../../../renderer/components/kube-object-details/details-header";
import { KubeObjectMenu } from "../../../renderer/components/kube-object-menu";
import { Icon } from "../../../renderer/components/icon";
import type { PanelResourceBinding } from "../../../renderer/components/split-panel/split-panel-types";
import hostedClusterIdInjectable from "../../../renderer/cluster-frame-context/hosted-cluster-id.injectable";
import type { ClusterContext } from "../../../renderer/cluster-frame-context/cluster-frame-context";
import clusterFrameContextForNamespacedResourcesInjectable from "../../../renderer/cluster-frame-context/for-namespaced-resources.injectable";

export interface BoundResourceDetailsProps {
  readonly binding: PanelResourceBinding;
}

interface Dependencies {
  apiManager: ApiManager;
  subscribeStores: SubscribeStores;
  detailComponents: IComputedValue<React.ElementType<any>[]>;
  hostedClusterId: string | undefined;
  clusterContext: ClusterContext;
}

/**
 * H7.6.3: Details of one resource identified by its panel binding, not by the active route.
 * Reuses the Lens inspector pieces (header, menu, detail items). When the resource's namespace
 * is covered by the namespace filter, the store is subscribed like a list view (no explicit
 * namespaces): KubeWatchApi then shares one watch with a list of the same kind and only
 * re-references it when the panel moves. Otherwise it watches just that namespace.
 */
const NonInjectedBoundResourceDetails = observer(({ binding, apiManager, subscribeStores, detailComponents, hostedClusterId, clusterContext }: BoundResourceDetailsProps & Dependencies) => {
  const api = binding.apiVersion ? apiManager.getApiByKind(binding.kind, binding.apiVersion) : undefined;
  const store = api ? apiManager.getStore(api) : undefined;
  const namespace = binding.namespace || undefined;
  const sameCluster = !binding.clusterId || binding.clusterId === hostedClusterId;
  const sharedWatch = !namespace || clusterContext.hasSelectedAll || clusterContext.contextNamespaces.includes(namespace);

  useEffect(() => {
    if (!store || !sameCluster) {
      return undefined;
    }

    return subscribeStores([store], sharedWatch ? {} : { namespaces: [namespace!] });
  }, [store, namespace, sameCluster, sharedWatch]);

  const object: KubeObject | undefined = store?.getByName(binding.name, namespace);
  const identity = {
    "data-kind": binding.kind,
    "data-namespace": namespace ?? "",
    "data-name": binding.name,
    "data-cluster-id": binding.clusterId,
  };

  if (!sameCluster || !store || !object) {
    return (
      <div className={splitPanelStyles.emptyDetailsState} data-testid="bound-details-unavailable" {...identity}>
        <Icon material="info" className={splitPanelStyles.emptyIcon} />
        <span className={splitPanelStyles.emptyTitle}>{`${binding.kind} ${binding.name}`}</span>
        <span className={splitPanelStyles.emptyDescription}>
          {!sameCluster ? "This resource belongs to another cluster." : !store ? "This resource kind is not available." : "Loading resource details..."}
        </span>
      </div>
    );
  }

  return (
    <div className="KubeObjectDetails flex column" style={{ padding: "16px", overflowY: "auto", height: "100%" }} data-testid="bound-details" {...identity}>
      <div className="flex align-center justify-space-between" style={{ marginBottom: "16px" }}>
        <DetailsHeader object={object} />
        <KubeObjectMenu object={object} toolbar={true} />
      </div>
      {detailComponents.get().map((DetailComponent, index) => <DetailComponent key={index} object={object} />)}
    </div>
  );
});

export const BoundResourceDetails = withInjectables<Dependencies, BoundResourceDetailsProps>(NonInjectedBoundResourceDetails, {
  getProps: (di, props) => ({
    ...props,
    apiManager: di.inject(apiManagerInjectable),
    subscribeStores: di.inject(subscribeStoresInjectable),
    detailComponents: di.inject(kubeObjectDetailItemsInjectable),
    hostedClusterId: di.inject(hostedClusterIdInjectable) ?? undefined,
    clusterContext: di.inject(clusterFrameContextForNamespacedResourcesInjectable),
  }),
});
