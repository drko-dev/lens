/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { parseJsonLogLine, escapeHtml, getLogLevelBadgeStyle } from "../json-log-formatter";

describe("JSON Log Formatter & Parser (R7-08)", () => {
  it("escapes malicious HTML content to prevent XSS", () => {
    const malicious = '<script>alert("pwned")</script> <img src=x onerror=alert(1)>';
    const escaped = escapeHtml(malicious);

    expect(escaped).not.toContain("<script>");
    expect(escaped).not.toContain("<img");
    expect(escaped).toContain("&lt;script&gt;");
    expect(escaped).toContain("&lt;img");
  });

  it("parses valid JSON log lines extracting standard fields", () => {
    const jsonLine = '{"level":"info","time":"2026-10-24T00:00:00Z","msg":"Application initialized successfully","caller":"main.go:42","component":"auth"}';
    const result = parseJsonLogLine(jsonLine);

    expect(result.isJson).toBe(true);
    expect(result.level).toBe("info");
    expect(result.message).toBe("Application initialized successfully");
    expect(result.timestamp).toBe("2026-10-24T00:00:00Z");
    expect(result.caller).toBe("main.go:42");
    expect(result.extra).toEqual({ component: "auth" });
  });

  it("handles alternative field names: severity, message, timestamp", () => {
    const jsonLine = '{"severity":"ERROR","timestamp":"2026-10-24T01:00:00Z","message":"Connection refused"}';
    const result = parseJsonLogLine(jsonLine);

    expect(result.isJson).toBe(true);
    expect(result.level).toBe("ERROR");
    expect(result.message).toBe("Connection refused");
    expect(result.timestamp).toBe("2026-10-24T01:00:00Z");
  });

  it("parses JSON log lines with leading Kubernetes timestamp prefix", () => {
    const prefixed = '2026-10-24T02:00:00.123456789Z {"level":"warn","msg":"Rate limit reached"}';
    const result = parseJsonLogLine(prefixed);

    expect(result.isJson).toBe(true);
    expect(result.prefix).toBe("2026-10-24T02:00:00.123456789Z");
    expect(result.level).toBe("warn");
    expect(result.message).toBe("Rate limit reached");
  });

  it("gracefully falls back to raw line for non-JSON or invalid JSON lines", () => {
    const plain = "Oct 24 02:00:00 host systemd[1]: Started Service.";

    expect(parseJsonLogLine(plain)).toEqual({ isJson: false, raw: plain });

    const malformed = '{"level":"info", broken json';

    expect(parseJsonLogLine(malformed)).toEqual({ isJson: false, raw: malformed });

    const empty = "";

    expect(parseJsonLogLine(empty)).toEqual({ isJson: false, raw: "" });
  });

  it("returns appropriate badge colors for different log levels", () => {
    expect(getLogLevelBadgeStyle("error").color).toBe("#ef4444");
    expect(getLogLevelBadgeStyle("fatal").color).toBe("#ef4444");
    expect(getLogLevelBadgeStyle("warn").color).toBe("#f59e0b");
    expect(getLogLevelBadgeStyle("info").color).toBe("#10b981");
    expect(getLogLevelBadgeStyle("debug").color).toBe("#3b82f6");
    expect(getLogLevelBadgeStyle(undefined).color).toBe("#8b949e");
  });
});
