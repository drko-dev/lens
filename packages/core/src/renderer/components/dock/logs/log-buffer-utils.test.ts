/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  mergeLogLines,
  trimLogBuffer,
  getLastLogTimestamp,
  stripAnsiCodes,
} from "./log-buffer-utils";

describe("log-buffer-utils (R2-03 Log Integrity)", () => {
  describe("mergeLogLines", () => {
    it("preserves lines in the same second without duplicating the overlapping prefix", () => {
      const existing = [
        "2026-10-20T00:00:01.000Z Line 1",
        "2026-10-20T00:00:02.100Z Line 2",
        "2026-10-20T00:00:02.200Z Line 3 (same second)",
      ];

      const incoming = [
        "2026-10-20T00:00:02.200Z Line 3 (same second)",
        "2026-10-20T00:00:02.500Z Line 4 (same second)",
        "2026-10-20T00:00:03.000Z Line 5",
      ];

      const { merged, newCount } = mergeLogLines(existing, incoming);

      expect(newCount).toBe(2);
      expect(merged).toEqual([
        "2026-10-20T00:00:01.000Z Line 1",
        "2026-10-20T00:00:02.100Z Line 2",
        "2026-10-20T00:00:02.200Z Line 3 (same second)",
        "2026-10-20T00:00:02.500Z Line 4 (same second)",
        "2026-10-20T00:00:03.000Z Line 5",
      ]);
    });

    it("handles multiple identical lines at the same timestamp without false deduplication", () => {
      const existing = [
        "2026-10-20T00:00:02.000Z Heartbeat",
        "2026-10-20T00:00:02.000Z Heartbeat",
      ];

      const incoming = [
        "2026-10-20T00:00:02.000Z Heartbeat",
        "2026-10-20T00:00:02.000Z Heartbeat",
        "2026-10-20T00:00:02.000Z Heartbeat", // 3rd heartbeat is new
        "2026-10-20T00:00:03.000Z Ready",
      ];

      const { merged, newCount } = mergeLogLines(existing, incoming);

      expect(newCount).toBe(2);
      expect(merged).toHaveLength(4);
      expect(merged[2]).toBe("2026-10-20T00:00:02.000Z Heartbeat");
      expect(merged[3]).toBe("2026-10-20T00:00:03.000Z Ready");
    });

    it("returns existing logs unchanged when incoming is empty or identical", () => {
      const existing = [
        "2026-10-20T00:00:01.000Z Line 1",
        "2026-10-20T00:00:02.000Z Line 2",
      ];

      const incoming = [
        "2026-10-20T00:00:01.000Z Line 1",
        "2026-10-20T00:00:02.000Z Line 2",
      ];

      const { merged, newCount } = mergeLogLines(existing, incoming);

      expect(newCount).toBe(0);
      expect(merged).toEqual(existing);
    });

    it("appends all incoming lines when there is zero overlap", () => {
      const existing = ["2026-10-20T00:00:01.000Z Line 1"];
      const incoming = ["2026-10-20T00:00:05.000Z Line 10"];

      const { merged, newCount } = mergeLogLines(existing, incoming);

      expect(newCount).toBe(1);
      expect(merged).toHaveLength(2);
    });
  });

  describe("trimLogBuffer", () => {
    it("does not trim when length is within maxLines", () => {
      const logs = ["line 1", "line 2", "line 3"];
      const { trimmed, droppedCount } = trimLogBuffer(logs, 5);

      expect(droppedCount).toBe(0);
      expect(trimmed).toEqual(logs);
    });

    it("drops older lines from the top when exceeding maxLines", () => {
      const logs = ["old 1", "old 2", "kept 1", "kept 2", "kept 3"];
      const { trimmed, droppedCount } = trimLogBuffer(logs, 3);

      expect(droppedCount).toBe(2);
      expect(trimmed).toEqual(["kept 1", "kept 2", "kept 3"]);
    });
  });

  describe("getLastLogTimestamp", () => {
    it("extracts ISO timestamp without adding +1 second", () => {
      const logs = [
        "2026-10-20T00:00:01.000Z Line 1",
        "2026-10-20T00:00:02.500Z Line 2",
      ];

      const ts = getLastLogTimestamp(logs);

      expect(ts).toBe("2026-10-20T00:00:02.500Z");
    });
  });

  describe("stripAnsiCodes", () => {
    it("strips ANSI color and style escape sequences cleanly", () => {
      const raw = "\u001b[32m[INFO]\u001b[0m \u001b[1mServer listening on :8080\u001b[0m";

      expect(stripAnsiCodes(raw)).toBe("[INFO] Server listening on :8080");
    });
  });
});
