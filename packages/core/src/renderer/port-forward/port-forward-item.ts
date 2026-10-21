/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */


import autoBind from "auto-bind";
import type { ItemObject } from "@openlens/list-layout";

export type ForwardedPortStatus = "Active" | "Disabled";
export interface ForwardedPort {
  kind: string;
  namespace: string;
  name: string;
  port: number;
  forwardPort: number;
  protocol?: string;
  status?: ForwardedPortStatus;
  clusterId?: string;
  environmentBadge?: string;
}

export class PortForwardItem implements ItemObject {
  kind: string;
  namespace: string;
  name: string;
  port: number;
  forwardPort: number;
  protocol: string;
  status: ForwardedPortStatus;
  clusterId?: string;
  environmentBadge?: string;

  constructor(pf: ForwardedPort) {
    this.kind = pf.kind;
    this.namespace = pf.namespace;
    this.name = pf.name;
    this.port = pf.port;
    this.forwardPort = pf.forwardPort;
    this.protocol = pf.protocol ?? "http";
    this.status = pf.status ?? "Disabled";
    this.clusterId = pf.clusterId;
    this.environmentBadge = pf.environmentBadge;

    autoBind(this);
  }

  getName() {
    return this.name;
  }

  getNs() {
    return this.namespace;
  }

  getClusterId() {
    return this.clusterId;
  }

  getId() {
    return `${this.clusterId ? `${this.clusterId}:` : ""}${this.namespace}-${this.kind}-${this.name}:${this.port}`;
  }

  getKind() {
    return this.kind;
  }

  getPort() {
    return this.port;
  }

  getForwardPort() {
    return this.forwardPort;
  }

  getProtocol() {
    return this.protocol;
  }

  getStatus() {
    return this.status;
  }

  getSearchFields() {
    return [
      this.name,
      this.namespace,
      this.kind,
      this.port,
      this.forwardPort,
      this.status,
      this.clusterId ?? "",
      this.environmentBadge ?? "",
    ];
  }
}

export function portForwardsEqual(a: ForwardedPort, b: ForwardedPort): boolean {
  if (
    a.kind !== b.kind ||
    a.name !== b.name ||
    a.namespace !== b.namespace ||
    a.port !== b.port
  ) {
    return false;
  }

  // If either port-forward has a clusterId, ensure they belong to the same cluster
  if (a.clusterId || b.clusterId) {
    return a.clusterId === b.clusterId;
  }

  return true;
}

export function isSamePortForward(target: ForwardedPort) {
  return (pf: ForwardedPort) => portForwardsEqual(pf, target);
}
