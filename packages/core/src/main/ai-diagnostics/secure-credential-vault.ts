/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";

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

export class SecureCredentialVault {
  private readonly backend: SecureVaultBackend;
  private readonly store = new Map<string, Buffer>();

  constructor(backend?: SecureVaultBackend) {
    if (backend) {
      this.backend = backend;
    } else {
      // Try electron.safeStorage if available
      let safeStorage: any;

      try {
        const electron = require("electron");
        safeStorage = electron?.safeStorage;
      } catch {
        // Not in electron runtime (e.g. testing)
      }

      const electronBackend = new SafeStorageBackend(safeStorage);

      this.backend = electronBackend.isAvailable() ? electronBackend : new SoftwareAesGcmBackend();
    }
  }

  public async storeCredential(secret: string): Promise<string> {
    if (!secret || typeof secret !== "string" || secret.trim().length === 0) {
      throw new Error("Secret to store must be a non-empty string.");
    }

    const credentialRef = `cred-${crypto.randomUUID()}`;
    const encrypted = await this.backend.encrypt(secret.trim());

    this.store.set(credentialRef, encrypted);

    return credentialRef;
  }

  public async getCredential(credentialRef: string): Promise<string> {
    if (!credentialRef || typeof credentialRef !== "string") {
      throw new Error("Invalid credential reference.");
    }

    const encrypted = this.store.get(credentialRef);

    if (!encrypted) {
      throw new Error(`Credential not found for reference '${credentialRef}'.`);
    }

    return this.backend.decrypt(encrypted);
  }

  public async rotateCredential(credentialRef: string, newSecret: string): Promise<void> {
    if (!this.hasCredential(credentialRef)) {
      throw new Error(`Cannot rotate non-existent credential reference '${credentialRef}'.`);
    }

    if (!newSecret || typeof newSecret !== "string" || newSecret.trim().length === 0) {
      throw new Error("New secret must be a non-empty string.");
    }

    const encrypted = await this.backend.encrypt(newSecret.trim());
    this.store.set(credentialRef, encrypted);
  }

  public async deleteCredential(credentialRef: string): Promise<void> {
    this.store.delete(credentialRef);
  }

  public hasCredential(credentialRef: string): boolean {
    return this.store.has(credentialRef);
  }

  public clearAll(): void {
    this.store.clear();
  }
}
