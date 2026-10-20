/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import autoBind from "auto-bind";
import { KubeObject } from "@openlens/kube-object";
import type {
  NamespaceScopedMetadata,
  ClusterScopedMetadata,
  KubeJsonApiData,
  KubeObjectMetadata,
  KubeObjectScope,
} from "@openlens/kube-object";
import type { DerivedKubeApiOptions, KubeApiDependencies } from "../kube-api";
import { KubeApi } from "../kube-api";

export interface GatewayCondition {
  type: string;
  status: "True" | "False" | "Unknown";
  observedGeneration?: number;
  lastTransitionTime?: string;
  reason?: string;
  message?: string;
}

export interface GatewayAddress {
  type?: string;
  value: string;
}

export interface GatewayListener {
  name: string;
  hostname?: string;
  port: number;
  protocol: string;
  allowedRoutes?: {
    namespaces?: {
      from?: "All" | "Selector" | "Same";
      selector?: {
        matchLabels?: Record<string, string>;
      };
    };
    kinds?: Array<{
      group?: string;
      kind: string;
    }>;
  };
}

export interface GatewaySpec {
  gatewayClassName: string;
  listeners: GatewayListener[];
  addresses?: GatewayAddress[];
}

export interface GatewayStatus {
  addresses?: GatewayAddress[];
  conditions?: GatewayCondition[];
  listeners?: Array<{
    name: string;
    supportedKinds?: Array<{ group?: string; kind: string }>;
    attachedRoutes?: number;
    conditions?: GatewayCondition[];
  }>;
}

export type GatewayData = KubeJsonApiData<KubeObjectMetadata<KubeObjectScope.Namespace>, GatewayStatus, GatewaySpec>;

export class Gateway extends KubeObject<NamespaceScopedMetadata, GatewayStatus, GatewaySpec> {
  static kind = "Gateway";
  static namespaced = true;
  static apiBase = "/apis/gateway.networking.k8s.io/v1/gateways";

  constructor(data: GatewayData) {
    super(data);
    autoBind(this);
  }

  getClassName(): string {
    return this.spec?.gatewayClassName || "";
  }

  getListeners(): GatewayListener[] {
    return this.spec?.listeners || [];
  }

  getListenersSummary(): string {
    const listeners = this.getListeners();

    if (!listeners.length) {
      return "<none>";
    }

    return listeners
      .map(l => `${l.port}/${l.protocol}${l.name ? ` (${l.name})` : ""}`)
      .join(", ");
  }

  getAddresses(): string[] {
    const statusAddrs = this.status?.addresses?.map(a => a.value) || [];

    if (statusAddrs.length) {
      return statusAddrs;
    }

    return this.spec?.addresses?.map(a => a.value) || [];
  }

  getConditions(): GatewayCondition[] {
    return this.status?.conditions || [];
  }

  isProgrammed(): boolean {
    return this.getConditions().some(c => c.type === "Programmed" && c.status === "True");
  }

  isAccepted(): boolean {
    return this.getConditions().some(c => c.type === "Accepted" && c.status === "True");
  }

  getStatusSummary(): string {
    if (this.isProgrammed()) {
      return "Programmed";
    }

    if (this.isAccepted()) {
      return "Accepted";
    }

    const conditions = this.getConditions();

    if (conditions.length > 0) {
      return conditions[0].reason || conditions[0].type;
    }

    return "Pending";
  }
}

export class GatewayApi extends KubeApi<Gateway, GatewayData> {
  constructor(deps: KubeApiDependencies, opts: DerivedKubeApiOptions = {}) {
    super(deps, {
      checkPreferredVersion: true,
      allowedUsableVersions: {
        "gateway.networking.k8s.io": [
          "v1",
          "v1beta1",
          "v1alpha2",
        ],
      },
      fallbackApiBases: [
        "/apis/gateway.networking.k8s.io/v1beta1/gateways",
        "/apis/gateway.networking.k8s.io/v1alpha2/gateways",
      ],
      ...opts,
      objectConstructor: Gateway,
    });
  }
}

export interface GatewayClassSpec {
  controllerName: string;
  description?: string;
}

export interface GatewayClassStatus {
  conditions?: GatewayCondition[];
}

export type GatewayClassData = KubeJsonApiData<KubeObjectMetadata<KubeObjectScope.Cluster>, GatewayClassStatus, GatewayClassSpec>;

export class GatewayClass extends KubeObject<ClusterScopedMetadata, GatewayClassStatus, GatewayClassSpec> {
  static kind = "GatewayClass";
  static namespaced = false;
  static apiBase = "/apis/gateway.networking.k8s.io/v1/gatewayclasses";

