/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";
import type { SqliteClient } from "../incident-storage/sqlite-client";

export interface SecureVaultBackend {
  isAvailable(): boolean;
  encrypt(plaintext: string): Promise<Buffer>;
  decrypt(ciphertext: Buffer): Promise<string>;
}

export class SafeStorageBackend implements SecureVaultBackend {
  constructor(private readonly electronSafeStorage?: any) {}

  public isAvailable(): boolean {
    return Boolean(
      this.electronSafeStorage &&
      typeof this.electronSafeStorage.isEncryptionAvailable === "function" &&
      this.electronSafeStorage.isEncryptionAvailable(),
    );
  }

  public async encrypt(plaintext: string): Promise<Buffer> {
    if (!this.isAvailable()) {
      throw new Error("Electron safeStorage is not available on this platform.");
    }

    return this.electronSafeStorage.encryptString(plaintext);
  }

  public async decrypt(ciphertext: Buffer): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error("Electron safeStorage is not available on this platform.");
    }

    return this.electronSafeStorage.decryptString(ciphertext);
  }
}

export class SoftwareAesGcmBackend implements SecureVaultBackend {
  private readonly masterKey: Buffer;

  constructor(masterKey?: Buffer) {
    this.masterKey = masterKey || crypto.randomBytes(32); // 256 bits
  }

  public isAvailable(): boolean {
    return true;
  }

  public async encrypt(plaintext: string): Promise<Buffer> {
    const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM
    const cipher = crypto.createCipheriv("aes-256-gcm", this.masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag(); // 128-bit auth tag

    // Envelope: [IV (12 bytes)] [AuthTag (16 bytes)] [Ciphertext]
    return Buffer.concat([iv, authTag, encrypted]);
  }

  public async decrypt(ciphertext: Buffer): Promise<string> {
    if (ciphertext.length < 28) {
      throw new Error("Corrupted or truncated ciphertext envelope.");
    }

    const iv = ciphertext.subarray(0, 12);
    const authTag = ciphertext.subarray(12, 28);
    const encrypted = ciphertext.subarray(28);

    const decipher = crypto.createDecipheriv("aes-256-gcm", this.masterKey, iv);
    decipher.setAuthTag(authTag);

    return decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");
  }
}

export interface CredentialStorage {
  get(ref: string): Promise<Buffer | null> | Buffer | null;
  set(ref: string, ciphertext: Buffer): Promise<void> | void;
  delete(ref: string): Promise<void> | void;
  has(ref: string): Promise<boolean> | boolean;
  clear(): Promise<void> | void;
}

export class SqliteCredentialStorage implements CredentialStorage {
  constructor(private readonly sqlite: SqliteClient) {}

  public get(ref: string): Buffer | null {
    const db = this.sqlite.getDb();
    const row = db.prepare("SELECT ciphertext FROM ai_vault_credentials WHERE credential_ref = ?").get(ref) as any;
    if (!row || !row.ciphertext) return null;
    return Buffer.isBuffer(row.ciphertext) ? row.ciphertext : Buffer.from(row.ciphertext);
  }

