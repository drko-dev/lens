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

export interface HumanConsentPromptParams {
  operatorUsername: string;
  clusterId: string;
  clusterName?: string;
  namespace?: string;
}

export type HumanConsentConfirmationProvider = (
  prompt: HumanConsentPromptParams,
  parentWindow?: any,
) => Promise<boolean>;

export class IncidentScannerConsentManager {
  private readonly consents = new Map<string, VerifiableConsentRecord>();

  /**
   * Prompts the human operator for explicit confirmation via a trusted provider in Main,
   * issuing a cryptographically secure, verifiable consent record only upon positive confirmation.
   */
  public async requestHumanConsent(
    params: HumanConsentPromptParams,
    confirmationProvider?: HumanConsentConfirmationProvider,
    parentWindow?: any,
  ): Promise<VerifiableConsentRecord> {
    if (!params.operatorUsername || params.operatorUsername === "local-authorized-operator") {
      throw new Error("SecurityError: Human operator identity is missing or untrusted.");
    }

    if (!params.clusterId) {
      throw new Error("SecurityError: Target clusterId is required for consent confirmation.");
    }

    if (!confirmationProvider) {
      throw new Error("SecurityError: Independent human confirmation provider is required to grant live cluster consent.");
    }

    const isConfirmed = await confirmationProvider(params, parentWindow);
    if (!isConfirmed) {
      throw new Error("ConsentDeniedError: The human operator cancelled or rejected the live cluster connection request.");
    }

    return this.issueConsent({
      operatorUsername: params.operatorUsername,
      clusterId: params.clusterId,
      namespace: params.namespace,
    });
  }

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
   * STRICT NAMESPACE CHECK: Requires exact match including when either value is undefined.
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

    // Strict namespace equality: if one is undefined and other is defined, or values differ, DENY
    const recordNs = record.namespace !== undefined ? record.namespace : undefined;
    const targetNs = params.namespace !== undefined ? params.namespace : undefined;
    if (recordNs !== targetNs) {
      return false;
    }

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

    const recordNs = record.namespace !== undefined ? record.namespace : undefined;
    const targetNs = params.namespace !== undefined ? params.namespace : undefined;
    if (recordNs !== targetNs) {
      return false;
    }

    return true;
  }

  public revokeConsent(token: string): void {
    this.consents.delete(token);
  }

  public clearAll(): void {
    this.consents.clear();
  }
}
