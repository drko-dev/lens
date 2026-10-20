/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import autoBind from "auto-bind";
import { KubeObject } from "@openlens/kube-object";
import type {
  NamespaceScopedMetadata,
  KubeJsonApiData,
  KubeObjectMetadata,
  KubeObjectScope,
} from "@openlens/kube-object";
import type { DerivedKubeApiOptions, KubeApiDependencies } from "../kube-api";
import { KubeApi } from "../kube-api";

export interface FluxCondition {
  type: string;
  status: "True" | "False" | "Unknown";
  lastTransitionTime?: string;
  reason?: string;
  message?: string;
}

export interface FluxKustomizationSpec {
  path?: string;
  sourceRef: {
    kind: string;
    name: string;
    namespace?: string;
  };
  interval?: string;
  prune?: boolean;
  suspend?: boolean;
  targetNamespace?: string;
}

export interface FluxKustomizationStatus {
  conditions?: FluxCondition[];
  lastAppliedRevision?: string;
  lastAttemptedRevision?: string;
}

export type FluxKustomizationData = KubeJsonApiData<
  KubeObjectMetadata<KubeObjectScope.Namespace>,
  FluxKustomizationStatus,
  FluxKustomizationSpec
>;

export class FluxKustomization extends KubeObject<
  NamespaceScopedMetadata,
  FluxKustomizationStatus,
  FluxKustomizationSpec
> {
  static kind = "Kustomization";
  static namespaced = true;
  static apiBase = "/apis/kustomize.toolkit.fluxcd.io/v1/kustomizations";

  constructor(data: FluxKustomizationData) {
    super(data);
    autoBind(this);
  }

  isReady(): boolean {
    return (this.status?.conditions || []).some(c => c.type === "Ready" && c.status === "True");
  }

  isSuspended(): boolean {
    return Boolean(this.spec?.suspend);
  }

  getStatusSummary(): string {
    if (this.isSuspended()) {
      return "Suspended";
    }

    const readyCond = (this.status?.conditions || []).find(c => c.type === "Ready");

    if (!readyCond) {
      return "Reconciling";
    }

    return readyCond.status === "True" ? "Ready" : readyCond.reason || "Failed";
  }

  getStatusMessage(): string {
    const readyCond = (this.status?.conditions || []).find(c => c.type === "Ready");

    return readyCond?.message || "";
  }

  getLastAppliedRevision(): string {
    const rev = this.status?.lastAppliedRevision;

    if (!rev) {
      return "-";
    }

    const parts = rev.split("@sha1:");

    if (parts.length === 2) {
      return `${parts[0]}@${parts[1].slice(0, 7)}`;
    }

    return rev.length > 12 ? rev.slice(0, 12) : rev;
  }

  getSourceRefSummary(): string {
    const src = this.spec?.sourceRef;

    if (!src) {
      return "<none>";
    }

    return `${src.kind}/${src.name}`;
  }

  getPath(): string {
    return this.spec?.path || "./";
  }
}

export class FluxKustomizationApi extends KubeApi<FluxKustomization, FluxKustomizationData> {
  constructor(deps: KubeApiDependencies, opts: DerivedKubeApiOptions = {}) {
    super(deps, {
      checkPreferredVersion: true,
      allowedUsableVersions: {
        "kustomize.toolkit.fluxcd.io": [
          "v1",
          "v1beta2",
          "v1beta1",
        ],
      },
      fallbackApiBases: [
        "/apis/kustomize.toolkit.fluxcd.io/v1beta2/kustomizations",
        "/apis/kustomize.toolkit.fluxcd.io/v1beta1/kustomizations",
      ],
      ...opts,
      objectConstructor: FluxKustomization,
    });
  }
}

export interface FluxHelmReleaseSpec {
  chart: {
    spec: {
      chart: string;
      version?: string;
      sourceRef: {
        kind: string;
        name: string;
        namespace?: string;
      };
    };
  };
  interval?: string;
  suspend?: boolean;
  targetNamespace?: string;
}

export interface FluxHelmReleaseStatus {
  conditions?: FluxCondition[];
  lastAppliedRevision?: string;
  lastAttemptedRevision?: string;
}

export type FluxHelmReleaseData = KubeJsonApiData<
  KubeObjectMetadata<KubeObjectScope.Namespace>,
  FluxHelmReleaseStatus,
  FluxHelmReleaseSpec
>;

export class FluxHelmRelease extends KubeObject<
  NamespaceScopedMetadata,
  FluxHelmReleaseStatus,
  FluxHelmReleaseSpec
> {
  static kind = "HelmRelease";
  static namespaced = true;
  static apiBase = "/apis/helm.toolkit.fluxcd.io/v2/helmreleases";

  constructor(data: FluxHelmReleaseData) {
    super(data);
    autoBind(this);
  }

  isReady(): boolean {
    return (this.status?.conditions || []).some(c => c.type === "Ready" && c.status === "True");
  }

  isSuspended(): boolean {
    return Boolean(this.spec?.suspend);
  }

  getStatusSummary(): string {
    if (this.isSuspended()) {
      return "Suspended";
    }

    const readyCond = (this.status?.conditions || []).find(c => c.type === "Ready");

    if (!readyCond) {
      return "Reconciling";
    }

    return readyCond.status === "True" ? "Ready" : readyCond.reason || "Failed";
  }

  getChartSummary(): string {
    const chart = this.spec?.chart?.spec;

    if (!chart) {
      return "<none>";
    }

    return `${chart.chart}${chart.version ? ` (${chart.version})` : ""}`;
  }

  getLastRevision(): string {
    return this.status?.lastAppliedRevision || this.status?.lastAttemptedRevision || "-";
  }
}

export class FluxHelmReleaseApi extends KubeApi<FluxHelmRelease, FluxHelmReleaseData> {
  constructor(deps: KubeApiDependencies, opts: DerivedKubeApiOptions = {}) {
    super(deps, {
      checkPreferredVersion: true,
      allowedUsableVersions: {
        "helm.toolkit.fluxcd.io": [
          "v2",
          "v2beta2",
          "v2beta1",
        ],
      },
      fallbackApiBases: [
        "/apis/helm.toolkit.fluxcd.io/v2beta2/helmreleases",
        "/apis/helm.toolkit.fluxcd.io/v2beta1/helmreleases",
      ],
      ...opts,
      objectConstructor: FluxHelmRelease,
    });
  }
}
