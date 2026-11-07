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
  RecordedRequestAudit,
  BoundedResponseStream,
} from "./ai-transport-types";
import {
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  sanitizeRequestHeaders,
  sanitizeResponseHeaders,
  sanitizeEndpointForTelemetry,
  parseRetryAfterHeader,
} from "./ai-transport-types";
import {
  TransportAbortError,
  TransportHttpError,
  TransportResponseSizeError,
  TransportTimeoutError,
  TransportRedirectError,
} from "./ai-transport-errors";
import {
  validateTransportEndpoint,
  validateResolvedIpAddress,
  validateRedirectTarget,
} from "./transport-security-policy";
import { readBoundedStream } from "./bounded-stream";

export interface MockResponseDefinition {
  status?: number;
  statusText?: string;
  headers?: AiTransportHeaders;
  body?: string;
  stream?: BoundedResponseStream;
  streamChunks?: Array<string | Buffer>;
  delayMs?: number;
  simulatedResolvedIp?: string;
}

export type MockHandler = (request: AiTransportRequest) => Promise<MockResponseDefinition> | MockResponseDefinition;

export interface MockRoute {
  id: string;
  predicate: (request: AiTransportRequest) => boolean;
  handler: MockHandler;
}

export class MockAiTransport implements SecureAiTransport {
  private readonly routes: MockRoute[] = [];
  public readonly recordedRequests: RecordedRequestAudit[] = [];
  private defaultResponse: MockResponseDefinition = {
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Mock AI Transport response" }),
  };
  private globalDelayMs = 0;
  private simulatedResolvedIp?: string;

  constructor(defaultResponse?: MockResponseDefinition) {
    if (defaultResponse) {
      this.defaultResponse = { ...this.defaultResponse, ...defaultResponse };
    }
  }

  public setGlobalDelay(ms: number): void {
    this.globalDelayMs = ms;
  }

  public setSimulatedResolvedIp(ip: string | undefined): void {
    this.simulatedResolvedIp = ip;
  }

  public setDefaultResponse(def: MockResponseDefinition): void {
    this.defaultResponse = { ...this.defaultResponse, ...def };
  }

  public registerRoute(
    predicate: (request: AiTransportRequest) => boolean,
    handlerOrDef: MockHandler | MockResponseDefinition,
    id: string = `route-${this.routes.length + 1}`,
  ): void {
    const handler: MockHandler =
      typeof handlerOrDef === "function" ? handlerOrDef : () => handlerOrDef;

    this.routes.unshift({ id, predicate, handler }); // Prepend so latest takes precedence
  }

  public clearRoutes(): void {
    this.routes.length = 0;
  }

  public clearHistory(): void {
    this.recordedRequests.length = 0;
  }

  public async execute(request: AiTransportRequest): Promise<AiTransportResponse> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    // 1. Audit trail: record sanitized metadata WITHOUT retaining raw request bodies (SEC-04)
    const bodyBytes = request.body ? Buffer.byteLength(request.body, "utf8") : 0;
    const bodySha256 = request.body
      ? crypto.createHash("sha256").update(request.body, "utf8").digest("hex")
      : undefined;

    // Apply strict header allowlist & credential redaction
    const sanitizedAuditHeaders = sanitizeRequestHeaders(request.headers, true);

    this.recordedRequests.push({
      provider: request.provider,
      endpoint: sanitizeEndpointForTelemetry(request.endpoint),
      method: request.method,
      headers: sanitizedAuditHeaders,
      hasBody: Boolean(request.body),
      bodyBytes,
      bodySha256,
      recordedAt: startedAt,
    });

    // 2. Pre-execution Abort check
    if (request.signal?.aborted) {
      throw new TransportAbortError();
    }

    // 3. Strict SSRF Destination Validation
    validateTransportEndpoint(request.endpoint, { allowSyntheticLocal: true });

    // 4. Pre-connect DNS Rebinding / Resolved IP Validation if simulated (SEC-02)
    if (this.simulatedResolvedIp) {
      validateResolvedIpAddress(this.simulatedResolvedIp);
    }

    // 5. Match custom route or fallback to default response
    const matchedRoute = this.routes.find(r => r.predicate(request));
    const responseDef = matchedRoute
      ? await matchedRoute.handler(request)
      : this.defaultResponse;

