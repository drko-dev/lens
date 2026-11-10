/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";
import type { SqliteClient } from "../incident-storage/sqlite-client";
import type { AiProfileManager } from "./ai-profile-manager";
import type { AiDiagnosisEngine } from "./ai-diagnosis-engine";
import { AiDiagnosisSecurityError } from "./ai-diagnosis-errors";
import type {
  AiDefaultProviderStatus,
  AiProviderProfile,
  AiProviderType,
} from "../../common/incident/ai-profile-types";

const ELIGIBLE_PROVIDERS: readonly AiProviderType[] = ["openai", "deepseek", "mock"];
const DISCONNECTED_AVAILABILITY = ["disconnected", "expired", "sin_permiso", "no_models_available"];
const DEMO_PROFILE_NAME = "Demo offline (sintético)";

export interface AiDefaultTransportLike {
  isExternalNetworkEnabled?(): boolean;
  isProviderNetworkEnabled?(provider: AiProviderType): boolean;
}

/**
 * Owns the single global default AI profile id (opaque, no secrets).
 * Backend resolves the default itself; the renderer never chooses a profile per request.
 */
export class AiDefaultProfileService {
  constructor(
    private readonly sqlite: SqliteClient,
    private readonly profileManager: AiProfileManager,
    private readonly transport: AiDefaultTransportLike,
    private readonly diagnosisEngine: Pick<AiDiagnosisEngine, "revokeConsentsForProfile">,
  ) {}

  private readDefaultId(): string | null {
    const row = this.sqlite.getDb()
      .prepare("SELECT default_profile_id FROM ai_settings WHERE id = 'default'")
      .get() as { default_profile_id: string | null } | undefined;

    return row?.default_profile_id ?? null;
  }

  private isEligible(profile: AiProviderProfile): boolean {
    return ELIGIBLE_PROVIDERS.includes(profile.provider);
  }

  public async getStatus(): Promise<AiDefaultProviderStatus> {
    const id = this.readDefaultId();

    if (!id) {
      return { state: "not_configured" };
    }

    const profile = await this.profileManager.getProfile(id);

    if (!profile || profile.status !== "active" || !this.isEligible(profile) || profile.availabilityStatus === "disabled") {
      return { state: "configuration_required", reason: "default_profile_unusable" };
    }

    const dto = {
      id: profile.id,
      name: profile.name,
      provider: profile.provider,
      model: profile.model,
      availabilityStatus: profile.availabilityStatus,
    };

    if (profile.provider === "mock") {
      return { state: "demo_offline", profile: dto };
    }

    if (profile.availabilityStatus && DISCONNECTED_AVAILABILITY.includes(profile.availabilityStatus)) {
      return { state: "disconnected", profile: dto, reason: profile.availabilityStatus };
    }

    const canReachProvider =
      this.transport.isProviderNetworkEnabled?.(profile.provider) ??
      this.transport.isExternalNetworkEnabled?.() ??
      false;
    if (!canReachProvider) {
      return { state: "blocked", profile: dto, reason: "external_network_disabled" };
    }

    return { state: "available", profile: dto };
  }

  public async setDefault(profileId: string | null): Promise<AiDefaultProviderStatus> {
    const oldId = this.readDefaultId();

    if (profileId !== null) {
      const profile = await this.profileManager.getProfile(profileId);

      if (!profile) {
        throw new Error("Profile not found.");
      }

      if (profile.status !== "active") {
        throw new Error("Profile must be active to be the default.");
      }

      if (!this.isEligible(profile)) {
        throw new Error(`Provider '${profile.provider}' is not eligible as default.`);
      }
    }

    this.sqlite.getDb()
      .prepare("UPDATE ai_settings SET default_profile_id = ?, updated_at = ? WHERE id = 'default'")
      .run(profileId, new Date().toISOString());

    if (oldId && oldId !== profileId) {
      this.diagnosisEngine.revokeConsentsForProfile(oldId);
    }

    return this.getStatus();
  }

  /** Fail-closed: returns the default id only when the state is demo_offline or available. */
  public async resolveUsableDefaultId(): Promise<string> {
    const status = await this.getStatus();

    if ((status.state !== "demo_offline" && status.state !== "available") || !status.profile) {
      throw new AiDiagnosisSecurityError(
        "PROFILE_INACTIVE",
        `Default AI provider is not usable (state: ${status.state}).`,
      );
    }

    return status.profile.id;
  }

  public async ensureDemoProfile(): Promise<AiDefaultProviderStatus> {
    const profiles = await this.profileManager.listProfiles();
    let demo = profiles.find((p) => p.provider === "mock" && p.status === "active");

    if (!demo) {
      demo = await this.profileManager.createProfile({
        name: DEMO_PROFILE_NAME,
        provider: "mock",
        model: "mock-v1",
        // Non-secret marker: the mock provider never authenticates anywhere.
        apiKey: `demo-${crypto.randomUUID()}`,
      });
    }

    return this.setDefault(demo.id);
  }
}
