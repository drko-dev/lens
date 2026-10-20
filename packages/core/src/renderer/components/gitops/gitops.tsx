/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./gitops.scss";

import React from "react";
import { observer } from "mobx-react";
import { observable, makeObservable } from "mobx";
import { KubeObjectListLayout } from "../kube-object-list-layout";
import { KubeObjectStatusIcon } from "../kube-object-status-icon";
import { SiblingsInTabLayout } from "../layout/siblings-in-tab-layout";
import { KubeObjectAge } from "../kube-object/age";
import { NamespaceSelectBadge } from "../namespaces/namespace-select-badge";
import { Badge } from "../badge";
import { Tabs, Tab } from "../tabs";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { ArgoApplicationStore } from "./argo-application-store";
import type { FluxKustomizationStore } from "./flux-kustomization-store";
import argoApplicationStoreInjectable from "./argo-application-store.injectable";
import fluxKustomizationStoreInjectable from "./flux-kustomization-store.injectable";

export enum GitOpsTab {
  ARGO_APPLICATIONS = "argo-applications",
  FLUX_KUSTOMIZATIONS = "flux-kustomizations",
}

enum ArgoColumnId {
  name = "name",
  namespace = "namespace",
  project = "project",
  health = "health",
  sync = "sync",
  destination = "destination",
  repo = "repo",
  revision = "revision",
  age = "age",
}

enum FluxColumnId {
  name = "name",
  namespace = "namespace",
  source = "source",
  path = "path",
  status = "status",
  revision = "revision",
  age = "age",
}

interface Dependencies {
  argoStore: ArgoApplicationStore;
  fluxStore: FluxKustomizationStore;
}

@observer
class NonInjectedGitOps extends React.Component<Dependencies> {
  @observable activeTab: GitOpsTab = GitOpsTab.ARGO_APPLICATIONS;

  constructor(props: Dependencies) {
    super(props);
    makeObservable(this);
  }

  private onTabChange = (tab: GitOpsTab) => {
    this.activeTab = tab;
  };

  private renderArgoApplications() {
    return (
      <KubeObjectListLayout
        isConfigurable
        tableId="gitops_argo_applications"
        className="ArgoApplications"
        store={this.props.argoStore}
        sortingCallbacks={{
          [ArgoColumnId.name]: app => app.getName(),
          [ArgoColumnId.namespace]: app => app.getNs(),
          [ArgoColumnId.project]: app => app.getProject(),
          [ArgoColumnId.health]: app => app.getHealthStatus(),
          [ArgoColumnId.sync]: app => app.getSyncStatus(),
          [ArgoColumnId.age]: app => -app.getCreationTimestamp(),
        }}
        searchFilters={[
          app => app.getSearchFields(),
          app => app.getProject(),
          app => app.getHealthStatus(),
          app => app.getSyncStatus(),
          app => app.getRepoURL(),
        ]}
        renderHeaderTitle="Argo CD Applications"
        renderTableHeader={[
          { title: "Name", className: "name", sortBy: ArgoColumnId.name, id: ArgoColumnId.name },
          { className: "warning", showWithColumn: ArgoColumnId.name },
          { title: "Namespace", className: "namespace", sortBy: ArgoColumnId.namespace, id: ArgoColumnId.namespace },
          { title: "Project", className: "project", sortBy: ArgoColumnId.project, id: ArgoColumnId.project },
          { title: "Health", className: "health", sortBy: ArgoColumnId.health, id: ArgoColumnId.health },
          { title: "Sync", className: "sync", sortBy: ArgoColumnId.sync, id: ArgoColumnId.sync },
          { title: "Destination", className: "destination", id: ArgoColumnId.destination },
          { title: "Repository / Path", className: "repo", id: ArgoColumnId.repo },
          { title: "Revision", className: "revision", id: ArgoColumnId.revision },
          { title: "Age", className: "age", sortBy: ArgoColumnId.age, id: ArgoColumnId.age },
        ]}
        renderTableContents={app => [
          app.getName(),
          <KubeObjectStatusIcon key="icon" object={app} />,
          <NamespaceSelectBadge key="namespace" namespace={app.getNs()} />,
          <Badge key="project" label={app.getProject()} />,
          <Badge
            key="health"
            label={app.getHealthStatus()}
            className={`badge-${app.getHealthStatus().toLowerCase()}`}
            tooltip={app.getHealthMessage()}
          />,
          <Badge
            key="sync"
            label={app.getSyncStatus()}
            className={`badge-${app.getSyncStatus().toLowerCase()}`}
          />,
          app.getDestinationSummary(),
          <span key="repo" className="repo-path-cell" title={`${app.getRepoURL()} (${app.getPath()})`}>
            {app.getPath() ? `${app.getPath()} @ ${app.getTargetRevision()}` : app.getRepoURL()}
          </span>,
          app.getSyncRevision(),
          <KubeObjectAge key="age" object={app} />,
        ]}
      />
    );
  }

