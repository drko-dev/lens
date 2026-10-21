/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { Logger } from "@openlens/logger";
import fs from "fs";
import path from "path";

export interface WorkspaceSessionStorageAdapter {
  load(): string | null;
  save(json: string): void;
  clear(): void;
}

/**
 * File-backed storage adapter using atomic rename write semantics and 0o600 file permissions.
 */
export class FileWorkspaceSessionStorageAdapter implements WorkspaceSessionStorageAdapter {
  constructor(
    private readonly filePath: string,
    private readonly logger: Logger,
  ) {}

  public load(): string | null {
    try {
      if (fs.existsSync(this.filePath)) {
        return fs.readFileSync(this.filePath, "utf-8");
      }
    } catch (err: any) {
      this.logger.warn(`[WORKSPACE-STORAGE]: Failed to read session storage at "${this.filePath}": ${err?.message}`);
    }

    return null;
  }

  public save(json: string): void {
    try {
      const dir = path.dirname(this.filePath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }

      const tmpPath = `${this.filePath}.tmp.${Date.now()}`;

      fs.writeFileSync(tmpPath, json, { encoding: "utf-8", mode: 0o600 });
      fs.renameSync(tmpPath, this.filePath);
    } catch (err: any) {
      this.logger.error(`[WORKSPACE-STORAGE]: Failed to atomically write session storage: ${err?.message}`);
    }
  }

  public clear(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch (err: any) {
      this.logger.warn(`[WORKSPACE-STORAGE]: Failed to clear session storage: ${err?.message}`);
    }
  }
}

/**
 * In-memory storage adapter for testing and environments where disk write is prohibited.
 */
export class MemoryWorkspaceSessionStorageAdapter implements WorkspaceSessionStorageAdapter {
  private data: string | null = null;

  public load(): string | null {
    return this.data;
  }

  public save(json: string): void {
    this.data = json;
  }

  public clear(): void {
    this.data = null;
  }
}

/**
 * Browser window.localStorage storage adapter for renderer-only fallback.
 */
export class LocalStorageWorkspaceSessionStorageAdapter implements WorkspaceSessionStorageAdapter {
  constructor(private readonly key = "openlens:workspace-session-snapshot-v1") {}

  public load(): string | null {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        return window.localStorage.getItem(this.key);
      } catch {
        return null;
      }
    }

    return null;
  }

  public save(json: string): void {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem(this.key, json);
      } catch {
        // quota exceeded or storage disabled
      }
    }
  }

  public clear(): void {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.removeItem(this.key);
      } catch {
        // ignore
      }
    }
  }
}
