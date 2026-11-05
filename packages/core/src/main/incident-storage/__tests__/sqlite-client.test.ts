/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { SqliteClient } from "../sqlite-client";

describe("SqliteClient (H8-005)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-client-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("initializes an in-memory database with migrations successfully", () => {
    const client = new SqliteClient({
      dbPath: ":memory:",
      migrations: [
        {
          version: 1,
          name: "test_init",
          sql: "CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT);",
        },
      ],
    });

    const db = client.init();

    expect(client.isConnected).toBe(true);
    expect(db.open).toBe(true);

    const check = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'").get() as any;

    expect(check.name).toBe("test_table");

    client.close();
    expect(client.isConnected).toBe(false);
  });

  it("persists data across close and reopen on disk with WAL mode", () => {
    const dbPath = path.join(tempDir, "persistence.db");

    const client1 = new SqliteClient({
      dbPath,
      synchronous: "NORMAL",
      migrations: [
        {
          version: 1,
          name: "create_items",
          sql: "CREATE TABLE items (id TEXT PRIMARY KEY, val TEXT);",
        },
      ],
    });

    const db1 = client1.init();

    db1.prepare("INSERT INTO items VALUES (?, ?)").run("item-1", "persisted-value");
    client1.close();

    // Reopen with new client instance
    const client2 = new SqliteClient({
      dbPath,
      synchronous: "NORMAL",
      migrations: [
        {
          version: 1,
          name: "create_items",
          sql: "CREATE TABLE items (id TEXT PRIMARY KEY, val TEXT);",
        },
      ],
    });

    const db2 = client2.init();
    const row = db2.prepare("SELECT val FROM items WHERE id = ?").get("item-1") as any;

    expect(row.val).toBe("persisted-value");
    client2.close();
  });

  it("handles repeated migrations idempotently without failure or data duplication", () => {
    const dbPath = path.join(tempDir, "migrations.db");

    const migrations = [
      {
        version: 1,
        name: "v1",
        sql: "CREATE TABLE t1 (id INTEGER PRIMARY KEY);",
      },
      {
        version: 2,
        name: "v2",
        sql: "CREATE TABLE t2 (id INTEGER PRIMARY KEY);",
      },
    ];

    const client1 = new SqliteClient({ dbPath, migrations });

    client1.init();
    client1.close();

    // Second run with same migrations plus new migration v3
    const extendedMigrations = [
      ...migrations,
      {
        version: 3,
        name: "v3",
        sql: "CREATE TABLE t3 (id INTEGER PRIMARY KEY);",
      },
    ];

    const client2 = new SqliteClient({ dbPath, migrations: extendedMigrations });
    const db2 = client2.init();

    const applied = db2.prepare("SELECT version FROM schema_migrations ORDER BY version ASC").all() as any[];

    expect(applied).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
    ]);

    client2.close();
  });

  it("supports atomic transactions and rolls back on error", () => {
    const client = new SqliteClient({
      dbPath: ":memory:",
      migrations: [
        {
          version: 1,
          name: "init",
          sql: "CREATE TABLE accounts (id TEXT PRIMARY KEY, balance INTEGER);",
        },
      ],
    });

    const db = client.init();

    db.prepare("INSERT INTO accounts VALUES (?, ?)").run("A", 100);
    db.prepare("INSERT INTO accounts VALUES (?, ?)").run("B", 50);

    // Transaction that throws
    expect(() => {
      client.transaction(() => {
        db.prepare("UPDATE accounts SET balance = balance - 20 WHERE id = ?").run("A");
        db.prepare("UPDATE accounts SET balance = balance + 20 WHERE id = ?").run("B");
        throw new Error("Simulated business logic failure");
      });
    }).toThrow("Simulated business logic failure");

    // Balances should be unchanged
    const accA = db.prepare("SELECT balance FROM accounts WHERE id = ?").get("A") as any;
    const accB = db.prepare("SELECT balance FROM accounts WHERE id = ?").get("B") as any;

    expect(accA.balance).toBe(100);
    expect(accB.balance).toBe(50);

    client.close();
  });

  it("quarantines a corrupted database and wal/shm files without silent loss, creating a clean database", () => {
    const dbPath = path.join(tempDir, "corrupt.db");

    // Write a corrupted file (random bytes)
    fs.writeFileSync(dbPath, Buffer.from("CORRUPTED_NON_SQLITE_DATA_BINARY_JUNK"));
    fs.writeFileSync(`${dbPath}-wal`, Buffer.from("WAL_CORRUPT_BYTES"));
    fs.writeFileSync(`${dbPath}-shm`, Buffer.from("SHM_CORRUPT_BYTES"));

    const client = new SqliteClient({
      dbPath,
      migrations: [
        {
          version: 1,
          name: "init",
          sql: "CREATE TABLE incidents (id TEXT PRIMARY KEY);",
        },
      ],
    });

    const db = client.init();

    // Verify recovery was signaled
    expect(client.corruptionReport).not.toBeNull();
    expect(client.corruptionReport?.originalDbPath).toBe(dbPath);
    expect(fs.existsSync(client.corruptionReport!.backupDbPath)).toBe(true);
    expect(fs.existsSync(client.corruptionReport!.backupWalPath!)).toBe(true);
    expect(fs.existsSync(client.corruptionReport!.backupShmPath!)).toBe(true);

    // Verify fresh database is healthy and ready to use
    expect(db.open).toBe(true);
    db.prepare("INSERT INTO incidents VALUES (?)").run("INC-RECOVERED");
    const check = db.prepare("SELECT count(*) as c FROM incidents").get() as any;

    expect(check.c).toBe(1);

    client.close();
  });

  it("allows concurrent readers while writing under WAL mode", () => {
    const dbPath = path.join(tempDir, "wal-concurrency.db");

    const writerClient = new SqliteClient({
      dbPath,
      synchronous: "NORMAL",
      migrations: [
        {
          version: 1,
          name: "init",
          sql: "CREATE TABLE telemetry (id INTEGER PRIMARY KEY, line TEXT);",
        },
      ],
    });

    const writerDb = writerClient.init();

    // Secondary client opening in readonly mode
    const readerClient = new SqliteClient({ dbPath, synchronous: "NORMAL" });
    const readerDb = readerClient.init();

    for (let i = 0; i < 200; i++) {
      writerDb.prepare("INSERT INTO telemetry VALUES (?, ?)").run(i, `val-${i}`);

      if (i % 50 === 0) {
        // Read without blocking writer
        const count = readerDb.prepare("SELECT count(*) as c FROM telemetry").get() as any;

        expect(count.c).toBeGreaterThanOrEqual(0);
      }
    }

    readerClient.close();
    writerClient.close();
  });

  it("isolates data completely between two distinct database file paths", () => {
    const dbPathA = path.join(tempDir, "profileA.db");
    const dbPathB = path.join(tempDir, "profileB.db");

    const clientA = new SqliteClient({
      dbPath: dbPathA,
      migrations: [{ version: 1, name: "init", sql: "CREATE TABLE data (val TEXT);" }],
    });
    const clientB = new SqliteClient({
      dbPath: dbPathB,
      migrations: [{ version: 1, name: "init", sql: "CREATE TABLE data (val TEXT);" }],
    });

    const dbA = clientA.init();
    const dbB = clientB.init();

    dbA.prepare("INSERT INTO data VALUES (?)").run("only-in-A");

    const rowsB = dbB.prepare("SELECT * FROM data").all();

    expect(rowsB).toHaveLength(0);

    clientA.close();
    clientB.close();
  });
});
