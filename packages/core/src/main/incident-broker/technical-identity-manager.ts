/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  DEFAULT_TECHNICAL_AUDIENCE,
  DEFAULT_TECHNICAL_SA_NAME,
  DEFAULT_TECHNICAL_SA_NAMESPACE,
  MAX_TOKEN_TTL_SECONDS,
  type AgentTechnicalIdentity,
} from "../../common/incident/broker-types";

export interface TokenRequestParams {
  clusterId: string;
  namespace?: string;
  serviceAccountName?: string;
  audience?: string;
  ttlSeconds?: number;
}

export type TokenRequestExecutor = (params: {
  clusterId: string;
  namespace: string;
  serviceAccountName: string;
  audience: string;
  ttlSeconds: number;
}) => Promise<{ token: string; expirationTimestamp: string | number }>;

export class KubernetesTechnicalIdentityManager {
  // Tokens are strictly stored in memory (RAM) within Electron Main.
  // Never written to disk, never exposed to Renderer, never transmitted to external AI providers.
  private readonly tokensByCluster = new Map<string, AgentTechnicalIdentity>();

  constructor(private readonly tokenRequestExecutor?: TokenRequestExecutor) {}

  /**
   * Requests a new bounded ServiceAccount token via Kubernetes TokenRequest API
   * and stores it in volatile memory.
   */
  public async requestTechnicalToken(params: TokenRequestParams): Promise<AgentTechnicalIdentity> {
    const {
      clusterId,
      namespace = DEFAULT_TECHNICAL_SA_NAMESPACE,
      serviceAccountName = DEFAULT_TECHNICAL_SA_NAME,
      audience = DEFAULT_TECHNICAL_AUDIENCE,
      ttlSeconds = MAX_TOKEN_TTL_SECONDS,
    } = params;

    if (!clusterId || typeof clusterId !== "string" || clusterId.trim().length === 0) {
      throw new Error("clusterId is required to request technical token.");
    }

    const boundedTtl = Math.min(Math.max(60, ttlSeconds), MAX_TOKEN_TTL_SECONDS);

    if (!this.tokenRequestExecutor) {
      throw new Error("TokenRequestExecutor not configured for KubernetesTechnicalIdentityManager.");
    }

    const response = await this.tokenRequestExecutor({
      clusterId,
      namespace,
      serviceAccountName,
      audience,
      ttlSeconds: boundedTtl,
    });

    if (!response || !response.token || typeof response.token !== "string" || response.token.trim().length === 0) {
      throw new Error("Invalid TokenRequest response from Kubernetes API.");
    }

    const now = Date.now();
    let expiresAt: number;

    if (typeof response.expirationTimestamp === "number") {
      expiresAt = response.expirationTimestamp;
    } else {
      expiresAt = new Date(response.expirationTimestamp).getTime();
    }

    if (Number.isNaN(expiresAt) || expiresAt <= now) {
      throw new Error("TokenRequest returned an already expired or invalid timestamp.");
    }

    const identity: AgentTechnicalIdentity = {
      serviceAccountName,
      serviceAccountNamespace: namespace,
      audience,
      token: response.token,
      issuedAt: now,
      expiresAt,
    };

    this.tokensByCluster.set(clusterId, identity);

    return identity;
  }

  /**
   * Retrieves active technical identity for a cluster.
   * If token is expired or not found, returns undefined and clears expired entry.
   */
  public getActiveIdentity(clusterId: string): AgentTechnicalIdentity | undefined {
    const identity = this.tokensByCluster.get(clusterId);

    if (!identity) {
      return undefined;
    }

    // Check expiration with a 5-second grace window to prevent edge TOCTOU race
    if (Date.now() >= identity.expiresAt - 5000) {
      this.tokensByCluster.delete(clusterId);

      return undefined;
    }

    return identity;
  }

  /**
   * Manually stores a pre-authenticated technical identity (e.g., from synthetic test fixture).
   * Verifies expiration before storing.
   */
  public registerTechnicalIdentity(clusterId: string, identity: AgentTechnicalIdentity): void {
    if (Date.now() >= identity.expiresAt) {
      throw new Error("Cannot register an already expired technical identity.");
    }

    this.tokensByCluster.set(clusterId, identity);
  }

  /**
   * Revokes and removes token for a given cluster from memory immediately.
   */
  public revokeToken(clusterId: string): void {
    this.tokensByCluster.delete(clusterId);
  }

  /**
   * Clears all stored tokens across all clusters immediately.
   */
  public clearAll(): void {
    this.tokensByCluster.clear();
  }
}
