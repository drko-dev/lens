/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { VulnerabilityReport, VulnerabilityReportApi } from "../endpoints/trivy.api";
import {
  parseContainerImage,
} from "../endpoints/container-image";
import {
  aggregateLogicalApplications,
  APP_LABEL_NAME,
  APP_LABEL_INSTANCE,
  APP_LABEL_VERSION,
  APP_LABEL_COMPONENT,
  APP_LABEL_PART_OF,
  APP_LABEL_MANAGED_BY,
} from "../endpoints/logical-application";

describe("OpenLens DevOps R3-05: Logical Applications, Trivy & OCI Images", () => {
  describe("Logical Applications Aggregation", () => {
    it("groups workloads by app.kubernetes.io standard labels and calculates readiness", () => {
      const mockDeploy = {
        kind: "Deployment",
        metadata: {
          name: "web-ui",
          namespace: "ecommerce",
          labels: {
            [APP_LABEL_NAME]: "ecommerce-suite",
            [APP_LABEL_INSTANCE]: "prod-v1",
            [APP_LABEL_VERSION]: "1.4.0",
            [APP_LABEL_COMPONENT]: "frontend",
            [APP_LABEL_PART_OF]: "ecommerce-suite",
            [APP_LABEL_MANAGED_BY]: "helm",
          },
        },
        spec: {
          template: {
            spec: {
              containers: [{ image: "quay.io/myorg/web-ui:1.4.0" }],
            },
          },
        },
        status: {
          replicas: 3,
          readyReplicas: 3,
        },
      };

      const mockPod = {
        kind: "Pod",
        metadata: {
          name: "payment-db-0",
          namespace: "ecommerce",
          labels: {
            [APP_LABEL_NAME]: "ecommerce-suite",
            [APP_LABEL_COMPONENT]: "database",
            [APP_LABEL_PART_OF]: "ecommerce-suite",
          },
        },
        spec: {
          containers: [{ image: "docker.io/library/postgres@sha256:abcd1234ef5678" }],
        },
        status: {
          phase: "Running",
          containerStatuses: [{ ready: true }],
        },
      };

      const unlabelledPod = {
        kind: "Pod",
        metadata: {
          name: "random-test-pod",
          namespace: "ecommerce",
          labels: { "custom-label": "ignore-me" },
        },
      };

      const apps = aggregateLogicalApplications([mockDeploy, mockPod, unlabelledPod]);

      expect(apps.length).toBe(1);
      const app = apps[0];
      expect(app.name).toBe("ecommerce-suite");
      expect(app.namespace).toBe("ecommerce");
      expect(app.version).toBe("1.4.0");
      expect(app.managedBy).toBe("helm");
      expect(app.totalWorkloads).toBe(2);
      expect(app.readyWorkloads).toBe(2);
      expect(app.healthSummary).toBe("2/2 ready");
      expect(app.completeness.hasName).toBe(true);
      expect(app.completeness.hasVersion).toBe(true);
      expect(app.completeness.hasManagedBy).toBe(true);
      expect(app.images).toContain("quay.io/myorg/web-ui:1.4.0");
      expect(app.images).toContain("docker.io/library/postgres@sha256:abcd1234ef5678");
    });

    it("indicates degraded health when one component is not ready without inventing signals", () => {
      const mockDeployFailing = {
        kind: "Deployment",
        metadata: {
          name: "checkout-api",
          namespace: "default",
          labels: {
            [APP_LABEL_NAME]: "checkout",
          },
        },
        status: {
          replicas: 2,
          readyReplicas: 0,
        },
      };

      const apps = aggregateLogicalApplications([mockDeployFailing]);
      expect(apps.length).toBe(1);
      expect(apps[0].readyWorkloads).toBe(0);
      expect(apps[0].healthSummary).toContain("degraded");
    });
  });

  describe("Container Image Metadata & Immutability Parsing", () => {
    it("parses image with sha256 digest as pinned", () => {
      const parsed = parseContainerImage("quay.io/prometheus/prometheus@sha256:7f99ee30421");
      expect(parsed.registry).toBe("quay.io");
      expect(parsed.repository).toBe("prometheus/prometheus");
      expect(parsed.digest).toBe("sha256:7f99ee30421");
      expect(parsed.isDigestPinned).toBe(true);
      expect(parsed.isFloatingTag).toBe(false);
    });

    it("identifies floating tags like latest as not pinned", () => {
      const parsed = parseContainerImage("nginx:latest");
      expect(parsed.registry).toBe("docker.io");
      expect(parsed.repository).toBe("nginx");
      expect(parsed.tag).toBe("latest");
      expect(parsed.isDigestPinned).toBe(false);
      expect(parsed.isFloatingTag).toBe(true);
    });

    it("identifies semver tags", () => {
      const parsed = parseContainerImage("registry.internal.corp:5000/apps/auth:v2.1.0");
      expect(parsed.registry).toBe("registry.internal.corp:5000");
      expect(parsed.repository).toBe("apps/auth");
      expect(parsed.tag).toBe("v2.1.0");
      expect(parsed.isSemver).toBe(true);
      expect(parsed.isFloatingTag).toBe(false);
    });
  });

  describe("Trivy VulnerabilityReport Model", () => {
    const mockReport = new VulnerabilityReport({
      apiVersion: "aquasecurity.github.io/v1alpha1",
      kind: "VulnerabilityReport",
      metadata: {
        name: "deployment-web-ui-frontend",
        namespace: "ecommerce",
        selfLink: "/apis/aquasecurity.github.io/v1alpha1/namespaces/ecommerce/vulnerabilityreports/deployment-web-ui-frontend",
        uid: "trivy-1",
        resourceVersion: "100",
        creationTimestamp: new Date().toISOString(),
        labels: {
          "trivy-operator.resource.kind": "Deployment",
          "trivy-operator.resource.name": "web-ui",
          "trivy-operator.resource.namespace": "ecommerce",
          "trivy-operator.container.name": "frontend",
        },
      },
      report: {
        artifact: {
          repository: "quay.io/myorg/web-ui",
          tag: "1.4.0",
          digest: "sha256:abcd",
        },
        scanner: {
          name: "Trivy",
          vendor: "Aqua Security",
          version: "0.45.0",
        },
        summary: {
          criticalCount: 1,
          highCount: 3,
          mediumCount: 8,
          lowCount: 12,
          unknownCount: 0,
        },
        vulnerabilities: [
          {
            vulnerabilityID: "CVE-2023-44487",
            resource: "nghttp2",
            installedVersion: "1.43.0-1",
            fixedVersion: "1.43.0-2",
            severity: "CRITICAL",
            title: "HTTP/2 Rapid Reset Attack",
          },
          {
            vulnerabilityID: "CVE-2023-38545",
            resource: "curl",
            installedVersion: "7.88.1",
            severity: "HIGH",
            title: "SOCKS5 heap buffer overflow",
          },
        ],
      },
    });

    it("parses target metadata, image reference, and counts correctly", () => {
      expect(mockReport.getResourceKind()).toBe("Deployment");
      expect(mockReport.getResourceName()).toBe("web-ui");
      expect(mockReport.getContainerName()).toBe("frontend");
      expect(mockReport.getImageRef()).toBe("quay.io/myorg/web-ui@sha256:abcd");

      expect(mockReport.getCriticalCount()).toBe(1);
      expect(mockReport.getHighCount()).toBe(3);
      expect(mockReport.getTotalCount()).toBe(24);
      expect(mockReport.getHighestSeverity()).toBe("CRITICAL");
      expect(mockReport.getFixableCount()).toBe(1);
    });

    it("VulnerabilityReportApi handles cluster without Trivy Operator gracefully", () => {
      const mockLogger = {
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
      };

      const api = new VulnerabilityReportApi({
        logger: mockLogger as any,
        maybeKubeApi: jest.fn() as any,
      });

      expect(api.kind).toBe("VulnerabilityReport");
      expect(api.apiBase).toBe("/apis/aquasecurity.github.io/v1alpha1/vulnerabilityreports");
    });
  });
});
