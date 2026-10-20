/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export const APP_LABEL_NAME = "app.kubernetes.io/name";
export const APP_LABEL_INSTANCE = "app.kubernetes.io/instance";
export const APP_LABEL_VERSION = "app.kubernetes.io/version";
export const APP_LABEL_COMPONENT = "app.kubernetes.io/component";
export const APP_LABEL_PART_OF = "app.kubernetes.io/part-of";
export const APP_LABEL_MANAGED_BY = "app.kubernetes.io/managed-by";

export interface LogicalAppComponent {
  kind: string;
  name: string;
  namespace: string;
  componentRole: string;
  images: string[];
  isReady: boolean;
  statusText: string;
}

export interface LogicalApplicationCompleteness {
  hasName: boolean;
  hasVersion: boolean;
  hasComponent: boolean;
  hasPartOf: boolean;
  hasManagedBy: boolean;
}

export interface LogicalApplication {
  id: string; // `${namespace}/${name}`
  name: string;
  namespace: string;
  version: string;
  partOf: string;
  managedBy: string;
  components: LogicalAppComponent[];
  images: string[];
  totalWorkloads: number;
  readyWorkloads: number;
  completeness: LogicalApplicationCompleteness;
  healthSummary: string;
}

export interface RawKubeResource {
  kind: string;
  metadata?: {
    name?: string;
    namespace?: string;
    labels?: Record<string, string>;
  };
  spec?: {
    template?: {
      spec?: {
        containers?: Array<{ image?: string }>;
        initContainers?: Array<{ image?: string }>;
      };
    };
    containers?: Array<{ image?: string }>;
    initContainers?: Array<{ image?: string }>;
  };
  status?: {
    replicas?: number;
    readyReplicas?: number;
    numberReady?: number;
    desiredNumberScheduled?: number;
    phase?: string;
    containerStatuses?: Array<{ ready?: boolean }>;
  };
}

/**
 * Extracts container images from any standard Kubernetes workload or Pod spec.
 */
export function extractWorkloadImages(resource: RawKubeResource): string[] {
  const images = new Set<string>();
  const containerList = [
    ...(resource.spec?.template?.spec?.containers || []),
    ...(resource.spec?.template?.spec?.initContainers || []),
    ...(resource.spec?.containers || []),
    ...(resource.spec?.initContainers || []),
  ];

  for (const c of containerList) {
    if (c.image) {
      images.add(c.image);
    }
  }

  return Array.from(images);
}

/**
 * Determines readiness and status text for a workload without inventing synthetic signals.
 */
export function evaluateWorkloadReadiness(resource: RawKubeResource): { isReady: boolean; statusText: string } {
  const kind = resource.kind || "Workload";
  const status = resource.status;

  if (!status) {
    return { isReady: false, statusText: "Unknown (No status reported)" };
  }

  switch (kind) {
    case "Deployment":
    case "StatefulSet":
    case "ReplicaSet": {
      const desired = resource.status?.replicas ?? 0;
      const ready = resource.status?.readyReplicas ?? 0;
      if (desired === 0) {
        return { isReady: true, statusText: "Scaled to 0" };
      }
      return {
        isReady: ready >= desired,
        statusText: `${ready}/${desired} ready`,
      };
    }
    case "DaemonSet": {
      const desired = resource.status?.desiredNumberScheduled ?? 0;
      const ready = resource.status?.numberReady ?? 0;
      return {
        isReady: ready >= desired && desired > 0,
        statusText: `${ready}/${desired} ready`,
      };
    }
    case "Pod": {
      const phase = resource.status?.phase || "Unknown";
      const containerStatuses = resource.status?.containerStatuses || [];
      const allContainersReady = containerStatuses.length > 0 && containerStatuses.every(c => c.ready);
      const isReady = phase === "Running" && allContainersReady;
      return {
        isReady,
        statusText: isReady ? "Running" : phase,
      };
    }
    default:
      return { isReady: true, statusText: "Active" };
  }
}

