/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { stripAnsiCodes } from "../dock/logs/log-buffer-utils";

export type StreamStatus = "CONNECTING" | "STREAMING" | "PAUSED" | "RECONNECTING" | "ERROR" | "TERMINATED";

export type WorkloadKind = "Deployment" | "StatefulSet" | "DaemonSet" | "Pod";

export interface ResourceSelection {
  kind: WorkloadKind;
  namespace: string;
  name: string;
  uid?: string;
  replicas?: number;
}

export interface KubetailPreferences {
  autoScroll: boolean;
  autoFollowNewReplicas: boolean;
  maxLines: number;
}

export interface NotFoundResource {
  kind: string;
  name: string;
  namespace: string;
}

export interface WorkloadOption {
  kind: WorkloadKind;
  namespace: string;
  name: string;
  label: string;
  replicas: number;
}

export interface KubetailLogEntry {
  id: string;
  seq: number;
  timestamp: number;
  timestampRaw: string;
  namespace: string;
  podName: string;
  containerName: string;
  message: string;
  color: string;
}

export type LogEntry = KubetailLogEntry;

export interface PodStreamInfo {
  podName: string;
  containerName: string;
  namespace: string;
  status: StreamStatus;
  error?: string;
  color: string;
  lineCount: number;
  lastSeenTimestamp?: string;
  retryCount: number;
}

const POD_COLORS = [
  "#4fc3f7", // Light Blue
  "#81c784", // Green
  "#ffb74d", // Orange
  "#ba68c8", // Purple
  "#4dd0e1", // Cyan
  "#ffd54f", // Amber
  "#f06292", // Pink
  "#aed581", // Light Green
  "#7986cb", // Indigo
  "#ff8a65", // Deep Orange
  "#4db6ac", // Teal
  "#dce775", // Lime
  "#64b5f6", // Blue
  "#80cbc4", // Teal light
  "#e57373", // Red/coral
  "#9575cd", // Deep Purple
];

export function getPodColor(podName: string): string {
  let hash = 0;

  for (let i = 0; i < podName.length; i++) {
    hash = (hash << 5) - hash + podName.charCodeAt(i);
    hash |= 0;
  }

  const index = Math.abs(hash) % POD_COLORS.length;

  return POD_COLORS[index];
}

/**
 * Creates a unique deterministic key for a log entry.
 */
export function hashLogEntry(podName: string, containerName: string, timestampRaw: string, message: string): string {
  return `${podName}|${containerName}|${timestampRaw}|${message}`;
}

/**
 * Generates a signature of a log line used strictly for reconnection overlap deduplication.
 */
export function getLineOverlapSignature(timestampRaw: string, message: string): string {
  return `${timestampRaw}|${message}`;
}

let globalSequenceCounter = 0;

export function getNextLogSequence(): number {
  return ++globalSequenceCounter;
}

export function resetLogSequence(): void {
  globalSequenceCounter = 0;
}

/**
 * Parses a raw line streamed from Kubernetes (with timestamps=true)
 */
export function parseKubeLogLine(
  rawLine: string,
  podName: string,
  containerName: string,
  namespace: string,
  explicitSeq?: number,
): KubetailLogEntry {
  const trimmed = rawLine.trimEnd();
  const match = trimmed.match(/^(\d{4}-\S+)\s(.*)$/);

  let timestampRaw = "";
  let message = trimmed;
  let timestamp = Date.now();

  if (match) {
    timestampRaw = match[1];
    message = match[2];
    const parsedTs = Date.parse(timestampRaw);

    if (!isNaN(parsedTs)) {
      timestamp = parsedTs;
    }
  }

  const seq = typeof explicitSeq === "number" ? explicitSeq : getNextLogSequence();
  const id = timestampRaw
    ? hashLogEntry(podName, containerName, timestampRaw, message)
    : `${podName}|${containerName}|no-ts|${seq}|${message}`;
  const color = getPodColor(podName);

  return {
    id,
    seq,
    timestamp,
    timestampRaw,
    namespace,
    podName,
    containerName,
    message,
    color,
  };
}

