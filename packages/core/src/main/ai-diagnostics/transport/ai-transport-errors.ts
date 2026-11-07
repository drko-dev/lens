/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * Strips API keys, Bearer tokens, and sensitive headers from strings and error messages.
 */
export function sanitizeSensitiveText(input: string): string {
  if (!input) return "";

  return input
    // Redact OpenAI / Anthropic / Gemini style API keys
    .replace(/\b(sk-[a-zA-Z0-9_-]{12,})\b/g, "[REDACTED_API_KEY]")
    .replace(/\b(AIza[a-zA-Z0-9_-]{30,40})\b/g, "[REDACTED_API_KEY]")
    // Redact Bearer tokens
    .replace(/Bearer\s+[a-zA-Z0-9._~+/-]+=*/gi, "Bearer [REDACTED_TOKEN]")
    // Redact Authorization and x-api-key header lines in dumps
    .replace(/(authorization|x-api-key|x-goog-api-key)\s*:\s*[^\r\n]+/gi, "$1: [REDACTED]")
    // Redact JSON sensitive properties
    .replace(/"(api_?key|password|secret|token|credential)"\s*:\s*"[^"]+"/gi, '"$1": "[REDACTED]"');
}

export abstract class AiTransportError extends Error {
  public abstract readonly code: string;
  public readonly status?: number;
  public readonly isRetryable: boolean;
  public readonly sanitizedMessage: string;

  constructor(message: string, isRetryable: boolean = false, status?: number) {
    const cleanMessage = sanitizeSensitiveText(message);
    super(cleanMessage);
    this.sanitizedMessage = cleanMessage;
    this.isRetryable = isRetryable;
    this.status = status;
    this.name = this.constructor.name;

    // Enforce clean stack traces without leaked API keys
    if (this.stack) {
      this.stack = sanitizeSensitiveText(this.stack);
    }
  }
}

export class SsrfSecurityViolationError extends AiTransportError {
  public readonly code = "SSRF_SECURITY_VIOLATION";

  constructor(message: string) {
    super(message, false);
    this.name = "SsrfSecurityViolationError";
  }
}

export class TransportTimeoutError extends AiTransportError {
  public readonly code = "TRANSPORT_TIMEOUT";

  constructor(timeoutMs: number, message?: string) {
    super(message || `AI Transport request timed out after ${timeoutMs}ms`, false);
    this.name = "TransportTimeoutError";
  }
}

export class TransportAbortError extends AiTransportError {
  public readonly code = "TRANSPORT_ABORTED";

  constructor(message?: string) {
    super(message || "AI Transport request was aborted by client", false);
    this.name = "TransportAbortError";
  }
}

export class TransportResponseSizeError extends AiTransportError {
  public readonly code = "RESPONSE_TOO_LARGE";

  constructor(maxBytes: number, actualBytes?: number) {
    const details = actualBytes ? ` (received ${actualBytes} bytes)` : "";
    super(`AI Transport response exceeded maximum allowed size of ${maxBytes} bytes${details}`, false);
    this.name = "TransportResponseSizeError";
  }
}

export class TransportHttpError extends AiTransportError {
  public readonly code = "HTTP_ERROR";
  public readonly statusText: string;
  public readonly retryAfterMs?: number;
  public readonly responseBodySummary?: string;

  constructor(
    status: number,
    statusText: string,
    body?: string,
    retryAfterMs?: number,
  ) {
    const isRetryable = status === 429 || status === 503;
    const cleanSummary = body ? sanitizeSensitiveText(body.slice(0, 250)) : undefined;
    const retryInfo = retryAfterMs ? ` (Retry-After: ${Math.round(retryAfterMs / 1000)}s)` : "";

    super(
      `AI Provider HTTP ${status} ${statusText}${retryInfo}${cleanSummary ? `: ${cleanSummary}` : ""}`,
      isRetryable,
      status,
    );

    this.name = "TransportHttpError";
    this.statusText = statusText;
    this.retryAfterMs = retryAfterMs;
    this.responseBodySummary = cleanSummary;
  }
}

export class TransportNetworkError extends AiTransportError {
  public readonly code = "NETWORK_ERROR";

  constructor(message: string, isRetryable: boolean = true) {
    super(message, isRetryable);
    this.name = "TransportNetworkError";
  }
}

export class RealTransportDisabledError extends AiTransportError {
  public readonly code = "REAL_TRANSPORT_DISABLED";

  constructor(provider: string) {
    super(
      `Real external network transport for provider '${provider}' is disabled in this milestone (H8.8-01a). External requests must use MockAiTransport.`,
      false,
    );
    this.name = "RealTransportDisabledError";
  }
}
