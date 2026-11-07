/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";
import type { SqliteClient } from "../incident-storage/sqlite-client";
import type { SecureCredentialVault } from "./secure-credential-vault";
import {
  DEFAULT_PROVIDER_ENDPOINTS,
  validateAiEndpoint,
  type AiProviderProfile,
  type CreateAiProfileInput,
  type UpdateAiProfileInput,
} from "../../common/incident/ai-profile-types";

export class AiProfileManager {
  constructor(
    private readonly sqlite: SqliteClient,
    private readonly vault: SecureCredentialVault,
  ) {}

  public async createProfile(input: CreateAiProfileInput): Promise<AiProviderProfile> {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error("Profile name is required.");
    }

    if (!input.model || input.model.trim().length === 0) {
      throw new Error("Model identifier is required.");
    }

    if (!input.apiKey || input.apiKey.trim().length === 0) {
      throw new Error("API key is required for provider authentication.");
    }

    const endpointToValidate = input.endpoint || DEFAULT_PROVIDER_ENDPOINTS[input.provider];

    if (!endpointToValidate) {
      throw new Error(`No default endpoint configured for provider '${input.provider}'.`);
    }

    // SSRF Validation (and provider-specific endpoint invariant such as DeepSeek)
    const validatedEndpoint = validateAiEndpoint(endpointToValidate, input.provider);

    // Store encrypted credential in vault, receiving opaque reference
    const credentialRef = await this.vault.storeCredential(input.apiKey);

    const id = `profile-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const defaultAuthMode =
      input.authMode ??
      (input.provider === "mock" ? "synthetic" : "api_key");
    const defaultAvailability = input.availabilityStatus ?? "available";

    const profile: AiProviderProfile = {
      id,
      name: input.name.trim(),
      provider: input.provider,
      model: input.model.trim(),
      endpoint: validatedEndpoint,
      credentialRef,
      status: "active",
      maxTokensPerRequest: input.maxTokensPerRequest ?? 4096,
      maxRequestsPerIncident: input.maxRequestsPerIncident ?? 10,
      estimatedCostPer1kTokens: input.estimatedCostPer1kTokens ?? 0.0,
      authMode: defaultAuthMode,
      oauthSubject: input.oauthSubject,
      oauthClientId: input.oauthClientId,
      oauthScopes: input.oauthScopes,
      oauthExpiresAt: input.oauthExpiresAt,
      availabilityStatus: defaultAvailability,
      unavailableReason: input.unavailableReason,
      createdAt: now,
      updatedAt: now,
    };

    const db = this.sqlite.getDb();
    const stmt = db.prepare(`
      INSERT INTO ai_profiles (
        id, name, provider, model, endpoint, credential_ref, status,
        max_tokens_per_request, max_requests_per_incident,
        estimated_cost_per_1k_tokens, auth_mode, oauth_subject,
        oauth_client_id, oauth_scopes, oauth_expires_at,
        availability_status, unavailable_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      profile.id,
      profile.name,
      profile.provider,
      profile.model,
      profile.endpoint,
      profile.credentialRef,
      profile.status,
      profile.maxTokensPerRequest,
      profile.maxRequestsPerIncident,
      profile.estimatedCostPer1kTokens,
      profile.authMode ?? "api_key",
      profile.oauthSubject ?? null,
      profile.oauthClientId ?? null,
      profile.oauthScopes ? JSON.stringify(profile.oauthScopes) : null,
      profile.oauthExpiresAt ?? null,
      profile.availabilityStatus ?? "available",
      profile.unavailableReason ?? null,
      profile.createdAt,
      profile.updatedAt,
    );