  constructor(data: GatewayClassData) {
    super(data);
    autoBind(this);
  }

  getControllerName(): string {
    return this.spec?.controllerName || "";
  }

  getDescription(): string {
    return this.spec?.description || "";
  }

  isAccepted(): boolean {
    return (this.status?.conditions || []).some(c => c.type === "Accepted" && c.status === "True");
  }
}

export class GatewayClassApi extends KubeApi<GatewayClass, GatewayClassData> {
  constructor(deps: KubeApiDependencies, opts: DerivedKubeApiOptions = {}) {
    super(deps, {
      checkPreferredVersion: true,
      allowedUsableVersions: {
        "gateway.networking.k8s.io": [
          "v1",
          "v1beta1",
          "v1alpha2",
        ],
      },
      fallbackApiBases: [
        "/apis/gateway.networking.k8s.io/v1beta1/gatewayclasses",
        "/apis/gateway.networking.k8s.io/v1alpha2/gatewayclasses",
      ],
      ...opts,
      objectConstructor: GatewayClass,
    });
  }
}

export interface HTTPRouteParentRef {
  group?: string;
  kind?: string;
  namespace?: string;
  name: string;
  sectionName?: string;
  port?: number;
}

export interface HTTPRouteMatch {
  path?: {
    type?: "Exact" | "PathPrefix" | "RegularExpression";
    value?: string;
  };
  headers?: Array<{
    type?: "Exact" | "RegularExpression";
    name: string;
    value: string;
  }>;
  method?: string;
}

export interface HTTPRouteBackendRef {
  group?: string;
  kind?: string;
  namespace?: string;
  name: string;
  port?: number;
  weight?: number;
}

export interface HTTPRouteRule {
  matches?: HTTPRouteMatch[];
  backendRefs?: HTTPRouteBackendRef[];
}

export interface HTTPRouteSpec {
  parentRefs?: HTTPRouteParentRef[];
  hostnames?: string[];
  rules?: HTTPRouteRule[];
}

export interface HTTPRouteParentStatus {
  parentRef: HTTPRouteParentRef;
  controllerName?: string;
  conditions?: GatewayCondition[];
}

export interface HTTPRouteStatus {
  parents?: HTTPRouteParentStatus[];
}

export type HTTPRouteData = KubeJsonApiData<KubeObjectMetadata<KubeObjectScope.Namespace>, HTTPRouteStatus, HTTPRouteSpec>;

export class HTTPRoute extends KubeObject<NamespaceScopedMetadata, HTTPRouteStatus, HTTPRouteSpec> {
  static kind = "HTTPRoute";
  static namespaced = true;
  static apiBase = "/apis/gateway.networking.k8s.io/v1/httproutes";

  constructor(data: HTTPRouteData) {
    super(data);
    autoBind(this);
  }

  getParentRefs(): HTTPRouteParentRef[] {
    return this.spec?.parentRefs || [];
  }

  getParentGateways(): string[] {
    return this.getParentRefs().map(p => (p.namespace ? `${p.namespace}/${p.name}` : p.name));
  }

  getHostnames(): string[] {
    return this.spec?.hostnames || [];
  }

  getRules(): HTTPRouteRule[] {
    return this.spec?.rules || [];
  }

  getRoutesSummary(): string {
    const rules = this.getRules();
    const paths = rules
      .flatMap(r => r.matches || [])
      .map(m => m.path?.value ? `${m.path.value} (${m.path.type || "Prefix"})` : "")
      .filter(Boolean);

    if (paths.length) {
      return paths.slice(0, 3).join(", ") + (paths.length > 3 ? ` (+${paths.length - 3} more)` : "");
    }

    return "/ (Default)";
  }

  getBackendServices(): string[] {
    const rules = this.getRules();
    const backends = rules
      .flatMap(r => r.backendRefs || [])
      .map(b => `${b.name}${b.port ? `:${b.port}` : ""}`);

    return Array.from(new Set(backends));
  }
}

export class HTTPRouteApi extends KubeApi<HTTPRoute, HTTPRouteData> {
  constructor(deps: KubeApiDependencies, opts: DerivedKubeApiOptions = {}) {
    super(deps, {
      checkPreferredVersion: true,
      allowedUsableVersions: {
        "gateway.networking.k8s.io": [
          "v1",
          "v1beta1",
          "v1alpha2",
        ],
      },
      fallbackApiBases: [
        "/apis/gateway.networking.k8s.io/v1beta1/httproutes",
        "/apis/gateway.networking.k8s.io/v1alpha2/httproutes",
      ],
      ...opts,
      objectConstructor: HTTPRoute,
    });
  }
}
