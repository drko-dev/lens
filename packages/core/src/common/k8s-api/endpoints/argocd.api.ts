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

export type ArgoHealthStatusCode =
  | "Healthy"
  | "Progressing"
  | "Degraded"
  | "Suspended"
  | "Missing"
  | "Unknown";

export type ArgoSyncStatusCode = "Synced" | "OutOfSync" | "Unknown";

export interface ArgoApplicationSource {
  repoURL: string;
  path?: string;
  targetRevision?: string;
  chart?: string;
}

export interface ArgoApplicationDestination {
  server?: string;
  namespace?: string;
  name?: string;
}

export interface ArgoApplicationSpec {
  project: string;
  source?: ArgoApplicationSource;
  sources?: ArgoApplicationSource[];
  destination: ArgoApplicationDestination;
  syncPolicy?: {
    automated?: {
      prune?: boolean;
      selfHeal?: boolean;
    };
  };
}

export interface ArgoApplicationStatus {
  health?: {
    status: ArgoHealthStatusCode;
    message?: string;
  };
  sync?: {
    status: ArgoSyncStatusCode;
    revision?: string;
  };
  operationState?: {
    phase?: string;
    message?: string;
  };
  summary?: {
    images?: string[];
  };
}

export type ArgoApplicationData = KubeJsonApiData<
  KubeObjectMetadata<KubeObjectScope.Namespace>,
  ArgoApplicationStatus,
  ArgoApplicationSpec
>;

export class ArgoApplication extends KubeObject<
  NamespaceScopedMetadata,
  ArgoApplicationStatus,
  ArgoApplicationSpec
> {
  static kind = "Application";
  static namespaced = true;
  static apiBase = "/apis/argoproj.io/v1alpha1/applications";

  constructor(data: ArgoApplicationData) {
    super(data);
    autoBind(this);
  }

  getProject(): string {
    return this.spec?.project || "default";
  }

  getHealthStatus(): ArgoHealthStatusCode {
    return this.status?.health?.status || "Unknown";
  }

  getHealthMessage(): string {
    return this.status?.health?.message || "";
  }

  getSyncStatus(): ArgoSyncStatusCode {
    return this.status?.sync?.status || "Unknown";
  }

  getRepoURL(): string {
    return this.spec?.source?.repoURL || this.spec?.sources?.[0]?.repoURL || "";
  }

  getTargetRevision(): string {
    return this.spec?.source?.targetRevision || this.spec?.sources?.[0]?.targetRevision || "HEAD";
  }

  getPath(): string {
    return this.spec?.source?.path || this.spec?.sources?.[0]?.path || "";
  }

  getDestinationSummary(): string {
    const dest = this.spec?.destination;

    if (!dest) {
      return "<none>";
    }

    const targetNs = dest.namespace || "default";
    const targetCluster = dest.name || (dest.server === "https://kubernetes.default.svc" ? "in-cluster" : dest.server || "default");

    return `${targetCluster} / ${targetNs}`;
  }

  getSyncRevision(): string {
    const rev = this.status?.sync?.revision;

    if (!rev) {
      return "-";
    }

    return rev.length > 7 ? rev.slice(0, 7) : rev;
  }
}

export class ArgoApplicationApi extends KubeApi<ArgoApplication, ArgoApplicationData> {
  constructor(deps: KubeApiDependencies, opts: DerivedKubeApiOptions = {}) {
    super(deps, {
      checkPreferredVersion: true,
      allowedUsableVersions: {
        "argoproj.io": [
          "v1alpha1",
        ],
      },
      ...opts,
      objectConstructor: ArgoApplication,
    });
  }
}

export interface ArgoAppProjectSpec {
  description?: string;
  sourceRepos?: string[];
  destinations?: Array<{
    namespace?: string;
    server?: string;
    name?: string;
  }>;
}

export type ArgoAppProjectData = KubeJsonApiData<
  KubeObjectMetadata<KubeObjectScope.Namespace>,
  void,
  ArgoAppProjectSpec
>;

export class ArgoAppProject extends KubeObject<
  NamespaceScopedMetadata,
  void,
  ArgoAppProjectSpec
> {
  static kind = "AppProject";
  static namespaced = true;
  static apiBase = "/apis/argoproj.io/v1alpha1/appprojects";

  constructor(data: ArgoAppProjectData) {
    super(data);
    autoBind(this);
  }

  getDescription(): string {
    return this.spec?.description || "";
  }

  getSourceReposCount(): number {
    return this.spec?.sourceRepos?.length || 0;
  }

  getDestinationsCount(): number {
    return this.spec?.destinations?.length || 0;
  }
}

export class ArgoAppProjectApi extends KubeApi<ArgoAppProject, ArgoAppProjectData> {
  constructor(deps: KubeApiDependencies, opts: DerivedKubeApiOptions = {}) {
    super(deps, {
      checkPreferredVersion: true,
      allowedUsableVersions: {
        "argoproj.io": [
          "v1alpha1",
        ],
      },
      ...opts,
      objectConstructor: ArgoAppProject,
    });
  }
}
