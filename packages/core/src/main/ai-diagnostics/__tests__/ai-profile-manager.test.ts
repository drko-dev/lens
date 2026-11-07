/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SqliteClient } from "../../incident-storage/sqlite-client";
import { ALL_MIGRATIONS } from "../../incident-storage/migrations";
import { SecureCredentialVault, SoftwareAesGcmBackend } from "../secure-credential-vault";
import { AiProfileManager } from "../ai-profile-manager";
import { validateAiEndpoint, SsrfSecurityError } from "../../../common/incident/ai-profile-types";

describe("H8-014: AI Provider Profiles, Secure Vault & SSRF Defense", () => {
  let sqlite: SqliteClient;
  let vault: SecureCredentialVault;
  let manager: AiProfileManager;

  beforeEach(() => {
    sqlite = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqlite.init();

    // Use software AES-GCM backend for isolated headless unit tests
    vault = new SecureCredentialVault(new SoftwareAesGcmBackend());
    manager = new AiProfileManager(sqlite, vault);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("SSRF Defense Validation", () => {
    it("authorizes valid public HTTPS endpoints", () => {
      expect(validateAiEndpoint("https://api.openai.com/v1")).toBe("https://api.openai.com/v1");
      expect(validateAiEndpoint("https://api.anthropic.com/v1/")).toBe("https://api.anthropic.com/v1");
      expect(validateAiEndpoint("https://custom-ai.company.org:8443/v1")).toBe("https://custom-ai.company.org:8443/v1");
    });

    it("REJECTS insecure HTTP endpoints", () => {
      expect(() => validateAiEndpoint("http://api.openai.com/v1")).toThrow(SsrfSecurityError);
    });

    it("REJECTS loopback endpoints (localhost, 127.0.0.1, ::1)", () => {
      expect(() => validateAiEndpoint("https://localhost/v1")).toThrow(/Prohibited loopback/);
      expect(() => validateAiEndpoint("https://127.0.0.1:8080/v1")).toThrow(/Prohibited loopback/);
      expect(() => validateAiEndpoint("https://[::1]:8080/v1")).toThrow(/Prohibited loopback/);
    });

    it("REJECTS cloud metadata service (169.254.169.254)", () => {
      expect(() => validateAiEndpoint("https://169.254.169.254/latest/meta-data")).toThrow(SsrfSecurityError);
    });

    it("REJECTS private RFC 1918 addresses and internal domains", () => {
      expect(() => validateAiEndpoint("https://10.0.1.5:8443/v1")).toThrow(/internal network address/);
      expect(() => validateAiEndpoint("https://192.168.1.100/v1")).toThrow(/internal network address/);
      expect(() => validateAiEndpoint("https://172.18.0.2/v1")).toThrow(/internal network address/);
      expect(() => validateAiEndpoint("https://cluster.internal/v1")).toThrow(/internal network address/);
    });
  });

  describe("Profile Lifecycle & Opaque Credential Storage", () => {
    it("creates an AI profile with opaque credential reference and NEVER stores plaintext in SQLite", async () => {
      const profile = await manager.createProfile({
        name: "Production OpenAI GPT-4o",
        provider: "openai",
        model: "gpt-4o",
        apiKey: "sk-FAKE_TEST_ONLY_NOT_A_REAL_KEY_0003",
        maxTokensPerRequest: 4096,
        estimatedCostPer1kTokens: 0.005,
      });

      expect(profile.id).toBeDefined();
      expect(profile.credentialRef).toMatch(/^cred-/);
      expect(profile.status).toBe("active");

      // Verify that the SQLite table contains ONLY the opaque ref, and NOT the raw key
      const db = sqlite.getDb();
      const row = db.prepare("SELECT * FROM ai_profiles WHERE id = ?").get(profile.id) as any;

      expect(row.credential_ref).toBe(profile.credentialRef);
      expect(JSON.stringify(row)).not.toContain("sk-FAKE_TEST_ONLY_NOT_A_REAL_KEY_0003");

      // Verify that the key can be decrypted exclusively via the secure vault in Main:
      const decryptedKey = await manager.getApiKeyForProfile(profile.id);
      expect(decryptedKey).toBe("sk-FAKE_TEST_ONLY_NOT_A_REAL_KEY_0003");
    });

    it("rotates an existing profile credential without altering profile identity", async () => {
      const profile = await manager.createProfile({
        name: "Claude 3.5 Sonnet",
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        apiKey: "sk-ant-original-key-1111",
      });

      const originalRef = profile.credentialRef;

      // Rotate to new key:
      await manager.rotateCredential(profile.id, "sk-ant-rotated-key-2222");

      const refreshed = await manager.getProfile(profile.id);
      expect(refreshed?.credentialRef).toBe(originalRef);

      const decrypted = await manager.getApiKeyForProfile(profile.id);
      expect(decrypted).toBe("sk-ant-rotated-key-2222");
    });

    it("refuses key retrieval if profile is disabled or revoked", async () => {
      const profile = await manager.createProfile({
        name: "Test Disabled Model",
        provider: "mock",
        model: "synthetic-v1",
        apiKey: "test-key-mock",
      });

      // Disable profile:
      await manager.updateProfile(profile.id, { status: "disabled" });

      await expect(
        manager.getApiKeyForProfile(profile.id),
      ).rejects.toThrow(/is 'disabled' and cannot be used/);
    });

    it("deletes profile from SQLite and purges encrypted secret from vault", async () => {
      const profile = await manager.createProfile({
        name: "To Be Deleted",
        provider: "mock",
        model: "synthetic-v1",
        apiKey: "secret-to-purge",
      });

      expect(vault.hasCredential(profile.credentialRef)).toBe(true);

      await manager.deleteProfile(profile.id);

      expect(await manager.getProfile(profile.id)).toBeUndefined();
      expect(vault.hasCredential(profile.credentialRef)).toBe(false);
    });
  });
});
