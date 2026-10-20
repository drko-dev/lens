/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import autoBind from "auto-bind";
import { KubeObject } from "@openlens/kube-object";
import type {
  ClusterScopedMetadata,
  NamespaceScopedMetadata,
  KubeJsonApiData,
  KubeObjectMetadata,
  KubeObjectScope,
} from "@openlens/kube-object";
import type { DerivedKubeApiOptions, KubeApiDependencies } from "../kube-api";
import { KubeApi } from "../kube-api";

export interface DeviceSelector {
  cel?: {
    expression: string;
  };
}

export interface DeviceClassSpec {
  selectors?: DeviceSelector[];
  config?: any[];
}

export type DeviceClassData = KubeJsonApiData<
  KubeObjectMetadata<KubeObjectScope.Cluster>,
  void,
  DeviceClassSpec
>;

export class DeviceClass extends KubeObject<
  ClusterScopedMetadata,
  void,
  DeviceClassSpec
> {
  static kind = "DeviceClass";
  static namespaced = false;
  static apiBase = "/apis/resource.k8s.io/v1beta1/deviceclasses";

  constructor(data: DeviceClassData) {
    super(data);
    autoBind(this);
  }

  getSelectors(): string[] {
    return (this.spec?.selectors || [])
      .map(s => s.cel?.expression || "")
      .filter(Boolean);
  }

  getSelectorsSummary(): string {
    const selectors = this.getSelectors();

    if (!selectors.length) {
      return "<none>";
    }

    return selectors.slice(0, 2).join("; ") + (selectors.length > 2 ? ` (+${selectors.length - 2} more)` : "");
  }
}

export class DeviceClassApi extends KubeApi<DeviceClass, DeviceClassData> {
  constructor(deps: KubeApiDependencies, opts: DerivedKubeApiOptions = {}) {
    super(deps, {
      checkPreferredVersion: true,
      allowedUsableVersions: {
        "resource.k8s.io": [
          "v1beta1",
          "v1alpha3",
          "v1alpha2",
        ],
      },
      fallbackApiBases: [
        "/apis/resource.k8s.io/v1alpha3/deviceclasses",
        "/apis/resource.k8s.io/v1alpha2/deviceclasses",
      ],
      ...opts,
      objectConstructor: DeviceClass,
    });
  }
}

export interface ResourceClaimConsumer {
  resource: string;
  name: string;
  uid: string;
  apiGroup?: string;
}

export interface ResourceClaimSpec {
  devices?: {
    requests?: Array<{
      name: string;
      deviceClassName: string;
      selectors?: DeviceSelector[];
    }>;
  };
  resourceClassName?: string;
}

export interface ResourceClaimStatus {
  allocation?: {
    devices?: {
      results?: Array<{
        request: string;
        driver: string;
        pool: string;
        device: string;
      }>;
    };
  };
  reservedFor?: ResourceClaimConsumer[];
  deallocationRequested?: boolean;
}

export type ResourceClaimData = KubeJsonApiData<
  KubeObjectMetadata<KubeObjectScope.Namespace>,
  ResourceClaimStatus,
  ResourceClaimSpec
>;

export class ResourceClaim extends KubeObject<
  NamespaceScopedMetadata,
  ResourceClaimStatus,
  ResourceClaimSpec
> {
  static kind = "ResourceClaim";
  static namespaced = true;
  static apiBase = "/apis/resource.k8s.io/v1beta1/resourceclaims";

  constructor(data: ResourceClaimData) {
    super(data);
    autoBind(this);
  }

  isAllocated(): boolean {
    return Boolean(this.status?.allocation);
  }

  getAllocationSummary(): string {
    if (!this.isAllocated()) {
      return "Pending Allocation";
    }

    const results = this.status?.allocation?.devices?.results || [];

    if (!results.length) {
      return "Allocated";
    }

    return results
      .map(r => `${r.driver}/${r.device}`)
      .slice(0, 2)
      .join(", ") + (results.length > 2 ? ` (+${results.length - 2} more)` : "");
  }

  getReservedFor(): ResourceClaimConsumer[] {
    return this.status?.reservedFor || [];
  }

  getReservedForSummary(): string {
    const reserved = this.getReservedFor();

    if (!reserved.length) {
      return "<none>";
    }

    return reserved.map(r => `${r.resource}/${r.name}`).join(", ");
  }

  getRequestedDeviceClasses(): string[] {
    const requests = this.spec?.devices?.requests || [];

    if (requests.length) {
      return requests.map(r => r.deviceClassName);
    }

    return this.spec?.resourceClassName ? [this.spec.resourceClassName] : [];
  }
}

export class ResourceClaimApi extends KubeApi<ResourceClaim, ResourceClaimData> {
  constructor(deps: KubeApiDependencies, opts: DerivedKubeApiOptions = {}) {
    super(deps, {
      checkPreferredVersion: true,
      allowedUsableVersions: {
        "resource.k8s.io": [
          "v1beta1",
          "v1alpha3",
          "v1alpha2",
        ],
      },
      fallbackApiBases: [
        "/apis/resource.k8s.io/v1alpha3/resourceclaims",
        "/apis/resource.k8s.io/v1alpha2/resourceclaims",
      ],
      ...opts,
      objectConstructor: ResourceClaim,
    });
  }
}
