/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  aggregateLogicalApplications,
  APP_LABEL_NAME,
  APP_LABEL_VERSION,
  APP_LABEL_COMPONENT,
  APP_LABEL_PART_OF,
  APP_LABEL_MANAGED_BY,
  LEGACY_LABEL_APP,
  LEGACY_LABEL_RELEASE,
  LEGACY_LABEL_HERITAGE,
  LEGACY_LABEL_HELM_CHART,
} from "../endpoints/logical-application";

describe("OpenLens DevOps R8-05: Kube Applications Multi-Workload Aggregation & Fallbacks", () => {
  it("resolves legacy and Helm fallback labels when standard app.kubernetes.io labels are absent", () => {
    const legacyHelmPod = {
      kind: "Pod",
      metadata: {
        name: "redis-master-0",
        namespace: "cache",
        labels: {
          [LEGACY_LABEL_APP]: "redis",
          [LEGACY_LABEL_RELEASE]: "redis-cluster",
          [LEGACY_LABEL_HELM_CHART]: "redis-14.8.11",
          [LEGACY_LABEL_HERITAGE]: "Helm",
        },
      },
      spec: {
        containers: [{ image: "docker.io/bitnami/redis:6.2.7" }],
      },
      status: {
        phase: "Running",
        containerStatuses: [{ ready: true }],
      },
    };

    const apps = aggregateLogicalApplications([legacyHelmPod]);

    expect(apps.length).toBe(1);

    const app = apps[0];

    expect(app.name).toBe("redis");
    expect(app.namespace).toBe("cache");
    expect(app.version).toBe("14.8.11");
    expect(app.managedBy).toBe("Helm");
    expect(app.totalWorkloads).toBe(1);
    expect(app.readyWorkloads).toBe(1);
    expect(app.healthSummary).toBe("1/1 ready");

    // Standard labels completeness should track standard labels adoption
    expect(app.completeness.hasName).toBe(false);
    expect(app.completeness.hasVersion).toBe(false);
    expect(app.completeness.hasManagedBy).toBe(false);
  });

  it("aggregates Deployments, StatefulSets, DaemonSets, Pods, Services, and Ingresses under the same logical application", () => {
    const deployment = {
      kind: "Deployment",
      metadata: {
        name: "shop-api",
        namespace: "production",
        labels: {
          [APP_LABEL_NAME]: "shop-portal",
          [APP_LABEL_VERSION]: "2.5.0",
          [APP_LABEL_COMPONENT]: "api",
          [APP_LABEL_PART_OF]: "shop-portal",
          [APP_LABEL_MANAGED_BY]: "argocd",
        },
      },
      spec: {
        template: {
          spec: {
            containers: [{ image: "internal.registry/shop/api:2.5.0" }],
          },
        },
      },
      status: {
        replicas: 2,
        readyReplicas: 2,
      },
    };

    const statefulSet = {
      kind: "StatefulSet",
      metadata: {
        name: "shop-db",
        namespace: "production",
        labels: {
          [APP_LABEL_NAME]: "shop-portal",
          [APP_LABEL_COMPONENT]: "database",
          [APP_LABEL_PART_OF]: "shop-portal",
        },
      },
      spec: {
        template: {
          spec: {
            containers: [{ image: "docker.io/library/postgres:15-alpine" }],
          },
        },
      },
      status: {
        replicas: 1,
        readyReplicas: 1,
      },
    };

    const daemonSet = {
      kind: "DaemonSet",
      metadata: {
        name: "shop-agent",
        namespace: "production",
        labels: {
          [APP_LABEL_NAME]: "shop-portal",
          [APP_LABEL_COMPONENT]: "telemetry",
          [APP_LABEL_PART_OF]: "shop-portal",
        },
      },
      spec: {
        template: {
          spec: {
            containers: [{ image: "docker.io/datadog/agent:7" }],
          },
        },
      },
      status: {
        desiredNumberScheduled: 3,
        numberReady: 3,
      },
    };

    const service = {
      kind: "Service",
      metadata: {
        name: "shop-service",
        namespace: "production",
        labels: {
          [APP_LABEL_NAME]: "shop-portal",
          [APP_LABEL_PART_OF]: "shop-portal",
        },
      },
    };

    const ingress = {
      kind: "Ingress",
      metadata: {
        name: "shop-ingress",
        namespace: "production",
        labels: {
          [APP_LABEL_NAME]: "shop-portal",
          [APP_LABEL_PART_OF]: "shop-portal",
        },
      },
    };

    const apps = aggregateLogicalApplications([deployment, statefulSet, daemonSet, service, ingress]);

    expect(apps.length).toBe(1);

    const app = apps[0];

    expect(app.name).toBe("shop-portal");
    expect(app.totalWorkloads).toBe(5);
    expect(app.readyWorkloads).toBe(5);
    expect(app.healthSummary).toBe("5/5 ready");

    // Check images
    expect(app.images).toContain("internal.registry/shop/api:2.5.0");
    expect(app.images).toContain("docker.io/library/postgres:15-alpine");
    expect(app.images).toContain("docker.io/datadog/agent:7");

    // Check component roles
    const componentRoles = app.components.map(c => ({ kind: c.kind, role: c.componentRole }));

    expect(componentRoles).toContainEqual({ kind: "Deployment", role: "api" });
    expect(componentRoles).toContainEqual({ kind: "StatefulSet", role: "database" });
    expect(componentRoles).toContainEqual({ kind: "DaemonSet", role: "telemetry" });
    expect(componentRoles).toContainEqual({ kind: "Service", role: "Service" });
    expect(componentRoles).toContainEqual({ kind: "Ingress", role: "Ingress" });
  });
});
