/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./applications.scss";

import React from "react";
import { observer } from "mobx-react";
import { observable, makeObservable, computed } from "mobx";
import type { IComputedValue } from "mobx";
import { KubeObjectListLayout } from "../kube-object-list-layout";
import { ItemListLayout } from "../item-object-list";
import type { ItemListStore } from "../item-object-list/list-layout";
import { SiblingsInTabLayout } from "../layout/siblings-in-tab-layout";
import { NamespaceSelectBadge } from "../namespaces/namespace-select-badge";
import { Badge } from "../badge";
import { Tabs, Tab } from "../tabs";
import { KubeObjectAge } from "../kube-object/age";
import { KubeObjectStatusIcon } from "../kube-object-status-icon";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { DeploymentStore } from "../workloads-deployments/store";
import type { PodStore } from "../workloads-pods/store";
import type { VulnerabilityReportStore } from "./vulnerability-report-store";
import deploymentStoreInjectable from "../workloads-deployments/store.injectable";
import podStoreInjectable from "../workloads-pods/store.injectable";
import vulnerabilityReportStoreInjectable from "./vulnerability-report-store.injectable";
import { shouldShowResourceInjectionToken } from "../../../features/cluster/showing-kube-resources/common/allowed-resources-injection-token";
import type { ItemObject } from "@openlens/list-layout";
import {
  aggregateLogicalApplications,
  LogicalApplication,
} from "../../../common/k8s-api/endpoints/logical-application";
import {
  parseContainerImage,
  ParsedContainerImage,
} from "../../../common/k8s-api/endpoints/container-image";

export enum ApplicationsTab {
  LOGICAL_APPLICATIONS = "logical-applications",
  TRIVY_REPORTS = "trivy-reports",
  CONTAINER_IMAGES = "container-images",
}

export class LogicalAppItem implements ItemObject {
  constructor(public readonly app: LogicalApplication) {}

  getId(): string {
    return this.app.id;
  }

  getName(): string {
    return this.app.name;
  }

  getNs(): string {
    return this.app.namespace;
  }

  getVersion(): string {
    return this.app.version;
  }

  getManagedBy(): string {
    return this.app.managedBy;
  }

  getPartOf(): string {
    return this.app.partOf;
  }

  getWorkloadsSummary(): string {
    const counts: Record<string, number> = {};
    for (const c of this.app.components) {
      counts[c.kind] = (counts[c.kind] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([k, v]) => `${v} ${k}${v > 1 ? "s" : ""}`)
      .join(", ") || "None";
  }

  getHealthSummary(): string {
    return this.app.healthSummary;
  }

  getImagesCount(): number {
    return this.app.images.length;
  }

  getImages(): string[] {
    return this.app.images;
  }

  getCompletenessScore(): string {
    const c = this.app.completeness;
    const count = [c.hasName, c.hasVersion, c.hasComponent, c.hasPartOf, c.hasManagedBy].filter(Boolean).length;
    return `${count}/5 labels`;
  }

  getSearchFields(): string[] {
    return [
      this.app.name,
      this.app.namespace,
      this.app.version,
      this.app.managedBy,
      this.app.partOf,
      ...this.app.images,
      ...this.app.components.map(c => c.name),
    ];
  }
}

export class ContainerImageItem implements ItemObject {
  constructor(
    public readonly parsed: ParsedContainerImage,
    public readonly usedBy: Array<{ kind: string; name: string; namespace: string }>
  ) {}

  getId(): string {
    return this.parsed.raw;
  }

  getName(): string {
    return this.parsed.repository;
  }

  getRegistry(): string {
    return this.parsed.registry;
  }

  getTag(): string {
    return this.parsed.tag;
  }

  getDigest(): string {
    return this.parsed.digest || "-";
  }

  getImmutability(): string {
    if (this.parsed.isDigestPinned) return "Digest Pinned";
    if (this.parsed.isFloatingTag) return "Floating Tag";
    if (this.parsed.isSemver) return "Semver Tag";
    return "Tag Pinned";
  }

  getUsedBySummary(): string {
    return this.usedBy.map(u => `${u.kind}/${u.name}`).join(", ") || "-";
  }

