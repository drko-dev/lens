/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type {
  AiTransportRequest,
  AiTransportResponse,
  SecureAiTransport,
  AiTransportHeaders,
} from "./ai-transport-types";
import {
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_ALLOWED_RETRIES,
  sanitizeHeaders,
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
} from "./transport-security-policy";

/**
 * Low-level dispatch engine interface.
 * Abstracted to decouple the transport coordinator from concrete network or mock engines.
 */
export interface TransportDispatchEngine {
  dispatch(request: AiTransportRequest): Promise<{
    status: number;
    statusText: string;
    headers: AiTransportHeaders;
    body: string;
    resolvedIp?: string;
  }>;
}

/**
 * Fail-closed dispatch engine used by default in H8.8-01a.
 * Explicitly forbids real network calls until authorized and enabled in later milestones.
 */
export class DisabledRealNetworkEngine implements TransportDispatchEngine {
  public async dispatch(request: AiTransportRequest): Promise<never> {
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
    this.allowSyntheticLocal = options?.allowSyntheticLocal ?? true;
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

    // 3. Sanitize and lower-case request headers
    const sanitizedRequestHeaders = sanitizeHeaders(request.headers, false);

    const effectiveRequest: AiTransportRequest = {
      ...request,
      headers: sanitizedRequestHeaders,
      timeoutMs: request.timeoutMs > 0 ? request.timeoutMs : DEFAULT_REQUEST_TIMEOUT_MS,
      maxResponseBytes: request.maxResponseBytes && request.maxResponseBytes > 0
        ? request.maxResponseBytes
        : DEFAULT_MAX_RESPONSE_BYTES,
    };

    const maxRetries = Math.min(
      Math.max(0, request.maxRetries ?? 0),
      MAX_ALLOWED_RETRIES,
    );

    let attempt = 0;
    let lastError: unknown;

    while (attempt <= maxRetries) {
      attempt++;

      if (effectiveRequest.signal?.aborted) {
        throw new TransportAbortError();
      }

      try {
        const rawResult = await this.engine.dispatch(effectiveRequest);

        // 4. Validate resolved IP if provided by the underlying socket/engine
        if (rawResult.resolvedIp) {
          validateResolvedIpAddress(rawResult.resolvedIp);
        }

        const rawBody = rawResult.body ?? "";
        const bodyBytes = Buffer.byteLength(rawBody, "utf8");

        // 5. Enforce response size bound
        if (bodyBytes > (effectiveRequest.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES)) {
          throw new TransportResponseSizeError(
            effectiveRequest.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
            bodyBytes,
          );
        }

        const status = rawResult.status;
        const statusText = rawResult.statusText || (status === 200 ? "OK" : "Status");
        const headers = sanitizeHeaders(rawResult.headers);

        // 6. Handle HTTP error status codes
        if (status >= 400) {
          const retryAfterHeader = headers["retry-after"];
          let retryAfterMs: number | undefined;

          if (retryAfterHeader) {
            const parsed = parseInt(retryAfterHeader, 10);
            if (!isNaN(parsed) && parsed >= 0) {
              retryAfterMs = parsed * 1000;
            }
          }

          const httpError = new TransportHttpError(status, statusText, rawBody, retryAfterMs);

          // Retry only on transient errors (429 or 503) if attempts remain and not aborted
          if (httpError.isRetryable && attempt <= maxRetries && !effectiveRequest.signal?.aborted) {
            const backoffMs = retryAfterMs !== undefined ? retryAfterMs : Math.min(1000 * Math.pow(2, attempt - 1), 5000);
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
            } catch (err: any) {
              throw new Error(`Failed to parse AI provider JSON response: ${err.message}`);
            }
          },
          bytesReceived: bodyBytes,
          timing: {
            startedAt,
            completedAt,
            durationMs,
          },
        };
      } catch (err) {
        lastError = err;

        // If aborted or non-retryable error, fail immediately without retrying
        if (
          err instanceof TransportAbortError ||
          (err instanceof TransportHttpError && !err.isRetryable) ||
          err instanceof TransportResponseSizeError ||
          effectiveRequest.signal?.aborted
        ) {
          throw err;
        }

        // Retry transient timeout/network errors if budget remains
        if (
          (err instanceof TransportTimeoutError) &&
          attempt <= maxRetries &&
          !effectiveRequest.signal?.aborted
        ) {
          const backoffMs = Math.min(500 * Math.pow(2, attempt - 1), 2000);
          await this.sleepWithAbort(backoffMs, effectiveRequest.signal);
          continue;
        }

        throw err;
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
      const timer = setTimeout(() => {
        resolve();
      }, ms);

      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new TransportAbortError());
          },
          { once: true },
        );
      }
    });
  }
}
