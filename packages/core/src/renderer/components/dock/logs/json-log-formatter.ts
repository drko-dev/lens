/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { stripAnsiCodes } from "./log-buffer-utils";

export interface ParsedJsonLog {
  isJson: boolean;
  raw: string;
  prefix?: string;
  level?: string;
  message?: string;
  timestamp?: string;
  caller?: string;
  extra?: Record<string, any>;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function parseJsonLogLine(line: string): ParsedJsonLog {
  if (!line || typeof line !== "string") {
    return { isJson: false, raw: line ?? "" };
  }

  const clean = stripAnsiCodes(line).trim();
  const jsonStart = clean.indexOf("{");
  const jsonEnd = clean.lastIndexOf("}");

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return { isJson: false, raw: line };
  }

  const prefix = jsonStart > 0 ? clean.substring(0, jsonStart).trim() : undefined;
  const jsonSubstring = clean.substring(jsonStart, jsonEnd + 1);

  try {
    const parsed = JSON.parse(jsonSubstring);

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { isJson: false, raw: line };
    }

    const level = parsed.level ?? parsed.severity ?? parsed.lvl;
    const message = parsed.message ?? parsed.msg ?? parsed.text;
    const timestamp = parsed.time ?? parsed.timestamp ?? parsed["@timestamp"] ?? parsed.ts;
    const caller = parsed.caller ?? parsed.logger ?? parsed.source;

    // Remaining extra attributes
    const extra: Record<string, any> = {};
    const knownKeys = new Set(["level", "severity", "lvl", "message", "msg", "text", "time", "timestamp", "@timestamp", "ts", "caller", "logger", "source"]);

    for (const [k, v] of Object.entries(parsed)) {
      if (!knownKeys.has(k)) {
        extra[k] = v;
      }
    }

    return {
      isJson: true,
      raw: line,
      prefix,
      level: level !== undefined ? String(level) : undefined,
      message: message !== undefined ? String(message) : undefined,
      timestamp: timestamp !== undefined ? String(timestamp) : undefined,
      caller: caller !== undefined ? String(caller) : undefined,
      extra: Object.keys(extra).length > 0 ? extra : undefined,
    };
  } catch {
    return { isJson: false, raw: line };
  }
}

export function getLogLevelBadgeStyle(level?: string): { backgroundColor: string; color: string } {
  if (!level) {
    return { backgroundColor: "rgba(139, 148, 158, 0.2)", color: "#8b949e" };
  }

  const norm = level.toLowerCase();

  if (norm.includes("err") || norm.includes("fatal") || norm.includes("crit")) {
    return { backgroundColor: "rgba(239, 68, 68, 0.25)", color: "#ef4444" };
  }

  if (norm.includes("warn")) {
    return { backgroundColor: "rgba(245, 158, 11, 0.25)", color: "#f59e0b" };
  }

  if (norm.includes("info")) {
    return { backgroundColor: "rgba(16, 185, 129, 0.25)", color: "#10b981" };
  }

  if (norm.includes("debug") || norm.includes("trace")) {
    return { backgroundColor: "rgba(59, 130, 246, 0.25)", color: "#3b82f6" };
  }

  return { backgroundColor: "rgba(139, 148, 158, 0.2)", color: "#8b949e" };
}