/**
 * Groups a collection of Kubernetes resources by their standard `app.kubernetes.io` labels.
 */
export function aggregateLogicalApplications(resources: RawKubeResource[]): LogicalApplication[] {
  const appMap = new Map<string, {
    appName: string;
    namespace: string;
    version: string;
    partOf: string;
    managedBy: string;
    completeness: LogicalApplicationCompleteness;
    components: LogicalAppComponent[];
    imagesSet: Set<string>;
  }>();

  for (const res of resources) {
    const labels = res.metadata?.labels || {};
    const nameLabel = labels[APP_LABEL_NAME];
    const instanceLabel = labels[APP_LABEL_INSTANCE];
    const partOfLabel = labels[APP_LABEL_PART_OF];
    const versionLabel = labels[APP_LABEL_VERSION];
    const componentLabel = labels[APP_LABEL_COMPONENT];
    const managedByLabel = labels[APP_LABEL_MANAGED_BY];

    // Must have at least one standard app label to qualify as a logical app component
    if (!nameLabel && !instanceLabel && !partOfLabel) {
      continue;
    }

    const appName = partOfLabel || nameLabel || instanceLabel || "unnamed-app";
    const namespace = res.metadata?.namespace || "default";
    const appId = `${namespace}/${appName}`;

    if (!appMap.has(appId)) {
      appMap.set(appId, {
        appName,
        namespace,
        version: versionLabel || "-",
        partOf: partOfLabel || "-",
        managedBy: managedByLabel || "unmanaged",
        completeness: {
          hasName: Boolean(nameLabel),
          hasVersion: Boolean(versionLabel),
          hasComponent: Boolean(componentLabel),
          hasPartOf: Boolean(partOfLabel),
          hasManagedBy: Boolean(managedByLabel),
        },
        components: [],
        imagesSet: new Set<string>(),
      });
    }

    const entry = appMap.get(appId)!;

    // Update completeness flags if other resources provide missing labels
    if (nameLabel) entry.completeness.hasName = true;
    if (versionLabel) {
      entry.completeness.hasVersion = true;
      if (entry.version === "-") entry.version = versionLabel;
    }
    if (componentLabel) entry.completeness.hasComponent = true;
    if (partOfLabel) {
      entry.completeness.hasPartOf = true;
      if (entry.partOf === "-") entry.partOf = partOfLabel;
    }
    if (managedByLabel) {
      entry.completeness.hasManagedBy = true;
      if (entry.managedBy === "unmanaged") entry.managedBy = managedByLabel;
    }

    const images = extractWorkloadImages(res);
    for (const img of images) {
      entry.imagesSet.add(img);
    }

    const readiness = evaluateWorkloadReadiness(res);

    entry.components.push({
      kind: res.kind || "Resource",
      name: res.metadata?.name || "unnamed",
      namespace,
      componentRole: componentLabel || res.kind || "component",
      images,
      isReady: readiness.isReady,
      statusText: readiness.statusText,
    });
  }

  const result: LogicalApplication[] = [];

  for (const [id, entry] of appMap.entries()) {
    const totalWorkloads = entry.components.length;
    const readyWorkloads = entry.components.filter(c => c.isReady).length;

    let healthSummary = "";
    if (totalWorkloads === 0) {
      healthSummary = "No workloads attached";
    } else if (readyWorkloads === totalWorkloads) {
      healthSummary = `${readyWorkloads}/${totalWorkloads} ready`;
    } else {
      healthSummary = `${readyWorkloads}/${totalWorkloads} ready (degraded)`;
    }

    result.push({
      id,
      name: entry.appName,
      namespace: entry.namespace,
      version: entry.version,
      partOf: entry.partOf,
      managedBy: entry.managedBy,
      components: entry.components,
      images: Array.from(entry.imagesSet),
      totalWorkloads,
      readyWorkloads,
      completeness: entry.completeness,
      healthSummary,
    });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}