  getSearchFields(): string[] {
    return [
      this.parsed.raw,
      this.parsed.registry,
      this.parsed.repository,
      this.parsed.tag,
      this.parsed.digest || "",
      ...this.usedBy.map(u => `${u.name} ${u.namespace}`),
    ];
  }
}

enum AppColumnId {
  name = "name",
  namespace = "namespace",
  version = "version",
  managedBy = "managedBy",
  workloads = "workloads",
  health = "health",
  completeness = "completeness",
  images = "images",
}

enum TrivyColumnId {
  name = "name",
  namespace = "namespace",
  target = "target",
  container = "container",
  critical = "critical",
  high = "high",
  medium = "medium",
  low = "low",
  total = "total",
  highest = "highest",
  age = "age",
}

enum ImageColumnId {
  registry = "registry",
  repository = "repository",
  tag = "tag",
  immutability = "immutability",
  usedBy = "usedBy",
  digest = "digest",
}

interface Dependencies {
  deploymentStore: DeploymentStore;
  podStore: PodStore;
  vulnerabilityReportStore: VulnerabilityReportStore;
  isTrivyAllowed: IComputedValue<boolean>;
}

function createReadOnlyListStore<I extends ItemObject>(getItems: () => I[]): ItemListStore<I, false> {
  return {
    isLoaded: true,
    failedLoading: false,
    getTotalCount: () => getItems().length,
    isSelected: () => false,
    toggleSelection: () => {},
    isSelectedAll: () => false,
    toggleSelectionAll: () => {},
    pickOnlySelected: () => [],
    selectedItems: [],
    removeItems: async () => {},
  };
}

@observer
class NonInjectedApplications extends React.Component<Dependencies> {
  @observable activeTab: ApplicationsTab = ApplicationsTab.LOGICAL_APPLICATIONS;

  private logicalAppsStore = createReadOnlyListStore(() => this.logicalAppItems);
  private containerImagesStore = createReadOnlyListStore(() => this.containerImageItems);

  constructor(props: Dependencies) {
    super(props);
    makeObservable(this);
  }

  private onTabChange = (tab: ApplicationsTab) => {
    this.activeTab = tab;
  };

  @computed get logicalAppItems(): LogicalAppItem[] {
    const rawDeployments = (this.props.deploymentStore.items || []).map(d => ({
      kind: "Deployment",
      metadata: {
        name: d.getName(),
        namespace: d.getNs(),
        labels: d.getLabels().reduce<Record<string, string>>((acc, l) => {
          const [k, v] = l.split("=");
          if (k) acc[k] = v || "";
          return acc;
        }, {}),
      },
      spec: d.spec,
      status: d.status,
    }));

    const rawPods = (this.props.podStore.items || []).map(p => ({
      kind: "Pod",
      metadata: {
        name: p.getName(),
        namespace: p.getNs(),
        labels: p.getLabels().reduce<Record<string, string>>((acc, l) => {
          const [k, v] = l.split("=");
          if (k) acc[k] = v || "";
          return acc;
        }, {}),
      },
      spec: p.spec,
      status: p.status,
    }));

    const apps = aggregateLogicalApplications([...rawDeployments, ...rawPods]);
    return apps.map(app => new LogicalAppItem(app));
  }

  @computed get containerImageItems(): ContainerImageItem[] {
    const map = new Map<string, {
      parsed: ParsedContainerImage;
      usedBy: Array<{ kind: string; name: string; namespace: string }>;
    }>();

    const registerImage = (img: string, kind: string, name: string, namespace: string) => {
      if (!img) return;
      if (!map.has(img)) {
        map.set(img, {
          parsed: parseContainerImage(img),
          usedBy: [],
        });
      }
      map.get(img)!.usedBy.push({ kind, name, namespace });
    };

    for (const d of this.props.deploymentStore.items || []) {
      const containers = d.spec?.template?.spec?.containers || [];
      for (const c of containers) {
        if (c.image) registerImage(c.image, "Deployment", d.getName(), d.getNs());
      }
    }

    for (const p of this.props.podStore.items || []) {
      const containers = p.spec?.containers || [];
      for (const c of containers) {
        if (c.image) registerImage(c.image, "Pod", p.getName(), p.getNs());
      }
    }

    return Array.from(map.values())
      .map(entry => new ContainerImageItem(entry.parsed, entry.usedBy))
      .sort((a, b) => a.getName().localeCompare(b.getName()));
  }