/**
 * Deterministic comparison for log entries.
 * 1. Numerical timestamp (ms)
 * 2. Raw timestamp string (nanosecond sub-millisecond precision)
 * 3. Pod name
 * 4. Container name
 * 5. Monotonic sequence counter
 */
export function compareLogEntries(a: KubetailLogEntry, b: KubetailLogEntry): number {
  if (a.timestamp !== b.timestamp) {
    return a.timestamp - b.timestamp;
  }

  if (a.timestampRaw && b.timestampRaw && a.timestampRaw !== b.timestampRaw) {
    const rawCmp = a.timestampRaw.localeCompare(b.timestampRaw);

    if (rawCmp !== 0) return rawCmp;
  }

  if (a.podName !== b.podName) {
    return a.podName.localeCompare(b.podName);
  }

  if (a.containerName !== b.containerName) {
    return a.containerName.localeCompare(b.containerName);
  }

  return a.seq - b.seq;
}

/**
 * Merges incoming log entries into an existing array preserving chronological order,
 * including delayed logs, without full O(N log N) re-sorting of the entire history.
 */
export function mergeLogsChronologically(
  existing: KubetailLogEntry[],
  incoming: KubetailLogEntry[],
  maxLines: number,
): void {
  if (incoming.length === 0) return;

  incoming.sort(compareLogEntries);

  if (existing.length === 0) {
    existing.push(...incoming.slice(-maxLines));

    return;
  }

  const lastExisting = existing[existing.length - 1];

  // Fast path: incoming batch is strictly newer or equal to the latest existing entry
  if (compareLogEntries(incoming[0], lastExisting) >= 0) {
    existing.push(...incoming);
  } else {
    // Delayed logs path: locate insertion point from the end
    let insertIdx = existing.length - 1;

    while (insertIdx > 0 && compareLogEntries(existing[insertIdx - 1], incoming[0]) > 0) {
      insertIdx--;
    }

    const tail = existing.splice(insertIdx);
    const mergedTail = [...tail, ...incoming].sort(compareLogEntries);

    existing.push(...mergedTail);
  }

  // Trim to max capacity
  if (existing.length > maxLines) {
    const excess = existing.length - maxLines;

    existing.splice(0, excess);
  }
}

/**
 * Formats log entries as clean, human-readable plain text (.txt)
 */
export function formatLogsAsText(entries: KubetailLogEntry[], clusterName?: string): string {
  const headerLines = [
    "# Kubetail Log Export",
    clusterName ? `# Cluster: ${clusterName}` : null,
    `# Total Lines: ${entries.length}`,
    `# Generated: ${new Date().toISOString()}`,
    "# ==============================================================================",
  ].filter(Boolean);

  const header = headerLines.join("\n") + "\n\n";

  const lines = entries.map(entry => {
    const ts = entry.timestampRaw || new Date(entry.timestamp).toISOString();
    const cleanMsg = stripAnsiCodes(entry.message);

    return `[${ts}] [${entry.podName}] [${entry.containerName}] ${cleanMsg}`;
  });

  return header + lines.join("\n");
}

/**
 * Formats log entries as JSON Lines (.jsonl), one valid JSON object per line
 */
export function formatLogsAsJsonl(entries: KubetailLogEntry[], clusterName?: string): string {
  return entries.map(entry => {
    const record: Record<string, any> = {
      timestamp: entry.timestampRaw || new Date(entry.timestamp).toISOString(),
      namespace: entry.namespace,
      pod: entry.podName,
      container: entry.containerName,
      message: stripAnsiCodes(entry.message),
    };

    if (clusterName) {
      record.cluster = clusterName;
    }

    return JSON.stringify(record);
  }).join("\n");
}

/**
 * Triggers browser/Electron file download from string content
 */
export function triggerFileDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
