/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { randomBytes } from "crypto";
import { NODE_SHELL_OPEN_OPERATION } from "../../../common/node-shell-channels";

export { NODE_SHELL_OPEN_OPERATION };

export type NodeShellOperation = typeof NODE_SHELL_OPEN_OPERATION;

export interface NodeShellAuthorizationGrant {
  /** Opaque, main-process generated identifier. It is also the terminal tab id used by the renderer. */
  grantId: string;
  clusterId: string;
  nodeName: string;
  operation: NodeShellOperation;
  /** True only when a native, main-process production confirmation approved this grant. */
  productionConfirmed: boolean;
  createdAt: number;
}

export interface NodeShellAuthorizationBinding {
  grantId: string;
  clusterId: string;
  nodeName: string;
  operation: NodeShellOperation;
  requireProductionConfirmation?: boolean;
}

export interface IssueNodeShellAuthorization {
  clusterId: string;
  nodeName: string;
  operation: NodeShellOperation;
  productionConfirmed?: boolean;
}

export interface NodeShellAuthRegistryOptions {
  ttlMs?: number;
  now?: () => number;
  generateGrantId?: () => string;
}

const DEFAULT_TTL_MS = 60_000;

const generateOpaqueGrantId = (): string => randomBytes(32).toString("base64url");

/**
 * Main-process owned store of per-operation Node Shell authorizations.
 *
 * The renderer can never register an authorization. It asks the main process for one, the main
 * process performs the trusted approval, and only then issues a grant. The grant is single-use,
 * short-lived and bound to the exact cluster, node and operation that the operator approved.
 */
export class NodeShellAuthRegistry {
  private authorizations = new Map<string, NodeShellAuthorizationGrant>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly generateGrantId: () => string;

  constructor(options: NodeShellAuthRegistryOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? (() => Date.now());
    this.generateGrantId = options.generateGrantId ?? generateOpaqueGrantId;
  }

  /** Main-only. Never exposed over IPC. */
  issue(input: IssueNodeShellAuthorization): NodeShellAuthorizationGrant {
    this.pruneExpired();

    const grant: NodeShellAuthorizationGrant = {
      grantId: this.generateGrantId(),
      clusterId: input.clusterId,
      nodeName: input.nodeName,
      operation: input.operation,
      productionConfirmed: Boolean(input.productionConfirmed),
      createdAt: this.now(),
    };

    this.authorizations.set(grant.grantId, grant);

    return grant;
  }

  /**
   * Consumes a grant exactly once. The grant is destroyed on any consumption attempt so that a
   * mismatched context cannot be retried against the same authorization.
   */
  consume(binding: NodeShellAuthorizationBinding): boolean {
    const entry = this.authorizations.get(binding.grantId);

    if (!entry) {
      return false;
    }

    this.authorizations.delete(binding.grantId);

    if (this.now() - entry.createdAt > this.ttlMs) {
      return false;
    }

    if (binding.requireProductionConfirmation && !entry.productionConfirmed) {
      return false;
    }

    return entry.clusterId === binding.clusterId
      && entry.nodeName === binding.nodeName
      && entry.operation === binding.operation;
  }

  has(grantId: string): boolean {
    const entry = this.authorizations.get(grantId);

    if (!entry) {
      return false;
    }

    if (this.now() - entry.createdAt > this.ttlMs) {
      this.authorizations.delete(grantId);

      return false;
    }

    return true;
  }

  get pendingCount(): number {
    this.pruneExpired();

    return this.authorizations.size;
  }

  clear(): void {
    this.authorizations.clear();
  }

  private pruneExpired(): void {
    const threshold = this.now() - this.ttlMs;

    for (const [grantId, entry] of this.authorizations) {
      if (entry.createdAt < threshold) {
        this.authorizations.delete(grantId);
      }
    }
  }
}