    return profile;
  }

  public async updateProfile(id: string, input: UpdateAiProfileInput): Promise<AiProviderProfile> {
    const existing = await this.getProfile(id);

    if (!existing) {
      throw new Error(`AI Profile '${id}' not found.`);
    }

    let validatedEndpoint = existing.endpoint;

    if (input.endpoint && input.endpoint !== existing.endpoint) {
      validatedEndpoint = validateAiEndpoint(input.endpoint, existing.provider);
    }

    const updated: AiProviderProfile = {
      ...existing,
      name: input.name?.trim() ?? existing.name,
      model: input.model?.trim() ?? existing.model,
      endpoint: validatedEndpoint,
      status: input.status ?? existing.status,
      maxTokensPerRequest: input.maxTokensPerRequest ?? existing.maxTokensPerRequest,
      maxRequestsPerIncident: input.maxRequestsPerIncident ?? existing.maxRequestsPerIncident,
      estimatedCostPer1kTokens: input.estimatedCostPer1kTokens ?? existing.estimatedCostPer1kTokens,
      authMode: input.authMode ?? existing.authMode,
      oauthSubject: input.oauthSubject === null ? undefined : (input.oauthSubject ?? existing.oauthSubject),
      oauthClientId: input.oauthClientId === null ? undefined : (input.oauthClientId ?? existing.oauthClientId),
      oauthScopes: input.oauthScopes === null ? undefined : (input.oauthScopes ?? existing.oauthScopes),
      oauthExpiresAt: input.oauthExpiresAt === null ? undefined : (input.oauthExpiresAt ?? existing.oauthExpiresAt),
      availabilityStatus: input.availabilityStatus ?? existing.availabilityStatus,
      unavailableReason: input.unavailableReason === null ? undefined : (input.unavailableReason ?? existing.unavailableReason),
      updatedAt: new Date().toISOString(),
    };

    const db = this.sqlite.getDb();
    const stmt = db.prepare(`
      UPDATE ai_profiles SET
        name = ?, model = ?, endpoint = ?, status = ?,
        max_tokens_per_request = ?, max_requests_per_incident = ?,
        estimated_cost_per_1k_tokens = ?, auth_mode = ?,
        oauth_subject = ?, oauth_client_id = ?, oauth_scopes = ?,
        oauth_expires_at = ?, availability_status = ?,
        unavailable_reason = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.name,
      updated.model,
      updated.endpoint,
      updated.status,
      updated.maxTokensPerRequest,
      updated.maxRequestsPerIncident,
      updated.estimatedCostPer1kTokens,
      updated.authMode ?? "api_key",
      updated.oauthSubject ?? null,
      updated.oauthClientId ?? null,
      updated.oauthScopes ? JSON.stringify(updated.oauthScopes) : null,
      updated.oauthExpiresAt ?? null,
      updated.availabilityStatus ?? "available",
      updated.unavailableReason ?? null,
      updated.updatedAt,
      id,
    );

    return updated;
  }

  public async rotateCredential(id: string, newApiKey: string): Promise<void> {
    const profile = await this.getProfile(id);

    if (!profile) {
      throw new Error(`AI Profile '${id}' not found.`);
    }

    if (!newApiKey || newApiKey.trim().length === 0) {
      throw new Error("New API key must be non-empty.");
    }

    await this.vault.rotateCredential(profile.credentialRef, newApiKey);

    const db = this.sqlite.getDb();
    db.prepare("UPDATE ai_profiles SET updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      id,
    );
  }

  public async deleteProfile(id: string): Promise<void> {
    const profile = await this.getProfile(id);

    if (!profile) {
      return;
    }

    // Delete encrypted secret from vault
    await this.vault.deleteCredential(profile.credentialRef);

    // Delete profile from SQLite
    const db = this.sqlite.getDb();
    db.prepare("DELETE FROM ai_profiles WHERE id = ?").run(id);
  }

  public async getProfile(id: string): Promise<AiProviderProfile | undefined> {
    const db = this.sqlite.getDb();
    const row = db.prepare("SELECT * FROM ai_profiles WHERE id = ?").get(id) as any;

    if (!row) {
      return undefined;
    }

    return this.mapRowToProfile(row);
  }

  public async listProfiles(): Promise<AiProviderProfile[]> {
    const db = this.sqlite.getDb();
    const rows = db.prepare("SELECT * FROM ai_profiles ORDER BY name ASC").all() as any[];

    return rows.map(r => this.mapRowToProfile(r));
  }

  public async getApiKeyForProfile(id: string): Promise<string> {
    const profile = await this.getProfile(id);

    if (!profile) {
      throw new Error(`AI Profile '${id}' not found.`);
    }

    if (profile.status !== "active") {
      throw new Error(`AI Profile '${profile.name}' is '${profile.status}' and cannot be used for inference.`);
    }

    return this.vault.getCredential(profile.credentialRef);
  }

  public async storeOrRotateCredential(id: string, newSecret: string): Promise<string> {
    const profile = await this.getProfile(id);

    if (!profile) {
      throw new Error(`AI Profile '${id}' not found.`);
    }

    if (!newSecret || newSecret.trim().length === 0) {
      throw new Error("Credential secret must be non-empty.");
    }

    const db = this.sqlite.getDb();
    const now = new Date().toISOString();

    if (this.vault.hasCredential(profile.credentialRef)) {
      await this.vault.rotateCredential(profile.credentialRef, newSecret);
      db.prepare("UPDATE ai_profiles SET updated_at = ? WHERE id = ?").run(now, id);
      return profile.credentialRef;
    }

    const newRef = await this.vault.storeCredential(newSecret);
    db.prepare("UPDATE ai_profiles SET credential_ref = ?, updated_at = ? WHERE id = ?").run(
      newRef,
      now,
      id,
    );

    return newRef;
  }

  public async purgeProfileCredential(id: string): Promise<void> {
    const profile = await this.getProfile(id);

    if (!profile) {
      return;
    }

    await this.vault.deleteCredential(profile.credentialRef);
  }

  public hasVaultCredential(credentialRef: string): boolean {
    return this.vault.hasCredential(credentialRef);
  }

  /**
   * Safely reads the raw encrypted credential for a profile regardless of profile status,
   * used strictly for OAuth reauthorization hints and transactional rollback compensation.
   */
  public async tryGetRawCredential(id: string): Promise<string | undefined> {
    const profile = await this.getProfile(id);
    if (!profile || !this.vault.hasCredential(profile.credentialRef)) {
      return undefined;
    }

    try {
      return await this.vault.getCredential(profile.credentialRef);
    } catch {
      return undefined;
    }
  }

  /**
   * Restores a profile's SQLite metadata and vault credential to an exact pre-mutation snapshot.
   * Used when an OAuth flow is cancelled, expires, or fails after credential storage has started.
   */
  public async restoreProfileSnapshot(
    snapshot: AiProviderProfile,
    previousRawCredential?: string,
  ): Promise<AiProviderProfile> {
    const current = await this.getProfile(snapshot.id);
    if (!current) {
      return snapshot;
    }

    let restoredCredentialRef = snapshot.credentialRef;
    if (previousRawCredential !== undefined) {
      if (this.vault.hasCredential(current.credentialRef)) {
        await this.vault.rotateCredential(current.credentialRef, previousRawCredential);
        restoredCredentialRef = current.credentialRef;
      } else {
        restoredCredentialRef = await this.vault.storeCredential(previousRawCredential);
      }
    } else if (this.vault.hasCredential(current.credentialRef)) {
      await this.vault.deleteCredential(current.credentialRef);
    }

    const db = this.sqlite.getDb();
    db.prepare(`
      UPDATE ai_profiles SET
        name = ?, model = ?, endpoint = ?, credential_ref = ?, status = ?,
        max_tokens_per_request = ?, max_requests_per_incident = ?,
        estimated_cost_per_1k_tokens = ?, auth_mode = ?,
        oauth_subject = ?, oauth_client_id = ?, oauth_scopes = ?,
        oauth_expires_at = ?, availability_status = ?,
        unavailable_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(
      snapshot.name,
      snapshot.model,
      snapshot.endpoint,
      restoredCredentialRef,
      snapshot.status,
      snapshot.maxTokensPerRequest,
      snapshot.maxRequestsPerIncident,
      snapshot.estimatedCostPer1kTokens ?? 0.0,
      snapshot.authMode ?? "api_key",
      snapshot.oauthSubject ?? null,
      snapshot.oauthClientId ?? null,
      snapshot.oauthScopes ? JSON.stringify(snapshot.oauthScopes) : null,
      snapshot.oauthExpiresAt ?? null,
      snapshot.availabilityStatus ?? "available",
      snapshot.unavailableReason ?? null,
      snapshot.updatedAt,
      snapshot.id,
    );

    return {
      ...snapshot,
      credentialRef: restoredCredentialRef,
    };
  }

  /**
   * Returns a stable per-installation `ext_agent_host_id` (`urn:uuid:<uuid-v4>`)
   * persisted in SQLite (`ai_oauth_installations`) for OpenAI SIWC dynamic registration.
   */
  public getOrCreateInstallationHostId(installationKey = "default"): string {
    const db = this.sqlite.getDb();
    const row = db
      .prepare("SELECT ext_agent_host_id FROM ai_oauth_installations WHERE installation_key = ?")
      .get(installationKey) as { ext_agent_host_id: string } | undefined;

    if (row?.ext_agent_host_id) {
      return row.ext_agent_host_id;
    }

    const hostId = `urn:uuid:${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO ai_oauth_installations (
        installation_key, ext_agent_host_id, dynamic_client_id, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?)
    `).run(installationKey, hostId, now, now);

    return hostId;
  }

  public getDynamicClientId(installationKey = "default"): string | undefined {
    const db = this.sqlite.getDb();
    const row = db
      .prepare("SELECT dynamic_client_id FROM ai_oauth_installations WHERE installation_key = ?")
      .get(installationKey) as { dynamic_client_id: string | null } | undefined;

    return row?.dynamic_client_id ?? undefined;
  }

  public setDynamicClientId(clientId: string, installationKey = "default"): void {
    this.getOrCreateInstallationHostId(installationKey);
    const db = this.sqlite.getDb();
    db.prepare(`
      UPDATE ai_oauth_installations
      SET dynamic_client_id = ?, updated_at = ?
      WHERE installation_key = ?
    `).run(clientId, new Date().toISOString(), installationKey);
  }

  private mapRowToProfile(row: any): AiProviderProfile {
    let parsedScopes: string[] | undefined;

    if (typeof row.oauth_scopes === "string" && row.oauth_scopes.trim().length > 0) {
      try {
        const parsed = JSON.parse(row.oauth_scopes);
        if (Array.isArray(parsed)) {
          parsedScopes = parsed.filter((s): s is string => typeof s === "string");
        }
      } catch {
        parsedScopes = undefined;
      }
    }

    return {
      id: row.id,
      name: row.name,
      provider: row.provider,
      model: row.model,
      endpoint: row.endpoint,
      credentialRef: row.credential_ref,
      status: row.status,
      maxTokensPerRequest: row.max_tokens_per_request,
      maxRequestsPerIncident: row.max_requests_per_incident,
      estimatedCostPer1kTokens: row.estimated_cost_per_1k_tokens,
      authMode: row.auth_mode ?? (row.provider === "mock" ? "synthetic" : "api_key"),
      oauthSubject: row.oauth_subject ?? undefined,
      oauthClientId: row.oauth_client_id ?? undefined,
      oauthScopes: parsedScopes,
      oauthExpiresAt: typeof row.oauth_expires_at === "number" ? row.oauth_expires_at : undefined,
      availabilityStatus: row.availability_status ?? "available",
      unavailableReason: row.unavailable_reason ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