    // Check route-specific simulated resolved IP before returning
    if (responseDef.simulatedResolvedIp) {
      validateResolvedIpAddress(responseDef.simulatedResolvedIp);
    }

    // 6. Handle Delays, AbortSignal and Timeouts
    const delay = responseDef.delayMs ?? this.globalDelayMs;
    const timeout = request.timeoutMs > 0 ? request.timeoutMs : DEFAULT_REQUEST_TIMEOUT_MS;

    if (delay > 0) {
      await new Promise<void>((resolve, reject) => {
        let timer: NodeJS.Timeout | undefined;
        let abortHandler: (() => void) | undefined;

        if (delay >= timeout) {
          timer = setTimeout(() => {
            if (abortHandler && request.signal) {
              request.signal.removeEventListener("abort", abortHandler);
            }
            reject(new TransportTimeoutError(timeout));
          }, timeout);
        } else {
          timer = setTimeout(() => {
            if (abortHandler && request.signal) {
              request.signal.removeEventListener("abort", abortHandler);
            }
            resolve();
          }, delay);
        }

        if (request.signal) {
          abortHandler = () => {
            if (timer) clearTimeout(timer);
            reject(new TransportAbortError());
          };
          request.signal.addEventListener("abort", abortHandler, { once: true });
        }
      });
    }

    if (request.signal?.aborted) {
      throw new TransportAbortError();
    }

    const status = responseDef.status ?? 200;
    const statusText = responseDef.statusText ?? (status === 200 ? "OK" : "Status");
    // R2-03: Use dedicated response header sanitization preserving retry-after, location, rate limits
    const headers = sanitizeResponseHeaders(responseDef.headers ?? { "content-type": "application/json" });

    // 7. Handle Redirections (301, 302, 303, 307, 308) - SEC-02, R2-04, R3-04
    if ([301, 302, 303, 307, 308].includes(status)) {
      const locationHeader = headers["location"];
      if (!locationHeader || locationHeader.trim() === "") {
        throw new TransportRedirectError(
          status,
          statusText,
          `HTTP ${status} redirect response missing required non-empty Location header.`,
        );
      }

      validateRedirectTarget(request.endpoint, locationHeader, { allowSyntheticLocal: true });
    }

    const maxBytes = request.maxResponseBytes && request.maxResponseBytes > 0
      ? request.maxResponseBytes
      : DEFAULT_MAX_RESPONSE_BYTES;

    let rawBody = "";
    let totalBytesReceived = 0;

    // 8. Enforce Response Size Bound with incremental chunk verification (SEC-06, R2-05)
    if (responseDef.stream) {
      const { body: streamBody, totalBytes: streamBytes } = await readBoundedStream(
        responseDef.stream,
        maxBytes,
        request.signal,
      );
      rawBody = streamBody;
      totalBytesReceived = streamBytes;
    } else if (responseDef.streamChunks && responseDef.streamChunks.length > 0) {
      const parts: string[] = [];

      for (const chunk of responseDef.streamChunks) {
        const chunkBuf = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
        totalBytesReceived += chunkBuf.length;

        if (totalBytesReceived > maxBytes) {
          // Immediately cut off reading to prevent memory exhaustion (DoS)
          throw new TransportResponseSizeError(maxBytes, totalBytesReceived);
        }

        parts.push(chunkBuf.toString("utf8"));
      }

      rawBody = parts.join("");
    } else {
      rawBody = responseDef.body ?? "";
      totalBytesReceived = Buffer.byteLength(rawBody, "utf8");

      if (totalBytesReceived > maxBytes) {
        throw new TransportResponseSizeError(maxBytes, totalBytesReceived);
      }
    }

    // 9. HTTP Error conversion for non-2xx statuses
    if (status >= 400) {
      const retryAfterMs = parseRetryAfterHeader(headers["retry-after"]);
      throw new TransportHttpError(status, statusText, rawBody, retryAfterMs);
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
        } catch (_err: unknown) {
          throw new Error("Failed to parse AI provider JSON response.");
        }
      },
      bytesReceived: totalBytesReceived,
      timing: {
        startedAt,
        completedAt,
        durationMs,
      },
    };
  }
}
