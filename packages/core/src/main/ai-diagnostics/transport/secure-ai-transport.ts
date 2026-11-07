/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";
import type {
  AiTransportRequest,
  AiTransportResponse,
  SecureAiTransport,
  AiTransportHeaders,
  BoundedResponseStream,
  PreconnectAuthorizationTicket,
} from "./ai-transport-types";
import {
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_ALLOWED_RETRIES,
  MAX_RETRY_AFTER_MS,
  sanitizeRequestHeaders,
  sanitizeResponseHeaders,
  parseRetryAfterHeader,
} from "./ai-transport-types";
import {
  RealTransportDisabledError,
  TransportAbortError,
  TransportHttpError,
  TransportResponseSizeError,
  TransportTimeoutError,
} from "./ai-transport-errors";
import {
  validateTransportEndpoint,
  validateResolvedIpAddress,
  validateRedirectTarget,
} from "./transport-security-policy";
import { SsrfSecurityViolationError } from "./ai-transport-errors";
import { readBoundedStream } from "./bounded-stream";

/**
 * Context provided to the low-level engine to enforce pre-connect validation (SEC-02, R2-01).
 */
export interface PreconnectValidationContext {
  endpoint: string;
  url: URL;
  signal: AbortSignal;
  validatePreconnectIp: (ip: string) => PreconnectAuthorizationTicket;
  validateRedirectUrl: (targetUrl: string) => void;
}

/**
 * Result structure emitted by dispatch engines.
 */
export interface DispatchResult {
  status: number;
  statusText: string;
  headers: AiTransportHeaders;
  body?: string;
  stream?: BoundedResponseStream;
  streamChunks?: Array<string | Buffer>;
  resolvedIp?: string;
  preconnectTicket?: PreconnectAuthorizationTicket;
  wasPreconnectValidated?: boolean;
}

/**
 * Low-level dispatch engine interface.
 * Abstracted to decouple the transport coordinator from concrete network or mock engines.
 */
export interface TransportDispatchEngine {
  dispatch(
    request: AiTransportRequest,
    context: PreconnectValidationContext,
  ): Promise<DispatchResult>;
}

/**
 * Fail-closed dispatch engine used by default in H8.8-01a.
 * Explicitly forbids real network calls until authorized and enabled in later milestones.
 */
export class DisabledRealNetworkEngine implements TransportDispatchEngine {
  public async dispatch(
    request: AiTransportRequest,
    _context: PreconnectValidationContext,
  ): Promise<never> {
    throw new RealTransportDisabledError(request.provider);
  }
}

export interface SecureAiTransportOptions {
  engine?: TransportDispatchEngine;
  allowSyntheticLocal?: boolean;
}

export class DefaultSecureAiTransport implements SecureAiTransport {
  private readonly engine: TransportDispatchEngine;
  private readonly allowSyntheticLocal: boolean;

  constructor(options?: SecureAiTransportOptions) {
    this.engine = options?.engine ?? new DisabledRealNetworkEngine();
    // Deny-by-default for synthetic local endpoints (SEC-07)
    this.allowSyntheticLocal = options?.allowSyntheticLocal ?? false;
  }

  public async execute(request: AiTransportRequest): Promise<AiTransportResponse> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    // 1. Initial AbortSignal check
    if (request.signal?.aborted) {
      throw new TransportAbortError();
    }

    // 2. Strict SSRF Destination Validation
    validateTransportEndpoint(request.endpoint, { allowSyntheticLocal: this.allowSyntheticLocal });

    // 3. Sanitize and lower-case request headers enforcing strict allowlist (SEC-03, R2-03)
    const sanitizedRequestHeaders = sanitizeRequestHeaders(request.headers, false);

    const overallTimeoutMs = request.timeoutMs > 0 ? request.timeoutMs : DEFAULT_REQUEST_TIMEOUT_MS;
    const overallDeadline = startTime + overallTimeoutMs;

    const effectiveRequest: AiTransportRequest = {
      ...request,
      headers: sanitizedRequestHeaders,
      timeoutMs: overallTimeoutMs,
      maxResponseBytes: request.maxResponseBytes && request.maxResponseBytes > 0
        ? request.maxResponseBytes
        : DEFAULT_MAX_RESPONSE_BYTES,
    };

