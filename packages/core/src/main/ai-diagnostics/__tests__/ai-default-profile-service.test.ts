/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { SqliteClient } from "../../incident-storage/sqlite-client";
import { ALL_MIGRATIONS } from "../../incident-storage/migrations";
import { SecureCredentialVault } from "../secure-credential-vault";
import { AiProfileManager } from "../ai-profile-manager";
import { AiDefaultProfileService } from "../ai-default-profile-service";
import { AiDiagnosisSecurityError } from "../ai-diagnosis-errors";

describe("AiDefaultProfileService", () => {
  let dir: string;
  let dbPath: string;
  let sqlite: SqliteClient;
  let manager: AiProfileManager;
  let networkEnabled: boolean;
  let revoke: jest.Mock;
  let service: AiDefaultProfileService;

  const open = (): void => {
    sqlite = new SqliteClient({ dbPath, migrations: ALL_MIGRATIONS });
    sqlite.init();
    manager = new AiProfileManager(sqlite, new SecureCredentialVault());
    service = new AiDefaultProfileService(
      sqlite,
      manager,
      { isExternalNetworkEnabled: () => networkEnabled },
      { revokeConsentsForProfile: revoke },
    );
  };

  const mk = (provider: "openai" | "deepseek" | "mock" | "anthropic", extra: Record<string, unknown> = {}) =>
    manager.createProfile({
      name: `p-${provider}`,
      provider,
      model: provider === "deepseek" ? "deepseek-flash" : "m-1",
      apiKey: "sk-test-secret-123456",
      ...extra,
    } as any);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-default-"));
    dbPath = path.join(dir, "t.db");
    networkEnabled = false;
    revoke = jest.fn();
    open();
  });

  afterEach(() => {
    sqlite.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("is not_configured by default and resolve fails closed", async () => {
    expect((await service.getStatus()).state).toBe("not_configured");
    await expect(service.resolveUsableDefaultId()).rejects.toBeInstanceOf(AiDiagnosisSecurityError);
  });

  it("derives blocked / available / disconnected for external providers", async () => {
    const p = await mk("openai");

    expect((await service.setDefault(p.id)).state).toBe("blocked");
    networkEnabled = true;
    expect((await service.getStatus()).state).toBe("available");
    await expect(service.resolveUsableDefaultId()).resolves.toBe(p.id);
    await manager.updateProfile(p.id, { availabilityStatus: "expired" } as any);
    expect((await service.getStatus()).state).toBe("disconnected");
    await expect(service.resolveUsableDefaultId()).rejects.toBeInstanceOf(AiDiagnosisSecurityError);
  });

  it("ensureDemoProfile creates a mock default without user key and reuses it", async () => {
    const s1 = await service.ensureDemoProfile();
    const s2 = await service.ensureDemoProfile();

    expect(s1.state).toBe("demo_offline");
    expect(s2.profile?.id).toBe(s1.profile?.id);
    expect((await manager.listProfiles()).filter((x) => x.provider === "mock")).toHaveLength(1);
  });

  it("rejects missing, disabled and ineligible profiles in setDefault", async () => {
    const a = await mk("anthropic");
    const d = await mk("openai");

    await manager.updateProfile(d.id, { status: "disabled" });

    await expect(service.setDefault("nope")).rejects.toThrow();
    await expect(service.setDefault(a.id)).rejects.toThrow(/not eligible/);
    await expect(service.setDefault(d.id)).rejects.toThrow(/active/);
    expect((await service.getStatus()).state).toBe("not_configured");
  });

  it("changing default revokes old consents; clearing returns not_configured", async () => {
    const a = await mk("openai");
    const b = await mk("deepseek");

    await service.setDefault(a.id);
    await service.setDefault(b.id);
    expect(revoke).toHaveBeenCalledWith(a.id);
    await service.setDefault(null);
    expect(revoke).toHaveBeenCalledWith(b.id);
    expect((await service.getStatus()).state).toBe("not_configured");
  });

  it("deleted or revoked default => configuration_required, never another profile", async () => {
    const a = await mk("openai");
    const other = await mk("deepseek");

    networkEnabled = true;
    await service.setDefault(a.id);
    await manager.deleteProfile(a.id);

    const status = await service.getStatus();

    expect(status.state).toBe("configuration_required");
    expect(status.profile).toBeUndefined();
    await expect(service.resolveUsableDefaultId()).rejects.toBeInstanceOf(AiDiagnosisSecurityError);
    expect(other.id).not.toBe(a.id);
  });

  it("persists the default across a new SqliteClient on the same file", async () => {
    const d = await service.ensureDemoProfile();

    sqlite.close();
    sqlite = new SqliteClient({ dbPath, migrations: ALL_MIGRATIONS });
    sqlite.init();
    const row = sqlite.getDb().prepare("SELECT default_profile_id FROM ai_settings WHERE id='default'").get() as any;

    expect(row.default_profile_id).toBe(d.profile?.id);
  });

  it("status DTO never exposes secrets", async () => {
    const p = await mk("openai", { authMode: "oauth_siwc", oauthSubject: "subj-xyz" });

    networkEnabled = true;
    const json = JSON.stringify(await service.setDefault(p.id));

    expect(json).not.toMatch(/credentialRef|apiKey|oauthSubject|sk-test-secret|subj-xyz/);
  });
});
