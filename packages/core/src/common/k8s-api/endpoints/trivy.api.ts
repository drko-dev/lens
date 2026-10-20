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

export type VulnerabilitySeverity =
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "UNKNOWN"
  | "NONE";

export interface TrivyVulnerabilityItem {
  vulnerabilityID: string;
  resource: string;
  installedVersion: string;
  fixedVersion?: string;
  severity: VulnerabilitySeverity;
  title?: string;
  description?: string;
  primaryLink?: string;
  score?: number;
}

export interface TrivyVulnerabilitySummary {
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  unknownCount: number;
  noneCount?: number;
}

export interface TrivyVulnerabilityReportReport {
  artifact?: {
    repository?: string;
    tag?: string;
    digest?: string;
  };
  scanner?: {
    name?: string;
    vendor?: string;
    version?: string;
  };
  summary?: TrivyVulnerabilitySummary;
  vulnerabilities?: TrivyVulnerabilityItem[];
}

export interface TrivyVulnerabilityReportData extends KubeJsonApiData<
  KubeObjectMetadata<KubeObjectScope.Namespace>,
  void,
  void
> {
  report?: TrivyVulnerabilityReportReport;
}

export class VulnerabilityReport extends KubeObject<
  NamespaceScopedMetadata,
  void,
  void
> {
  static kind = "VulnerabilityReport";
  static namespaced = true;
  static apiBase = "/apis/aquasecurity.github.io/v1alpha1/vulnerabilityreports";

  report?: TrivyVulnerabilityReportReport;

  constructor(data: TrivyVulnerabilityReportData) {
    super(data);
    this.report = data.report;
    autoBind(this);
  }

  getResourceKind(): string {
    return this.metadata.labels?.["trivy-operator.resource.kind"] || "";
  }

  getResourceName(): string {
    return this.metadata.labels?.["trivy-operator.resource.name"] || "";
  }

  getResourceNamespace(): string {
    return this.metadata.labels?.["trivy-operator.resource.namespace"] || this.getNs();
  }

  getContainerName(): string {
    return this.metadata.labels?.["trivy-operator.container.name"] || "";
  }

  getRepository(): string {
    return this.report?.artifact?.repository || "";
  }

  getTag(): string {
    return this.report?.artifact?.tag || "";
  }

  getDigest(): string {
    return this.report?.artifact?.digest || "";
  }

  getImageRef(): string {
    const repo = this.getRepository();
    const tag = this.getTag();
    const digest = this.getDigest();
    if (!repo) return "";
    if (digest) return `${repo}@${digest}`;
    if (tag) return `${repo}:${tag}`;
    return repo;
  }

  getSummary(): TrivyVulnerabilitySummary {
    return {
      criticalCount: this.report?.summary?.criticalCount || 0,
      highCount: this.report?.summary?.highCount || 0,
      mediumCount: this.report?.summary?.mediumCount || 0,
      lowCount: this.report?.summary?.lowCount || 0,
      unknownCount: this.report?.summary?.unknownCount || 0,
      noneCount: this.report?.summary?.noneCount || 0,
    };
  }

  getCriticalCount(): number {
    return this.getSummary().criticalCount;
  }

  getHighCount(): number {
    return this.getSummary().highCount;
  }

  getMediumCount(): number {
    return this.getSummary().mediumCount;
  }

  getLowCount(): number {
    return this.getSummary().lowCount;
  }

  getTotalCount(): number {
    const s = this.getSummary();
    return s.criticalCount + s.highCount + s.mediumCount + s.lowCount + s.unknownCount;
  }

  getHighestSeverity(): VulnerabilitySeverity {
    const s = this.getSummary();
    if (s.criticalCount > 0) return "CRITICAL";
    if (s.highCount > 0) return "HIGH";
    if (s.mediumCount > 0) return "MEDIUM";
    if (s.lowCount > 0) return "LOW";
    if (s.unknownCount > 0) return "UNKNOWN";
    return "NONE";
  }

  getVulnerabilities(): TrivyVulnerabilityItem[] {
    return this.report?.vulnerabilities || [];
  }

  getFixableCount(): number {
    return this.getVulnerabilities().filter(v => Boolean(v.fixedVersion)).length;
  }
}

export class VulnerabilityReportApi extends KubeApi<VulnerabilityReport, TrivyVulnerabilityReportData> {
  constructor(deps: KubeApiDependencies, opts: DerivedKubeApiOptions = {}) {
    super(deps, {
      checkPreferredVersion: true,
      allowedUsableVersions: {
        "aquasecurity.github.io": [
          "v1alpha1",
        ],
      },
      ...opts,
      objectConstructor: VulnerabilityReport,
    });
  }
}