    // R3-01: In H8.8-01a, POST requests must NEVER retry automatically, regardless of idempotent flag.
    // This strictly eliminates the risk of double-billing or duplicate inference tokens.
    // Retries are strictly reserved for GET requests where idempotent !== false.
    const isRetryEligible = effectiveRequest.method === "GET" && effectiveRequest.idempotent !== false;
    const maxRetries = isRetryEligible
      ? Math.min(Math.max(0, request.maxRetries ?? 0), MAX_ALLOWED_RETRIES)
      : 0;

    let attempt = 0;
    let lastError: unknown;

    while (attempt <= maxRetries) {
      attempt++;

      // Check overall deadline before attempt (SEC-01)
      const now = Date.now();
      const remainingMs = overallDeadline - now;

      if (remainingMs <= 0) {
        throw new TransportTimeoutError(overallTimeoutMs);
      }

      if (effectiveRequest.signal?.aborted) {
        throw new TransportAbortError();
      }

      // Link user signal and timeout into an attempt-scoped AbortController (SEC-01)
      const attemptAbortController = new AbortController();
      let timeoutTimer: NodeJS.Timeout | undefined;
      let userAbortHandler: (() => void) | undefined;

      // R2-01: Authority-issued pre-connect authorization ticket with cryptographic attempt nonce
      const attemptNonce = crypto.randomBytes(16).toString("hex");
      const issuedTickets = new Map<string, PreconnectAuthorizationTicket>();

      const preconnectContext: PreconnectValidationContext = {
        endpoint: effectiveRequest.endpoint,
        url: new URL(effectiveRequest.endpoint),
        signal: attemptAbortController.signal,
        validatePreconnectIp: (ip: string): PreconnectAuthorizationTicket => {
          validateResolvedIpAddress(ip);
          const ticket: PreconnectAuthorizationTicket = {
            ticketId: `ticket-${crypto.randomUUID()}`,
            endpoint: effectiveRequest.endpoint,
            validatedIp: ip,
            issuedAt: Date.now(),
            nonce: attemptNonce,
          };
          issuedTickets.set(ticket.ticketId, ticket);
          return ticket;
        },
        validateRedirectUrl: (targetUrl: string) => {
          validateRedirectTarget(effectiveRequest.endpoint, targetUrl, {
            allowSyntheticLocal: this.allowSyntheticLocal,
          });
        },
      };

      try {
        // Enforce hard deadline race so hanging engines cannot block execution (SEC-01)
        const dispatchPromise = this.engine.dispatch(effectiveRequest, preconnectContext);

        const timeoutOrAbortPromise = new Promise<never>((_, reject) => {
          timeoutTimer = setTimeout(() => {
            attemptAbortController.abort();
            reject(new TransportTimeoutError(overallTimeoutMs));
          }, remainingMs);

          if (effectiveRequest.signal) {
            userAbortHandler = () => {
              attemptAbortController.abort();
              reject(new TransportAbortError());
            };
            effectiveRequest.signal.addEventListener("abort", userAbortHandler, { once: true });
          }
        });

        const rawResult = await Promise.race([dispatchPromise, timeoutOrAbortPromise]);

        // 4. Verify pre-connection validation was strictly performed via coordinator ticket (R2-01)
        const ticket = rawResult.preconnectTicket;
        if (!ticket || !issuedTickets.has(ticket.ticketId) || ticket.nonce !== attemptNonce) {
          throw new SsrfSecurityViolationError(
            "Engine did not perform verified pre-connection IP validation. Connection rejected by coordinator.",
          );
        }

        // Verify resolved IP matches ticket IP to prevent DNS rebinding / race condition
        if (rawResult.resolvedIp && rawResult.resolvedIp !== ticket.validatedIp) {
          throw new SsrfSecurityViolationError(
            `Engine resolved IP (${rawResult.resolvedIp}) differs from pre-connect validated IP (${ticket.validatedIp}). Potential DNS rebinding attack blocked.`,
          );
        }

        const maxBytes = effectiveRequest.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
        let rawBody = "";
        let bodyBytes = 0;

        // 5. Enforce response size bound with incremental stream inspection & cancellation (SEC-06, R2-05)
        if (rawResult.stream) {
          const { body: streamBody, totalBytes: streamBytes } = await readBoundedStream(
            rawResult.stream,
            maxBytes,
            attemptAbortController.signal,
          );
          rawBody = streamBody;
          bodyBytes = streamBytes;
        } else if (rawResult.streamChunks && rawResult.streamChunks.length > 0) {
          const parts: string[] = [];

          for (const chunk of rawResult.streamChunks) {
            const chunkBuf = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
            bodyBytes += chunkBuf.length;

            if (bodyBytes > maxBytes) {
              throw new TransportResponseSizeError(maxBytes, bodyBytes);
            }

            parts.push(chunkBuf.toString("utf8"));
          }

          rawBody = parts.join("");
        } else {
          rawBody = rawResult.body ?? "";
          bodyBytes = Buffer.byteLength(rawBody, "utf8");

          if (bodyBytes > maxBytes) {
            throw new TransportResponseSizeError(maxBytes, bodyBytes);
          }
        }

        const status = rawResult.status;
        const statusText = rawResult.statusText || (status === 200 ? "OK" : "Status");
        // R2-03: Use dedicated response header sanitization preserving retry-after, location, rate-limits
        const headers = sanitizeResponseHeaders(rawResult.headers);

        // R2-04: Validate HTTP redirects (301, 302, 303, 307, 308) against SSRF policy and fail closed
        if ([301, 302, 303, 307, 308].includes(status) && headers["location"]) {
          validateRedirectTarget(effectiveRequest.endpoint, headers["location"], {
            allowSyntheticLocal: this.allowSyntheticLocal,
          });
        }

        // 6. Handle HTTP error status codes (SEC-05)
        if (status >= 400) {
          const retryAfterMs = parseRetryAfterHeader(headers["retry-after"]);
          const httpError = new TransportHttpError(status, statusText, rawBody, retryAfterMs);

          // Retry only on transient errors (429 or 503) if attempts remain, eligible for retry (GET only), not aborted, and not budget exhausted (R3-01)
          if (httpError.isRetryable && isRetryEligible && attempt <= maxRetries && !effectiveRequest.signal?.aborted) {
            const backoffMs = Math.min(
              retryAfterMs !== undefined ? retryAfterMs : Math.min(1000 * Math.pow(2, attempt - 1), 5000),
              MAX_RETRY_AFTER_MS,
            );

            // Ensure backoff fits within the remaining deadline
            if (Date.now() + backoffMs >= overallDeadline) {
              throw new TransportTimeoutError(overallTimeoutMs);
            }

            await this.sleepWithAbort(backoffMs, effectiveRequest.signal);
            continue;
          }

          throw httpError;
        }

        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - startTime;

        return {
          status,
          statusText,
          headers,
          body: rawBody,
          json<T = unknown>(): T {
            try {
              return JSON.parse(rawBody) as T;
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              throw new Error(`Failed to parse AI provider JSON response: ${msg}`);
            }
          },
          bytesReceived: bodyBytes,
          timing: {
            startedAt,
            completedAt,
            durationMs,
          },
        };
      } catch (err: unknown) {
        lastError = err;

        // If aborted, timeout, non-retryable error, size limit, or not eligible for retry, fail immediately (R3-01)
        if (
          err instanceof TransportAbortError ||
          err instanceof TransportTimeoutError ||
          err instanceof TransportResponseSizeError ||
          err instanceof SsrfSecurityViolationError ||
          (err instanceof TransportHttpError && !err.isRetryable) ||
          effectiveRequest.signal?.aborted ||
          !isRetryEligible
        ) {
          throw err;
        }

        // Retry transient network errors only if eligible for retry (GET only) and deadline allows (R3-01)
        if (
          isRetryEligible &&
          attempt <= maxRetries &&
          !effectiveRequest.signal?.aborted &&
          Date.now() + 500 < overallDeadline
        ) {
          const backoffMs = Math.min(500 * Math.pow(2, attempt - 1), 2000);
          await this.sleepWithAbort(backoffMs, effectiveRequest.signal);
          continue;
        }

        throw err;
      } finally {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
        }

        if (effectiveRequest.signal && userAbortHandler) {
          effectiveRequest.signal.removeEventListener("abort", userAbortHandler);
        }
      }
    }

    throw lastError;
  }

  private async sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new TransportAbortError();
    }

    if (ms <= 0) return;

    await new Promise<void>((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      let abortHandler: (() => void) | undefined;

      timer = setTimeout(() => {
        if (abortHandler && signal) {
          signal.removeEventListener("abort", abortHandler);
        }
        resolve();
      }, ms);

      if (signal) {
        abortHandler = () => {
          if (timer) clearTimeout(timer);
          reject(new TransportAbortError());
        };
        signal.addEventListener("abort", abortHandler, { once: true });
      }
    });
  }
}