  private renderFluxKustomizations() {
    return (
      <KubeObjectListLayout
        isConfigurable
        tableId="gitops_flux_kustomizations"
        className="FluxKustomizations"
        store={this.props.fluxStore}
        sortingCallbacks={{
          [FluxColumnId.name]: k => k.getName(),
          [FluxColumnId.namespace]: k => k.getNs(),
          [FluxColumnId.status]: k => k.getStatusSummary(),
          [FluxColumnId.age]: k => -k.getCreationTimestamp(),
        }}
        searchFilters={[
          k => k.getSearchFields(),
          k => k.getSourceRefSummary(),
          k => k.getPath(),
          k => k.getStatusSummary(),
        ]}
        renderHeaderTitle="Flux CD Kustomizations"
        renderTableHeader={[
          { title: "Name", className: "name", sortBy: FluxColumnId.name, id: FluxColumnId.name },
          { className: "warning", showWithColumn: FluxColumnId.name },
          { title: "Namespace", className: "namespace", sortBy: FluxColumnId.namespace, id: FluxColumnId.namespace },
          { title: "Source", className: "source", id: FluxColumnId.source },
          { title: "Path", className: "path", id: FluxColumnId.path },
          { title: "Status", className: "status", sortBy: FluxColumnId.status, id: FluxColumnId.status },
          { title: "Applied Revision", className: "revision", id: FluxColumnId.revision },
          { title: "Age", className: "age", sortBy: FluxColumnId.age, id: FluxColumnId.age },
        ]}
        renderTableContents={k => [
          k.getName(),
          <KubeObjectStatusIcon key="icon" object={k} />,
          <NamespaceSelectBadge key="namespace" namespace={k.getNs()} />,
          <Badge key="source" label={k.getSourceRefSummary()} />,
          k.getPath(),
          <Badge
            key="status"
            label={k.getStatusSummary()}
            className={k.isReady() ? "badge-healthy" : k.isSuspended() ? "badge-suspended" : "badge-degraded"}
            tooltip={k.getStatusMessage()}
          />,
          k.getLastAppliedRevision(),
          <KubeObjectAge key="age" object={k} />,
        ]}
      />
    );
  }

  render() {
    return (
      <SiblingsInTabLayout>
        <div className="GitOpsView" data-testid="gitops-view">
          <div className="readonly-notice" data-testid="gitops-readonly-notice">
            <strong>GitOps Continuous Delivery (Argo CD & Flux CD):</strong> Real-time reconciliation, sync, and health status discovered natively from in-cluster CRDs. Read-only viewer in R3.
          </div>

          <Tabs
            className="view-tabs"
            value={this.activeTab}
            onChange={this.onTabChange}
          >
            <Tab
              value={GitOpsTab.ARGO_APPLICATIONS}
              label="Argo Applications"
              id="tab-argo-applications"
            />
            <Tab
              value={GitOpsTab.FLUX_KUSTOMIZATIONS}
              label="Flux Kustomizations"
              id="tab-flux-kustomizations"
            />
          </Tabs>

          {this.activeTab === GitOpsTab.ARGO_APPLICATIONS && this.renderArgoApplications()}
          {this.activeTab === GitOpsTab.FLUX_KUSTOMIZATIONS && this.renderFluxKustomizations()}
        </div>
      </SiblingsInTabLayout>
    );
  }
}

export const GitOps = withInjectables<Dependencies>(NonInjectedGitOps, {
  getProps: (di) => ({
    argoStore: di.inject(argoApplicationStoreInjectable),
    fluxStore: di.inject(fluxKustomizationStoreInjectable),
  }),
});
