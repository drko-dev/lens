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
  sanitizeHeaders,
} from "./ai-transport-types";
import {
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

export interface MockResponseDefinition {
  status?: number;
  statusText?: string;
  headers?: AiTransportHeaders;
  body?: string;
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
  public readonly recordedRequests: AiTransportRequest[] = [];
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

    // 1. Record sanitized request in history (with credentials redacted)
    this.recordedRequests.push({
      ...request,
      headers: sanitizeHeaders(request.headers, true),
    });

    // 2. Pre-execution Abort check
    if (request.signal?.aborted) {
      throw new TransportAbortError();
    }

    // 3. Strict SSRF Destination Validation
    validateTransportEndpoint(request.endpoint, { allowSyntheticLocal: true });

    // 4. DNS Rebinding / Resolved IP Validation if simulated
    if (this.simulatedResolvedIp) {
      validateResolvedIpAddress(this.simulatedResolvedIp);
    }

    // 5. Match custom route or fallback to default response
    const matchedRoute = this.routes.find(r => r.predicate(request));
    const responseDef = matchedRoute
      ? await matchedRoute.handler(request)
      : this.defaultResponse;

    // Check route-specific simulated resolved IP
    if (responseDef.simulatedResolvedIp) {
      validateResolvedIpAddress(responseDef.simulatedResolvedIp);
    }

    // 6. Handle Delays, AbortSignal and Timeouts
    const delay = responseDef.delayMs ?? this.globalDelayMs;
    const timeout = request.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

    if (delay > 0) {
      await new Promise<void>((resolve, reject) => {
        let timer: NodeJS.Timeout | undefined;
        let abortHandler: (() => void) | undefined;

        if (delay >= timeout) {
          timer = setTimeout(() => {
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
    const headers = sanitizeHeaders(responseDef.headers ?? { "content-type": "application/json" });
    const rawBody = responseDef.body ?? "";

    // 7. Handle Redirections (301, 302, 307, 308)
    if ([301, 302, 307, 308].includes(status) && headers["location"]) {
      // Validate redirect target strictly against SSRF policy
      validateRedirectTarget(request.endpoint, headers["location"], { allowSyntheticLocal: true });
    }

    // 8. Enforce Response Size Bound (Memory Bomb Defense)
    const maxBytes = request.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const bodyBytes = Buffer.byteLength(rawBody, "utf8");

    if (bodyBytes > maxBytes) {
      throw new TransportResponseSizeError(maxBytes, bodyBytes);
    }

    // 9. HTTP Error conversion for non-2xx statuses
    if (status >= 400) {
      const retryAfterHeader = headers["retry-after"];
      let retryAfterMs: number | undefined;

      if (retryAfterHeader) {
        const parsedSec = parseInt(retryAfterHeader, 10);
        if (!isNaN(parsedSec)) {
          retryAfterMs = parsedSec * 1000;
        }
      }

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
  }
}
