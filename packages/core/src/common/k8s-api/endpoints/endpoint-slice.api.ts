/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import autoBind from "auto-bind";
import { KubeObject } from "@openlens/kube-object";
import type { NamespaceScopedMetadata, ObjectReference, KubeJsonApiData, KubeObjectMetadata, KubeObjectScope } from "@openlens/kube-object";
import type { DerivedKubeApiOptions, KubeApiDependencies } from "../kube-api";
import { KubeApi } from "../kube-api";

export interface EndpointSlicePort {
  name?: string;
  port?: number;
  protocol?: string;
  appProtocol?: string;
}

export interface EndpointSliceEndpointConditions {
  ready?: boolean;
  serving?: boolean;
  terminating?: boolean;
}

export interface EndpointSliceEndpoint {
  addresses: string[];
  conditions?: EndpointSliceEndpointConditions;
  hostname?: string;
  nodeName?: string;
  targetRef?: ObjectReference;
  zone?: string;
}

export interface EndpointSliceData extends KubeJsonApiData<KubeObjectMetadata<KubeObjectScope.Namespace>, void, void> {
  addressType?: "IPv4" | "IPv6" | "FQDN";
  endpoints?: EndpointSliceEndpoint[];
  ports?: EndpointSlicePort[];
}

export class EndpointSlice extends KubeObject<NamespaceScopedMetadata, void, void> {
  static kind = "EndpointSlice";
  static namespaced = true;
  static apiBase = "/apis/discovery.k8s.io/v1/endpointslices";

  addressType: "IPv4" | "IPv6" | "FQDN";
  endpoints: EndpointSliceEndpoint[];
  ports: EndpointSlicePort[];

  constructor({ addressType = "IPv4", endpoints = [], ports = [], ...rest }: EndpointSliceData) {
    super(rest);
    autoBind(this);
    this.addressType = addressType;
    this.endpoints = endpoints;
    this.ports = ports;
  }

  getServiceName(): string {
    return this.metadata.labels?.["kubernetes.io/service-name"] || "";
  }

  getAddressType(): string {
    return this.addressType || "IPv4";
  }

  getEndpoints(): EndpointSliceEndpoint[] {
    return this.endpoints || [];
  }

  getPorts(): EndpointSlicePort[] {
    return this.ports || [];
  }

  getReadyEndpointsCount(): number {
    return this.getEndpoints().filter(ep => ep.conditions?.ready !== false).length;
  }

  getEndpointsSummary(): string {
    const total = this.getEndpoints().length;
    const ready = this.getReadyEndpointsCount();
    const ips = this.getEndpoints().flatMap(ep => ep.addresses).slice(0, 3).join(", ");
    const more = total > 3 ? ` (+${total - 3} more)` : "";

    return `${ready}/${total} ready [${ips}${more}]`;
  }

  getPortsSummary(): string {
    return this.getPorts()
      .map(p => `${p.port ?? "?"}/${p.protocol ?? "TCP"}${p.name ? ` (${p.name})` : ""}`)
      .join(", ") || "<none>";
  }
}

export class EndpointSliceApi extends KubeApi<EndpointSlice, EndpointSliceData> {
  constructor(deps: KubeApiDependencies, opts: DerivedKubeApiOptions = {}) {
    super(deps, {
      checkPreferredVersion: true,
      allowedUsableVersions: {
        "discovery.k8s.io": [
          "v1",
          "v1beta1",
        ],
      },
      fallbackApiBases: [
        "/apis/discovery.k8s.io/v1beta1/endpointslices",
      ],
      ...opts,
      objectConstructor: EndpointSlice,
    });
  }
}
