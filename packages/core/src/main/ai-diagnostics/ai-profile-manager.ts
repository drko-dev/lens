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

    // SSRF Validation
    const validatedEndpoint = validateAiEndpoint(endpointToValidate);

    // Store encrypted credential in vault, receiving opaque reference
    const credentialRef = await this.vault.storeCredential(input.apiKey);

    const id = `profile-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

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
      createdAt: now,
      updatedAt: now,
    };

    const db = this.sqlite.getDb();
    const stmt = db.prepare(`
      INSERT INTO ai_profiles (
        id, name, provider, model, endpoint, credential_ref, status,
        max_tokens_per_request, max_requests_per_incident,
        estimated_cost_per_1k_tokens, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      validatedEndpoint = validateAiEndpoint(input.endpoint);
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
      updatedAt: new Date().toISOString(),
    };

    const db = this.sqlite.getDb();
    const stmt = db.prepare(`
      UPDATE ai_profiles SET
        name = ?, model = ?, endpoint = ?, status = ?,
        max_tokens_per_request = ?, max_requests_per_incident = ?,
        estimated_cost_per_1k_tokens = ?, updated_at = ?
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

  private mapRowToProfile(row: any): AiProviderProfile {
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
