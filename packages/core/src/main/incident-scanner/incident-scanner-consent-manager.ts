/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";

export interface VerifiableConsentRecord {
  token: string;
  operatorUsername: string;
  clusterId: string;
  namespace?: string;
  grantedAt: number;
  expiresAt: number;
  isUsed: boolean;
}

export class IncidentScannerConsentManager {
  private readonly consents = new Map<string, VerifiableConsentRecord>();

  /**
   * Issues a cryptographically secure, verifiable consent record bound to operator, cluster, and scope.
   */
  public issueConsent(params: {
    operatorUsername: string;
    clusterId: string;
    namespace?: string;
    ttlMs?: number;
  }): VerifiableConsentRecord {
    const token = `consent-${crypto.randomUUID()}`;
    const now = Date.now();
    const record: VerifiableConsentRecord = {
      token,
      operatorUsername: params.operatorUsername,
      clusterId: params.clusterId,
      namespace: params.namespace,
      grantedAt: now,
      expiresAt: now + (params.ttlMs ?? 300_000), // Default 5 minutes TTL
      isUsed: false,
    };

    this.consents.set(token, record);
    return record;
  }

  /**
   * Verifies and single-use consumes the consent token against the requested operator and scope.
   * Fails closed if expired, consumed, or mismatched.
   */
  public verifyAndConsumeConsent(params: {
    token: string;
    operatorUsername: string;
    clusterId: string;
    namespace?: string;
  }): boolean {
    const record = this.consents.get(params.token);
    if (!record) return false;
    if (record.isUsed) return false;
    if (Date.now() > record.expiresAt) return false;
    if (record.operatorUsername !== params.operatorUsername) return false;
    if (record.clusterId !== params.clusterId) return false;
    if (record.namespace && params.namespace && record.namespace !== params.namespace) return false;

    record.isUsed = true;
    return true;
  }

  public hasValidConsent(params: {
    token: string;
    operatorUsername: string;
    clusterId: string;
    namespace?: string;
  }): boolean {
    const record = this.consents.get(params.token);
    if (!record) return false;
    if (record.isUsed) return false;
    if (Date.now() > record.expiresAt) return false;
    if (record.operatorUsername !== params.operatorUsername) return false;
    if (record.clusterId !== params.clusterId) return false;
    if (record.namespace && params.namespace && record.namespace !== params.namespace) return false;

    return true;
  }

  public revokeConsent(token: string): void {
    this.consents.delete(token);
  }

  public clearAll(): void {
    this.consents.clear();
  }
}