  private renderLogicalApplications() {
    return (
      <ItemListLayout<LogicalAppItem, false>
        isConfigurable
        preloadStores={false}
        tableId="logical_applications_table"
        className="LogicalApplications"
        store={this.logicalAppsStore}
        getItems={() => this.logicalAppItems}
        sortingCallbacks={{
          [AppColumnId.name]: item => item.getName(),
          [AppColumnId.namespace]: item => item.getNs(),
          [AppColumnId.version]: item => item.getVersion(),
          [AppColumnId.managedBy]: item => item.getManagedBy(),
          [AppColumnId.health]: item => item.getHealthSummary(),
        }}
        searchFilters={[
          item => item.getSearchFields(),
        ]}
        renderHeaderTitle="Logical Applications"
        renderTableHeader={[
          { title: "Application", className: "name", sortBy: AppColumnId.name, id: AppColumnId.name },
          { title: "Namespace", className: "namespace", sortBy: AppColumnId.namespace, id: AppColumnId.namespace },
          { title: "Version", className: "version", sortBy: AppColumnId.version, id: AppColumnId.version },
          { title: "Managed By", className: "managedBy", sortBy: AppColumnId.managedBy, id: AppColumnId.managedBy },
          { title: "Workloads Attached", className: "workloads", id: AppColumnId.workloads },
          { title: "Health Status", className: "health", sortBy: AppColumnId.health, id: AppColumnId.health },
          { title: "Spec Completeness", className: "completeness", id: AppColumnId.completeness },
          { title: "Images", className: "images", id: AppColumnId.images },
        ]}
        renderTableContents={item => [
          item.getName(),
          <NamespaceSelectBadge key="ns" namespace={item.getNs()} />,
          <Badge key="version" label={item.getVersion()} />,
          <Badge key="managed" label={item.getManagedBy()} />,
          item.getWorkloadsSummary(),
          <Badge
            key="health"
            label={item.getHealthSummary()}
            className={item.getHealthSummary().includes("degraded") ? "badge-high" : "badge-pinned"}
          />,
          <Badge key="comp" label={item.getCompletenessScore()} className="completeness-badge" />,
          `${item.getImagesCount()} distinct`,
        ]}
      />
    );
  }

  private renderTrivyReports() {
    if (!this.props.isTrivyAllowed.get()) {
      return (
        <div className="trivy-optional-notice" data-testid="trivy-optional-notice">
          <strong>Trivy Operator CRD (vulnerabilityreports.aquasecurity.github.io):</strong> Currently absent or unauthorized in this cluster context. When Trivy Operator is installed, container image vulnerability scans and security posture appear here in real time.
        </div>
      );
    }

    return (
      <KubeObjectListLayout
        isConfigurable
        tableId="trivy_vulnerability_reports"
        className="VulnerabilityReports"
        store={this.props.vulnerabilityReportStore}
        sortingCallbacks={{
          [TrivyColumnId.name]: r => r.getName(),
          [TrivyColumnId.namespace]: r => r.getNs(),
          [TrivyColumnId.target]: r => `${r.getResourceKind()}/${r.getResourceName()}`,
          [TrivyColumnId.critical]: r => r.getCriticalCount(),
          [TrivyColumnId.high]: r => r.getHighCount(),
          [TrivyColumnId.total]: r => r.getTotalCount(),
          [TrivyColumnId.age]: r => -r.getCreationTimestamp(),
        }}
        searchFilters={[
          r => r.getSearchFields(),
          r => r.getResourceKind(),
          r => r.getResourceName(),
          r => r.getContainerName(),
          r => r.getRepository(),
        ]}
        renderHeaderTitle="Trivy Vulnerability Reports"
        renderTableHeader={[
          { title: "Report", className: "name", sortBy: TrivyColumnId.name, id: TrivyColumnId.name },
          { className: "warning", showWithColumn: TrivyColumnId.name },
          { title: "Namespace", className: "namespace", sortBy: TrivyColumnId.namespace, id: TrivyColumnId.namespace },
          { title: "Target Resource", className: "target", sortBy: TrivyColumnId.target, id: TrivyColumnId.target },
          { title: "Container", className: "container", id: TrivyColumnId.container },
          { title: "Critical", className: "critical", sortBy: TrivyColumnId.critical, id: TrivyColumnId.critical },
          { title: "High", className: "high", sortBy: TrivyColumnId.high, id: TrivyColumnId.high },
          { title: "Medium", className: "medium", id: TrivyColumnId.medium },
          { title: "Low", className: "low", id: TrivyColumnId.low },
          { title: "Total", className: "total", sortBy: TrivyColumnId.total, id: TrivyColumnId.total },
          { title: "Highest", className: "highest", id: TrivyColumnId.highest },
          { title: "Age", className: "age", sortBy: TrivyColumnId.age, id: TrivyColumnId.age },
        ]}
        renderTableContents={r => [
          r.getName(),
          <KubeObjectStatusIcon key="icon" object={r} />,
          <NamespaceSelectBadge key="ns" namespace={r.getNs()} />,
          `${r.getResourceKind()}/${r.getResourceName()}`,
          r.getContainerName() || "-",
          <Badge key="crit" label={String(r.getCriticalCount())} className="badge-critical" />,
          <Badge key="high" label={String(r.getHighCount())} className="badge-high" />,
          <Badge key="med" label={String(r.getMediumCount())} className="badge-medium" />,
          <Badge key="low" label={String(r.getLowCount())} className="badge-low" />,
          String(r.getTotalCount()),
          <Badge
            key="highest"
            label={r.getHighestSeverity()}
            className={`badge-${r.getHighestSeverity().toLowerCase()}`}
          />,
          <KubeObjectAge key="age" object={r} />,
        ]}
      />
    );
  }

