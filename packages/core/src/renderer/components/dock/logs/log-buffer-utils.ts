/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export const DEFAULT_MAX_LOG_LINES = 10000;
export const OVERLAP_WINDOW_LINES = 100;

/**
 * Merges incoming log lines into existing logs using deterministic suffix-prefix overlap.
 * This prevents duplicate log lines when polling with sub-second precision or identical timestamps,
 * without dropping valid lines produced within the same second.
 */
export function mergeLogLines(
  existingLogs: string[],
  incomingLogs: string[],
  maxCheck = OVERLAP_WINDOW_LINES,
): { merged: string[]; newCount: number } {
  const filteredIncoming = incomingLogs.filter(Boolean);

  if (filteredIncoming.length === 0) {
    return { merged: existingLogs, newCount: 0 };
  }

  if (existingLogs.length === 0) {
    return { merged: filteredIncoming, newCount: filteredIncoming.length };
  }

  const checkCount = Math.min(existingLogs.length, filteredIncoming.length, maxCheck);
  let overlapLength = 0;

  for (let len = checkCount; len > 0; len--) {
    let match = true;

    for (let i = 0; i < len; i++) {
      if (existingLogs[existingLogs.length - len + i] !== filteredIncoming[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      overlapLength = len;
      break;
    }
  }

  const newLines = filteredIncoming.slice(overlapLength);

  return {
    merged: [...existingLogs, ...newLines],
    newCount: newLines.length,
  };
}

/**
 * Trims log lines exceeding maxLines, dropping older lines from the top.
 */
export function trimLogBuffer(
  logs: string[],
  maxLines = DEFAULT_MAX_LOG_LINES,
): { trimmed: string[]; droppedCount: number } {
  if (logs.length <= maxLines) {
    return { trimmed: logs, droppedCount: 0 };
  }

  const droppedCount = logs.length - maxLines;

  return {
    trimmed: logs.slice(droppedCount),
    droppedCount,
  };
}

/**
 * Extracts the ISO-8601 / RFC-3339 timestamp from the end of a log list.
 * Crucially, it does NOT add +1 second, which previously caused log lines within the same
 * second to be permanently skipped.
 */
export function getLastLogTimestamp(logs: string[]): string {
  if (!logs || logs.length === 0) {
    return new Date().toISOString();
  }

  for (let i = logs.length - 1; i >= 0; i--) {
    const line = logs[i];
    const match = line?.match(/^\d{4}-\S+/);

    if (match) {
      const parsed = new Date(match[0]);

      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }

  return new Date().toISOString();
}

/**
 * Strips ANSI escape codes from a log line for accurate search and filtering.
 */
export function stripAnsiCodes(str: string): string {
  if (!str) {
    return "";
  }

  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
}
