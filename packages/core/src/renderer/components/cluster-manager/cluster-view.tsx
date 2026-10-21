/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./cluster-view.scss";
import React from "react";
import { Button } from "@openlens/button";
import type { IComputedValue } from "mobx";
import { computed, makeObservable, reaction } from "mobx";
import { disposeOnUnmount, observer } from "mobx-react";
import { ClusterStatus } from "./cluster-status";
import type { ClusterFrameHandler } from "./cluster-frame-handler";
import type { Cluster } from "../../../common/cluster/cluster";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { NavigateToCatalog } from "../../../common/front-end-routing/routes/catalog/navigate-to-catalog.injectable";
import navigateToCatalogInjectable from "../../../common/front-end-routing/routes/catalog/navigate-to-catalog.injectable";
import clusterViewRouteParametersInjectable from "./cluster-view-route-parameters.injectable";
import clusterFrameHandlerInjectable from "./cluster-frame-handler.injectable";
import type { CatalogEntityRegistry } from "../../api/catalog/entity/registry";
import catalogEntityRegistryInjectable from "../../api/catalog/entity/registry.injectable";
import type { RequestClusterActivation } from "../../../features/cluster/activation/common/request-token";
import requestClusterActivationInjectable from "../../../features/cluster/activation/renderer/request-activation.injectable";
import type { GetClusterById } from "../../../features/cluster/storage/common/get-by-id.injectable";
import getClusterByIdInjectable from "../../../features/cluster/storage/common/get-by-id.injectable";
import type { StrictReactNode } from "@openlens/utilities";
import type { WorkspaceTabsStore } from "../../../features/workspace-tabs/renderer/workspace-tabs-store";
import workspaceTabsStoreInjectable from "../../../features/workspace-tabs/renderer/workspace-tabs-store.injectable";
import type { WorkspacePersistenceStore } from "../../../features/workspace-tabs/renderer/workspace-persistence-store";
import workspacePersistenceStoreInjectable from "../../../features/workspace-tabs/renderer/workspace-persistence-store.injectable";
import type { WorkspaceTabsFeatureFlag } from "../../../features/workspace-tabs/common/workspace-tabs-feature-flag.injectable";
import workspaceTabsFeatureFlagInjectable from "../../../features/workspace-tabs/common/workspace-tabs-feature-flag.injectable";

interface Dependencies {
  clusterId: IComputedValue<string>;
  clusterFrames: ClusterFrameHandler;
  navigateToCatalog: NavigateToCatalog;
  entityRegistry: CatalogEntityRegistry;
  getClusterById: GetClusterById;
  requestClusterActivation: RequestClusterActivation;
  workspaceTabsStore: WorkspaceTabsStore;
  workspacePersistenceStore: WorkspacePersistenceStore;
  workspaceTabsFeatureFlag: WorkspaceTabsFeatureFlag;
}

@observer
export class NonInjectedClusterView extends React.Component<Dependencies> {
  constructor(props: Dependencies) {
    super(props);
    makeObservable(this);
  }

  get clusterId() {
    return this.props.clusterId.get();
  }

  @computed get cluster(): Cluster | undefined {
    return this.props.getClusterById(this.clusterId);
  }

  private readonly isViewLoaded = computed(() => this.props.clusterFrames.hasLoadedView(this.clusterId), {
    keepAlive: true,
    requiresReaction: true,
  });

  @computed get isReady(): boolean {
    const { cluster } = this;

    if (!cluster) {
      return false;
    }

    return cluster.ready.get() && cluster.available.get() && this.isViewLoaded.get();
  }

  @computed get isRestoredInactive(): boolean {
    return this.props.workspaceTabsFeatureFlag.isEnabled && this.props.workspaceTabsStore.isRestoredTabInactive(this.clusterId);
  }

  componentDidMount() {
    this.bindEvents();
  }

  componentWillUnmount() {
    this.props.clusterFrames.clearVisibleCluster();
    this.props.entityRegistry.activeEntity = undefined;
  }

  bindEvents() {
    disposeOnUnmount(this, [
      reaction(() => ({
        clusterId: this.clusterId,
        canActivate: !this.props.workspaceTabsFeatureFlag.isEnabled || this.props.workspacePersistenceStore.isHydrated,
        isRestoredInactive: this.isRestoredInactive,
      }), ({ clusterId, canActivate, isRestoredInactive }) => {
        // TODO: replace with better handling
        if (!clusterId) {
          return;
        }

        if (!this.props.entityRegistry.getById(clusterId)) {
          return this.props.navigateToCatalog(); // redirect to catalog when the clusterId does not correspond to an entity
        }

        if (!canActivate || isRestoredInactive) {
          this.props.clusterFrames.clearVisibleCluster();
          this.props.entityRegistry.activeEntity = undefined;

          return;
        }

        this.props.clusterFrames.setVisibleCluster(clusterId);
        this.props.clusterFrames.initView(clusterId);
        this.props.requestClusterActivation({ clusterId });
        this.props.entityRegistry.activeEntity = clusterId;
      }, {
        fireImmediately: true,
      }),
    ]);
  }

  activateRestoredCluster = () => {
    const tab = this.props.workspaceTabsStore.getTabByClusterId(this.clusterId);

    if (tab) this.props.workspaceTabsStore.selectTab(tab.tabId);
  };

  renderStatus(): StrictReactNode {
    const { cluster, isReady } = this;

    if (this.isRestoredInactive) {
      return (
        <div className="ClusterView flex column align-center" role="status">
          <h2>{cluster?.name.get() ?? `Cluster ${this.clusterId}`}</h2>
          <p>This restored cluster view is inactive. Activate it to connect.</p>
          <Button
            primary
            label="Activate cluster"
            onClick={this.activateRestoredCluster}
          />
        </div>
      );
    }

    if (cluster && !isReady) {
      return <ClusterStatus cluster={cluster} className="box center"/>;
    }

    return null;
  }

  render() {
    return (
      <div className="ClusterView flex column align-center">
        {this.renderStatus()}
      </div>
    );
  }
}

export const ClusterView = withInjectables<Dependencies>(NonInjectedClusterView, {
  getProps: (di) => ({
    ...di.inject(clusterViewRouteParametersInjectable),
    navigateToCatalog: di.inject(navigateToCatalogInjectable),
    clusterFrames: di.inject(clusterFrameHandlerInjectable),
    entityRegistry: di.inject(catalogEntityRegistryInjectable),
    getClusterById: di.inject(getClusterByIdInjectable),
    requestClusterActivation: di.inject(requestClusterActivationInjectable),
    workspaceTabsStore: di.inject(workspaceTabsStoreInjectable),
    workspacePersistenceStore: di.inject(workspacePersistenceStoreInjectable),
    workspaceTabsFeatureFlag: di.inject(workspaceTabsFeatureFlagInjectable),
  }),
});

