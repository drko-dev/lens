/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { AiProviderType } from "../../../common/incident/ai-profile-types";

export type AiTransportMethod = "GET" | "POST";

export type AiTransportHeaders = Record<string, string>;

export interface BoundedResponseStream {
  chunks: AsyncIterable<Uint8Array>;
  cancel(reason?: string): Promise<void>;
}

export interface PreconnectAuthorizationTicket {
  ticketId: string;
  endpoint: string;
  validatedIp: string;
  issuedAt: number;
  nonce: string;
}

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
  idempotent?: boolean;
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

export interface RecordedRequestAudit {
  provider: AiProviderType;
  endpoint: string;
  method: AiTransportMethod;
  headers: AiTransportHeaders;
  hasBody: boolean;
  bodyBytes: number;
  bodySha256?: string;
  recordedAt: string;
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
 * Hop-by-hop and connection-manipulating request headers that are strictly forbidden.
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
 * Standard allowed HTTP response headers for AI provider communication (R2-03).
 * Preserves rate limits, retry directives, content metadata, and redirect targets.
 */
export const ALLOWED_RESPONSE_HEADERS = new Set([
  "content-type",
  "content-length",
  "retry-after",
  "location",
  "date",
  "etag",
  "server",
  "x-request-id",
  "content-encoding",
  "cache-control",
  "strict-transport-security",
  "vary",
]);

/**
 * Forbidden response headers (cookies, session manipulation, connection state).
 */
export const FORBIDDEN_RESPONSE_HEADERS = new Set([
  "set-cookie",
  "set-cookie2",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "trailer",
  "proxy-authenticate",
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
 * Maximum permitted backoff sleep from Retry-After header (10 seconds).
 */
export const MAX_RETRY_AFTER_MS = 10 * 1000;

/**
 * RFC 7230 valid token character set for header names.
 */
const VALID_HEADER_NAME_REGEX = /^[a-zA-Z0-9!#$%&'*+-.^_`|~]+$/;

/**
 * Sanitizes and filters request headers:
 * 1. Rejects invalid characters and control characters.
 * 2. Enforces strict ALLOWED_REQUEST_HEADERS allowlist (drops unknown/debug headers).
 * 3. Enforces FORBIDDEN_REQUEST_HEADERS blocklist (drops hop-by-hop/host/cookie).
 * 4. Strips CRLF injection characters from values.
 * 5. Optionally redacts sensitive credentials.
 */
export function sanitizeRequestHeaders(
  headers: AiTransportHeaders,
  redactSecrets: boolean = false,
): AiTransportHeaders {
  const result: AiTransportHeaders = {};

  for (const [key, rawValue] of Object.entries(headers)) {
    if (!key || typeof key !== "string") continue;
    const trimmedKey = key.trim();

    if (!VALID_HEADER_NAME_REGEX.test(trimmedKey)) {
      continue;
    }

    const lowerKey = trimmedKey.toLowerCase();

    // 1. Block forbidden connection / hop-by-hop headers
    if (FORBIDDEN_REQUEST_HEADERS.has(lowerKey)) {
      continue;
    }

    // 2. Enforce strict allowlist: drop unapproved headers (SEC-03)
    if (!ALLOWED_REQUEST_HEADERS.has(lowerKey)) {
      continue;
    }

    // 3. Clean value and prevent CRLF injection
    const strVal = String(rawValue ?? "");
    if (/[\r\n\0]/.test(strVal)) {
      continue;
    }

    if (redactSecrets && SENSITIVE_HEADER_KEYS.has(lowerKey)) {
      result[lowerKey] = "[REDACTED]";
    } else {
      result[lowerKey] = strVal;
    }
  }

  return result;
}

/**
 * Sanitizes and filters response headers (R2-03):
 * 1. Preserves essential protocol headers: retry-after, location, content-type, rate limits.
 * 2. Blocks dangerous/stateful headers (set-cookie, connection, etc.).
 * 3. Strips CRLF injection characters from values.
 */
export function sanitizeResponseHeaders(
  headers: AiTransportHeaders,
): AiTransportHeaders {
  const result: AiTransportHeaders = {};

  for (const [key, rawValue] of Object.entries(headers)) {
    if (!key || typeof key !== "string") continue;
    const trimmedKey = key.trim();

    if (!VALID_HEADER_NAME_REGEX.test(trimmedKey)) {
      continue;
    }

    const lowerKey = trimmedKey.toLowerCase();

    // 1. Block forbidden response headers (cookies, connection hop-by-hop)
    if (FORBIDDEN_RESPONSE_HEADERS.has(lowerKey)) {
      continue;
    }

    // 2. Allow explicitly approved headers OR provider rate-limit prefixes
    const isApproved =
      ALLOWED_RESPONSE_HEADERS.has(lowerKey) ||
      lowerKey.startsWith("x-ratelimit-") ||
      lowerKey.startsWith("anthropic-ratelimit-") ||
      lowerKey.startsWith("openai-");

    if (!isApproved) {
      continue;
    }

    // 3. Clean value and prevent CRLF injection
    const strVal = String(rawValue ?? "");
    if (/[\r\n\0]/.test(strVal)) {
      continue;
    }

    result[lowerKey] = strVal;
  }

  return result;
}

/**
 * Backward compatibility alias for request header sanitization.
 */
export const sanitizeHeaders = sanitizeRequestHeaders;

/**
 * Parses Retry-After header supporting integer seconds and HTTP-Date formats.
 * Bounded by MAX_RETRY_AFTER_MS (SEC-05).
 */
export function parseRetryAfterHeader(headerValue: string | undefined): number | undefined {
  if (!headerValue || typeof headerValue !== "string") return undefined;
  const trimmed = headerValue.trim();

  // 1. Integer seconds (e.g. "5" or "120")
  if (/^\d+$/.test(trimmed)) {
    const seconds = parseInt(trimmed, 10);
    if (!isNaN(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
    }
  }

  // 2. HTTP Date format (e.g. "Wed, 21 Oct 2026 07:28:00 GMT")
  const parsedDate = Date.parse(trimmed);
  if (!isNaN(parsedDate)) {
    const diffMs = parsedDate - Date.now();
    if (diffMs > 0) {
      return Math.min(diffMs, MAX_RETRY_AFTER_MS);
    }
    return 0;
  }

  return undefined;
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
