/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

export interface MigrationDefinition {
  version: number;
  name: string;
  sql: string;
}

export interface SqliteClientOptions {
  dbPath: string;
  synchronous?: "NORMAL" | "FULL";
  busyTimeout?: number;
  logger?: (message: string) => void;
  migrations?: MigrationDefinition[];
}

export interface CorruptionReport {
  timestamp: number;
  originalDbPath: string;
  backupDbPath: string;
  backupWalPath?: string;
  backupShmPath?: string;
  reason: string;
}

export class SqliteClient {
  private db: Database.Database | null = null;
  private readonly dbPath: string;
  private readonly synchronous: "NORMAL" | "FULL";
  private readonly busyTimeout: number;
  private readonly logger: (message: string) => void;
  private readonly migrations: MigrationDefinition[];
  private lastCorruptionReport: CorruptionReport | null = null;

  constructor(options: SqliteClientOptions) {
    this.dbPath = options.dbPath;
    this.synchronous = options.synchronous ?? "NORMAL";
    this.busyTimeout = options.busyTimeout ?? 5000;
    this.logger = options.logger ?? (() => {});
    this.migrations = options.migrations ?? [];
  }

  public get isConnected(): boolean {
    return this.db !== null && this.db.open;
  }

  public get corruptionReport(): CorruptionReport | null {
    return this.lastCorruptionReport;
  }

  public init(): Database.Database {
    if (this.db && this.db.open) {
      return this.db;
    }

    const isInMemory = this.dbPath === ":memory:";

    if (!isInMemory) {
      const parentDir = path.dirname(this.dbPath);

      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      this.preflightIntegrityCheck();
    }

    try {
      this.db = new Database(this.dbPath);
    } catch (openError: any) {
      if (!isInMemory) {
        this.logger(`[SqliteClient] Failed to open SQLite database: ${openError.message}. Initiating quarantine recovery.`);
        this.quarantineCorruptedFiles(openError.message);
        this.db = new Database(this.dbPath);
      } else {
        throw openError;
      }
    }

    // Configure essential pragmas
    if (!isInMemory) {
      const journalMode = this.db.pragma("journal_mode = WAL", { simple: true });

      this.logger(`[SqliteClient] SQLite journal_mode configured: ${journalMode}`);
    }

    this.db.pragma("foreign_keys = ON");
    this.db.pragma(`busy_timeout = ${this.busyTimeout}`);
    this.db.pragma(`synchronous = ${this.synchronous}`);

    this.initMigrationsTable();
    this.applyMigrations();

    return this.db;
  }

  public getDb(): Database.Database {
    if (!this.db || !this.db.open) {
      throw new Error("SqliteClient is not initialized. Call init() before accessing database.");
    }

    return this.db;
  }

  public transaction<T>(fn: () => T): T {
    const db = this.getDb();
    const runTx = db.transaction(fn);

    return runTx();
  }

  public close(): void {
    if (this.db && this.db.open) {
      this.db.close();
      this.db = null;
    }
  }

  private preflightIntegrityCheck(): void {
    if (!fs.existsSync(this.dbPath)) {
      return;
    }

    let tempDb: Database.Database | null = null;

    try {
      tempDb = new Database(this.dbPath, { readonly: true, fileMustExist: true });
      const checkResult = tempDb.pragma("integrity_check", { simple: true }) as string;

      if (checkResult !== "ok") {
        throw new Error(`Integrity check failed with status: ${checkResult}`);
      }
    } catch (error: any) {
      this.logger(`[SqliteClient] Database integrity failure on preflight: ${error.message}. Quarantining.`);
      if (tempDb && tempDb.open) {
        tempDb.close();
      }
      this.quarantineCorruptedFiles(error.message);
    } finally {
      if (tempDb && tempDb.open) {
        tempDb.close();
      }
    }
  }

  private quarantineCorruptedFiles(reason: string): void {
    const timestamp = Date.now();
    const backupDbPath = `${this.dbPath}.corrupted.${timestamp}.bak`;
    let backupWalPath: string | undefined;
    let backupShmPath: string | undefined;

    if (fs.existsSync(this.dbPath)) {
      fs.renameSync(this.dbPath, backupDbPath);
    }

    const walPath = `${this.dbPath}-wal`;

    if (fs.existsSync(walPath)) {
      backupWalPath = `${walPath}.corrupted.${timestamp}.bak`;
      fs.renameSync(walPath, backupWalPath);
    }

    const shmPath = `${this.dbPath}-shm`;

    if (fs.existsSync(shmPath)) {
      backupShmPath = `${shmPath}.corrupted.${timestamp}.bak`;
      fs.renameSync(shmPath, backupShmPath);
    }

    this.lastCorruptionReport = {
      timestamp,
      originalDbPath: this.dbPath,
      backupDbPath,
      backupWalPath,
      backupShmPath,
      reason,
    };

    this.logger(`[SqliteClient] Quarantined corrupted database to: ${backupDbPath}`);
  }

  private initMigrationsTable(): void {
    const db = this.getDb();

    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
  }

  private applyMigrations(): void {
    const db = this.getDb();
    const getAppliedStmt = db.prepare("SELECT version FROM schema_migrations WHERE version = ?");
    const recordMigrationStmt = db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)");

    const sortedMigrations = [...this.migrations].sort((a, b) => a.version - b.version);

    for (const migration of sortedMigrations) {
      const alreadyApplied = getAppliedStmt.get(migration.version);

      if (!alreadyApplied) {
        this.logger(`[SqliteClient] Applying migration ${migration.version}: ${migration.name}`);

        const runMigration = db.transaction(() => {
          db.exec(migration.sql);
          recordMigrationStmt.run(migration.version, migration.name, new Date().toISOString());
        });

        runMigration();
      }
    }
  }
}
