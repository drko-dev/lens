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

// Legacy and Helm fallback labels
export const LEGACY_LABEL_APP = "app";
export const LEGACY_LABEL_RELEASE = "release";
export const LEGACY_LABEL_HERITAGE = "heritage";
export const LEGACY_LABEL_HELM_CHART = "helm.sh/chart";
export const LEGACY_LABEL_VERSION = "version";

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
    [key: string]: any;
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
    [key: string]: any;
  } | any;
  status?: {
    replicas?: number;
    readyReplicas?: number;
    numberReady?: number;
    desiredNumberScheduled?: number;
    phase?: string;
    containerStatuses?: Array<{ ready?: boolean }>;
    [key: string]: any;
  } | any;
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

  if (kind === "Service" || kind === "Ingress") {
    return { isReady: true, statusText: "Active" };
  }

  if (kind === "Deployment" || kind === "StatefulSet" || kind === "ReplicaSet") {
    if (!status) {
      return { isReady: false, statusText: "Unknown (No status reported)" };
    }
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

  if (kind === "DaemonSet") {
    if (!status) {
      return { isReady: false, statusText: "Unknown (No status reported)" };
    }
    const desired = resource.status?.desiredNumberScheduled ?? 0;
    const ready = resource.status?.numberReady ?? 0;

    return {
      isReady: ready >= desired && desired > 0,
      statusText: `${ready}/${desired} ready`,
    };
  }

  if (kind === "Pod") {
    if (!status) {
      return { isReady: false, statusText: "Unknown (No status reported)" };
    }
    const phase = resource.status?.phase || "Unknown";
    const containerStatuses: Array<{ ready?: boolean }> = resource.status?.containerStatuses || [];
    const allContainersReady = containerStatuses.length > 0 && containerStatuses.every(c => c.ready);
    const isReady = phase === "Running" && allContainersReady;

    return {
      isReady,
      statusText: isReady ? "Running" : phase,
    };
  }

  return { isReady: true, statusText: "Active" };
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
    const stdName = labels[APP_LABEL_NAME];
    const stdInstance = labels[APP_LABEL_INSTANCE];
    const stdPartOf = labels[APP_LABEL_PART_OF];
    const stdVersion = labels[APP_LABEL_VERSION];
    const stdComponent = labels[APP_LABEL_COMPONENT];
    const stdManagedBy = labels[APP_LABEL_MANAGED_BY];

    // Fallbacks for legacy workloads and Helm releases
    const fallbackName = labels[LEGACY_LABEL_APP];
    const fallbackInstance = labels[LEGACY_LABEL_RELEASE];
    const fallbackVersion = labels[LEGACY_LABEL_VERSION] || (labels[LEGACY_LABEL_HELM_CHART] ? labels[LEGACY_LABEL_HELM_CHART].split("-").pop() : undefined);
    const fallbackManagedBy = labels[LEGACY_LABEL_HERITAGE] || (labels[LEGACY_LABEL_HELM_CHART] ? "Helm" : undefined);

    const nameLabel = stdName || fallbackName;
    const instanceLabel = stdInstance || fallbackInstance;
    const partOfLabel = stdPartOf;
    const versionLabel = stdVersion || fallbackVersion;
    const componentLabel = stdComponent;
    const managedByLabel = stdManagedBy || fallbackManagedBy;

    // Must have at least one identifying label to qualify as a logical app component
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
          hasName: Boolean(stdName),
          hasVersion: Boolean(stdVersion),
          hasComponent: Boolean(stdComponent),
          hasPartOf: Boolean(stdPartOf),
          hasManagedBy: Boolean(stdManagedBy),
        },
        components: [],
        imagesSet: new Set<string>(),
      });
    }

    const entry = appMap.get(appId);

    if (!entry) {
      continue;
    }

    // Update completeness flags if standard labels are provided
    if (stdName) entry.completeness.hasName = true;

    if (stdVersion) {
      entry.completeness.hasVersion = true;
      if (entry.version === "-") entry.version = stdVersion;
    }
    if (stdComponent) entry.completeness.hasComponent = true;

    if (stdPartOf) {
      entry.completeness.hasPartOf = true;
      if (entry.partOf === "-") entry.partOf = stdPartOf;
    }

    if (stdManagedBy) {
      entry.completeness.hasManagedBy = true;
      if (entry.managedBy === "unmanaged") entry.managedBy = stdManagedBy;
    }

    // Populate fallback details if still default
    if (versionLabel && entry.version === "-") entry.version = versionLabel;
    if (partOfLabel && entry.partOf === "-") entry.partOf = partOfLabel;
    if (managedByLabel && entry.managedBy === "unmanaged") entry.managedBy = managedByLabel;

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

/** Quiet period before the applications view reruns grouping after a watch storm. */
export const LOGICAL_APPLICATION_AGGREGATION_DEBOUNCE_MS = 300;

/**
 * Collapses a burst of kube watch updates into one call to
 * {@link aggregateLogicalApplications}. The pure function itself stays synchronous.
 */
export function createDebouncedLogicalApplicationAggregation<T>(
  waitMs = LOGICAL_APPLICATION_AGGREGATION_DEBOUNCE_MS,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    schedule(produce: () => T, publish: (value: T) => void) {
      if (timer !== undefined) {
        clearTimeout(timer);
      }

      timer = setTimeout(() => {
        timer = undefined;
        publish(produce());
      }, waitMs);
    },

    cancel() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
