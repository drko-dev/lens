/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { AiProviderType } from "../../../common/incident/ai-profile-types";

export type AiTransportMethod = "GET" | "POST";

export type AiTransportHeaders = Record<string, string>;

export interface AiTransportTiming {
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface AiTransportRequest {
  endpoint: string;
  method: AiTransportMethod;
  headers: AiTransportHeaders;
  body?: string;
  timeoutMs: number;
  maxResponseBytes?: number;
  signal?: AbortSignal;
  provider: AiProviderType;
  maxRetries?: number;
}

export interface AiTransportResponse {
  status: number;
  statusText: string;
  headers: AiTransportHeaders;
  body: string;
  json<T = unknown>(): T;
  bytesReceived: number;
  timing: AiTransportTiming;
}

export interface AiTransportTelemetry {
  provider: AiProviderType;
  endpoint: string;
  method: AiTransportMethod;
  status: number;
  durationMs: number;
  bytesSent: number;
  bytesReceived: number;
  attempts: number;
}

export interface SecureAiTransport {
  execute(request: AiTransportRequest): Promise<AiTransportResponse>;
}

/**
 * Standard allowed HTTP request headers for AI provider communication.
 * All header names are evaluated in lowercase.
 */
export const ALLOWED_REQUEST_HEADERS = new Set([
  "accept",
  "content-type",
  "user-agent",
  "authorization",
  "x-api-key",
  "anthropic-version",
  "openai-organization",
  "openai-project",
  "x-goog-api-key",
  "x-goog-api-client",
]);

/**
 * Hop-by-hop and connection-manipulating headers that are strictly forbidden.
 */
export const FORBIDDEN_REQUEST_HEADERS = new Set([
  "host",
  "cookie",
  "cookie2",
  "proxy-authorization",
  "proxy-connection",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
]);

/**
 * Header keys whose values must be redacted in logs, telemetry, and error representations.
 */
export const SENSITIVE_HEADER_KEYS = new Set([
  "authorization",
  "x-api-key",
  "x-goog-api-key",
  "api-key",
  "token",
]);

/**
 * Default maximum response payload in bytes (2 MiB).
 * Prevents memory exhaustion attacks via overly large AI responses.
 */
export const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MiB

/**
 * Default request timeout in milliseconds (30 seconds).
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30 * 1000;

/**
 * Maximum permitted retries for transient HTTP errors (429, 503).
 */
export const MAX_ALLOWED_RETRIES = 2;

/**
 * Sanitizes headers by lowercasing keys and optionally redacting sensitive credentials.
 */
export function sanitizeHeaders(
  headers: AiTransportHeaders,
  redactSecrets: boolean = false,
): AiTransportHeaders {
  const result: AiTransportHeaders = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.trim().toLowerCase();

    if (FORBIDDEN_REQUEST_HEADERS.has(lowerKey)) {
      continue;
    }

    if (redactSecrets && SENSITIVE_HEADER_KEYS.has(lowerKey)) {
      result[lowerKey] = "[REDACTED]";
    } else {
      result[lowerKey] = String(value);
    }
  }

  return result;
}

/**
 * Cleans an endpoint URL for telemetry/logging by removing query strings and credentials.
 */
export function sanitizeEndpointForTelemetry(endpointUrl: string): string {
  try {
    const url = new URL(endpointUrl);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return "[MALFORMED_ENDPOINT]";
  }
}