  public set(ref: string, ciphertext: Buffer): void {
    const db = this.sqlite.getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO ai_vault_credentials (credential_ref, ciphertext, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(credential_ref) DO UPDATE SET ciphertext = excluded.ciphertext, updated_at = excluded.updated_at
    `).run(ref, ciphertext, now, now);
  }

  public delete(ref: string): void {
    const db = this.sqlite.getDb();
    db.prepare("DELETE FROM ai_vault_credentials WHERE credential_ref = ?").run(ref);
  }

  public has(ref: string): boolean {
    const db = this.sqlite.getDb();
    const row = db.prepare("SELECT 1 FROM ai_vault_credentials WHERE credential_ref = ?").get(ref);
    return Boolean(row);
  }

  public clear(): void {
    const db = this.sqlite.getDb();
    db.prepare("DELETE FROM ai_vault_credentials").run();
  }
}

export class MemoryCredentialStorage implements CredentialStorage {
  private readonly map = new Map<string, Buffer>();

  public get(ref: string): Buffer | null {
    return this.map.get(ref) ?? null;
  }

  public set(ref: string, ciphertext: Buffer): void {
    this.map.set(ref, ciphertext);
  }

  public delete(ref: string): void {
    this.map.delete(ref);
  }

  public has(ref: string): boolean {
    return this.map.has(ref);
  }

  public clear(): void {
    this.map.clear();
  }
}

export interface SecureCredentialVaultOptions {
  backend?: SecureVaultBackend;
  storage?: CredentialStorage;
  sqlite?: SqliteClient;
  allowSoftwareFallbackInTests?: boolean;
}

export class SecureCredentialVault {
  private readonly backend: SecureVaultBackend;
  private readonly storage: CredentialStorage;

  constructor(options?: SecureVaultBackend | SecureCredentialVaultOptions) {
    let opts: SecureCredentialVaultOptions = {};

    if (options) {
      if (typeof (options as any).encrypt === "function") {
        opts = { backend: options as SecureVaultBackend };
      } else {
        opts = options as SecureCredentialVaultOptions;
      }
    }

    // Configure Storage
    if (opts.storage) {
      this.storage = opts.storage;
    } else if (opts.sqlite) {
      this.storage = new SqliteCredentialStorage(opts.sqlite);
    } else {
      this.storage = new MemoryCredentialStorage();
    }

    // Configure Backend (Fail-closed in production if safeStorage is unavailable)
    if (opts.backend) {
      this.backend = opts.backend;
    } else {
      let safeStorage: any;

      try {
        const electron = require("electron");
        safeStorage = electron?.safeStorage;
      } catch {
        // Outside Electron runtime
      }

      const electronBackend = new SafeStorageBackend(safeStorage);

      if (electronBackend.isAvailable()) {
        this.backend = electronBackend;
      } else {
        const isTesting =
          process.env.NODE_ENV === "test" ||
          process.env.JEST_WORKER_ID !== undefined ||
          opts.allowSoftwareFallbackInTests === true;

        if (isTesting) {
          this.backend = new SoftwareAesGcmBackend();
        } else {
          throw new Error(
            "SecureCredentialVault: OS safeStorage encryption is not available on this system. Refusing insecure plaintext or volatile software fallback in production.",
          );
        }
      }
    }
  }

  public async storeCredential(secret: string): Promise<string> {
    if (!secret || typeof secret !== "string" || secret.trim().length === 0) {
      throw new Error("Secret to store must be a non-empty string.");
    }

    const credentialRef = `cred-${crypto.randomUUID()}`;
    const encrypted = await this.backend.encrypt(secret.trim());

    await this.storage.set(credentialRef, encrypted);

    return credentialRef;
  }

  public async getCredential(credentialRef: string): Promise<string> {
    if (!credentialRef || typeof credentialRef !== "string") {
      throw new Error("Invalid credential reference.");
    }

    const encrypted = await this.storage.get(credentialRef);

    if (!encrypted) {
      throw new Error(`Credential not found for reference '${credentialRef}'.`);
    }

    return this.backend.decrypt(encrypted);
  }

  public async rotateCredential(credentialRef: string, newSecret: string): Promise<void> {
    const exists = this.hasCredential(credentialRef);
    if (!exists) {
      throw new Error(`Cannot rotate non-existent credential reference '${credentialRef}'.`);
    }

    if (!newSecret || typeof newSecret !== "string" || newSecret.trim().length === 0) {
      throw new Error("New secret must be a non-empty string.");
    }

    const encrypted = await this.backend.encrypt(newSecret.trim());
    await this.storage.set(credentialRef, encrypted);
  }

  public async deleteCredential(credentialRef: string): Promise<void> {
    await this.storage.delete(credentialRef);
  }

  public hasCredential(credentialRef: string): boolean {
    return Boolean(this.storage.has(credentialRef));
  }

  public async clearAll(): Promise<void> {
    await this.storage.clear();
  }
}