  private renderContainerImages() {
    return (
      <ItemListLayout<ContainerImageItem, false>
        isConfigurable
        preloadStores={false}
        tableId="container_images_table"
        className="ContainerImages"
        store={this.containerImagesStore}
        getItems={() => this.containerImageItems}
        sortingCallbacks={{
          [ImageColumnId.registry]: item => item.getRegistry(),
          [ImageColumnId.repository]: item => item.getName(),
          [ImageColumnId.tag]: item => item.getTag(),
          [ImageColumnId.immutability]: item => item.getImmutability(),
        }}
        searchFilters={[
          item => item.getSearchFields(),
        ]}
        renderHeaderTitle="Container Images"
        renderTableHeader={[
          { title: "Registry", className: "registry", sortBy: ImageColumnId.registry, id: ImageColumnId.registry },
          { title: "Repository", className: "repository", sortBy: ImageColumnId.repository, id: ImageColumnId.repository },
          { title: "Tag", className: "tag", sortBy: ImageColumnId.tag, id: ImageColumnId.tag },
          { title: "Digest (SHA-256)", className: "digest", id: ImageColumnId.digest },
          { title: "Immutability Posture", className: "immutability", sortBy: ImageColumnId.immutability, id: ImageColumnId.immutability },
          { title: "Used By Workloads", className: "usedBy", id: ImageColumnId.usedBy },
        ]}
        renderTableContents={item => [
          item.getRegistry(),
          item.getName(),
          <Badge key="tag" label={item.getTag()} />,
          <span key="digest" className="image-ref-cell">{item.getDigest()}</span>,
          <Badge
            key="immut"
            label={item.getImmutability()}
            className={
              item.getImmutability() === "Digest Pinned"
                ? "badge-pinned"
                : item.getImmutability() === "Semver Tag"
                ? "badge-semver"
                : "badge-floating"
            }
          />,
          item.getUsedBySummary(),
        ]}
      />
    );
  }

  render() {
    return (
      <SiblingsInTabLayout>
        <div className="ApplicationsView" data-testid="applications-view">
          <div className="readonly-notice" data-testid="apps-trivy-security-notice">
            <strong>Logical Applications & OCI Security:</strong> Aggregated views based on standard app.kubernetes.io labels and optional Trivy Operator CRDs (aquasecurity.github.io). External registries are not queried and secrets are never extracted.
          </div>

          <Tabs
            className="view-tabs"
            value={this.activeTab}
            onChange={this.onTabChange}
          >
            <Tab
              value={ApplicationsTab.LOGICAL_APPLICATIONS}
              label="Logical Applications"
              id="tab-logical-applications"
            />
            <Tab
              value={ApplicationsTab.TRIVY_REPORTS}
              label="Vulnerability Reports (Trivy)"
              id="tab-trivy-reports"
            />
            <Tab
              value={ApplicationsTab.CONTAINER_IMAGES}
              label="Container Images"
              id="tab-container-images"
            />
          </Tabs>

          {this.activeTab === ApplicationsTab.LOGICAL_APPLICATIONS && this.renderLogicalApplications()}
          {this.activeTab === ApplicationsTab.TRIVY_REPORTS && this.renderTrivyReports()}
          {this.activeTab === ApplicationsTab.CONTAINER_IMAGES && this.renderContainerImages()}
        </div>
      </SiblingsInTabLayout>
    );
  }
}

export const Applications = withInjectables<Dependencies>(NonInjectedApplications, {
  getProps: (di) => ({
    deploymentStore: di.inject(deploymentStoreInjectable),
    podStore: di.inject(podStoreInjectable),
    vulnerabilityReportStore: di.inject(vulnerabilityReportStoreInjectable),
    isTrivyAllowed: di.inject(shouldShowResourceInjectionToken, {
      apiName: "vulnerabilityreports",
      group: "aquasecurity.github.io",
    }),
  }),
});
