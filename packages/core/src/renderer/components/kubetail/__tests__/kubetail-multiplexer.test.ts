/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import {
  parseKubeLogLine,
  hashLogEntry,
  getPodColor,
  compareLogEntries,
  mergeLogsChronologically,
  resetLogSequence,
} from "../kubetail-types";

describe("Kubetail Log Multiplexer & Types", () => {
  beforeEach(() => {
    resetLogSequence();
  });

  it("correctly parses raw Kubernetes log line with RFC3339 timestamp", () => {
    const rawLine = "2026-11-01T02:15:00.123456789Z Server listening on :8080";
    const entry = parseKubeLogLine(rawLine, "backend-api-xyz", "api", "default");

    expect(entry.podName).toBe("backend-api-xyz");
    expect(entry.containerName).toBe("api");
    expect(entry.namespace).toBe("default");
    expect(entry.timestampRaw).toBe("2026-11-01T02:15:00.123456789Z");
    expect(entry.message).toBe("Server listening on :8080");
    expect(entry.timestamp).toBe(Date.parse("2026-11-01T02:15:00.123456789Z"));
    expect(entry.id).toBe(hashLogEntry("backend-api-xyz", "api", "2026-11-01T02:15:00.123456789Z", "Server listening on :8080"));
    expect(entry.color).toBeDefined();
    expect(typeof entry.seq).toBe("number");
  });

  it("handles un-timestamped or malformed log lines gracefully", () => {
    const rawLine = "Plain message without timestamp";
    const entry = parseKubeLogLine(rawLine, "frontend-abc", "web", "prod");

    expect(entry.podName).toBe("frontend-abc");
    expect(entry.message).toBe("Plain message without timestamp");
    expect(entry.timestampRaw).toBe("");
    expect(typeof entry.timestamp).toBe("number");
  });

  it("preserves legitimate repeated un-timestamped messages with unique identifiers", () => {
    const entry1 = parseKubeLogLine("Repetitive ping message", "worker-1", "app", "default");
    const entry2 = parseKubeLogLine("Repetitive ping message", "worker-1", "app", "default");

    expect(entry1.message).toBe(entry2.message);
    expect(entry1.id).not.toBe(entry2.id); // Must have unique IDs so neither is dropped
    expect(entry1.seq).toBeLessThan(entry2.seq);
  });

  it("preserves identical messages occurring on different pods", () => {
    const rawLine = "2026-11-01T12:00:00Z Ready to serve traffic";
    const entry1 = parseKubeLogLine(rawLine, "pod-alpha", "app", "default");
    const entry2 = parseKubeLogLine(rawLine, "pod-beta", "app", "default");

    expect(entry1.id).not.toBe(entry2.id);
  });

  it("assigns consistent deterministic color to the same pod name", () => {
    const color1 = getPodColor("worker-daemon-1");
    const color2 = getPodColor("worker-daemon-1");
    const color3 = getPodColor("worker-daemon-2");

    expect(color1).toBe(color2);
    expect(color1).not.toBe(color3);
    expect(typeof color1).toBe("string");
    expect(color1.startsWith("#")).toBe(true);
  });

  it("generates unique hash identifiers preventing duplicate ingestion", () => {
    const id1 = hashLogEntry("pod-a", "container-1", "2026-11-01T00:00:00Z", "Hello");
    const id2 = hashLogEntry("pod-a", "container-1", "2026-11-01T00:00:00Z", "Hello");
    const id3 = hashLogEntry("pod-b", "container-1", "2026-11-01T00:00:00Z", "Hello");

    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
  });

  it("performs deterministic tie-breaking for equal timestamps", () => {
    const entryA = parseKubeLogLine("2026-11-01T12:00:00.000Z Msg 1", "pod-b", "app", "default", 1);
    const entryB = parseKubeLogLine("2026-11-01T12:00:00.000Z Msg 2", "pod-a", "app", "default", 2);

    // Same millisecond, pod-a sorts before pod-b
    const cmp = compareLogEntries(entryA, entryB);

    expect(cmp).toBeGreaterThan(0);

    const sorted = [entryA, entryB].sort(compareLogEntries);

    expect(sorted[0].podName).toBe("pod-a");
    expect(sorted[1].podName).toBe("pod-b");
  });

  it("respects sub-millisecond nanosecond ordering from RFC3339 timestamps", () => {
    // Both parse to the same millisecond timestamp in JS Date, but raw strings have nanosecond difference
    const entry1 = parseKubeLogLine("2026-11-01T12:00:00.123400000Z Nano 1", "pod-1", "app", "default", 1);
    const entry2 = parseKubeLogLine("2026-11-01T12:00:00.123800000Z Nano 2", "pod-1", "app", "default", 2);

    expect(entry1.timestamp).toBe(entry2.timestamp);
    expect(compareLogEntries(entry1, entry2)).toBeLessThan(0);
  });

  it("merges delayed out-of-order logs into proper chronological location", () => {
    const existing = [
      parseKubeLogLine("2026-11-01T12:00:01.000Z Event 1", "pod-1", "app", "default", 1),
      parseKubeLogLine("2026-11-01T12:00:03.000Z Event 3", "pod-1", "app", "default", 3),
      parseKubeLogLine("2026-11-01T12:00:05.000Z Event 5", "pod-1", "app", "default", 5),
    ];

    const delayed = [
      parseKubeLogLine("2026-11-01T12:00:02.000Z Event 2 (delayed)", "pod-2", "app", "default", 2),
      parseKubeLogLine("2026-11-01T12:00:04.000Z Event 4 (delayed)", "pod-2", "app", "default", 4),
    ];

    mergeLogsChronologically(existing, delayed, 100);

    expect(existing).toHaveLength(5);
    expect(existing[0].message).toBe("Event 1");
    expect(existing[1].message).toBe("Event 2 (delayed)");
    expect(existing[2].message).toBe("Event 3");
    expect(existing[3].message).toBe("Event 4 (delayed)");
    expect(existing[4].message).toBe("Event 5");
  });

  it("enforces maxLines capacity limit and discards oldest records", () => {
    const existing = [
      parseKubeLogLine("2026-11-01T12:00:01.000Z Event 1", "pod-1", "app", "default", 1),
      parseKubeLogLine("2026-11-01T12:00:02.000Z Event 2", "pod-1", "app", "default", 2),
    ];

    const incoming = [
      parseKubeLogLine("2026-11-01T12:00:03.000Z Event 3", "pod-1", "app", "default", 3),
      parseKubeLogLine("2026-11-01T12:00:04.000Z Event 4", "pod-1", "app", "default", 4),
    ];

    mergeLogsChronologically(existing, incoming, 3);

    expect(existing).toHaveLength(3);
    // Oldest Event 1 should be truncated
    expect(existing[0].message).toBe("Event 2");
    expect(existing[1].message).toBe("Event 3");
    expect(existing[2].message).toBe("Event 4");
  });
});
