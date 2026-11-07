/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { MockAiTransport } from "../mock-ai-transport";
import {
  DefaultSecureAiTransport,
  type TransportDispatchEngine,
  type DispatchResult,
} from "../secure-ai-transport";
import type { AiTransportRequest } from "../ai-transport-types";
import {
  RealTransportDisabledError,
  TransportAbortError,
  TransportHttpError,
  TransportResponseSizeError,
  TransportTimeoutError,
  TransportRedirectError,
  sanitizeSensitiveText,
} from "../ai-transport-errors";
import { SsrfSecurityViolationError } from "../ai-transport-errors";
import {
  parseRetryAfterHeader,
  sanitizeResponseHeaders,
} from "../ai-transport-types";
import { createMockAsyncStream } from "../bounded-stream";

describe("H8.8-01a-R1: Secure AI Transport Hardening & Audit Regressions", () => {
  describe("SEC-08: Secret Redaction & Error Sanitization", () => {
    it("redacts OpenAI and Anthropic API keys from error messages", () => {
      const raw = "Failed request with key sk-proj-1234567890abcdef12345678 to endpoint";
      const sanitized = sanitizeSensitiveText(raw);
      expect(sanitized).not.toContain("sk-proj-1234567890abcdef12345678");
      expect(sanitized).toContain("[REDACTED_API_KEY]");
    });

    it("redacts Google Gemini API keys from error messages", () => {
      const raw = "Auth error using key AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6";
      const sanitized = sanitizeSensitiveText(raw);
      expect(sanitized).not.toContain("AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6");
      expect(sanitized).toContain("[REDACTED_API_KEY]");
    });

    it("redacts Bearer tokens and Authorization header strings", () => {
      const raw = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDvCYFeZ0WGR";
      const sanitized = sanitizeSensitiveText(raw);
      expect(sanitized).not.toContain("eyJhbGci");
      expect(sanitized).toContain("[REDACTED]");
    });

    it("redacts JSON sensitive properties like password and apiKey", () => {
      const raw = '{"error": "bad credential", "apiKey": "sk-secret-1234567890", "password": "super-secret"}';
      const sanitized = sanitizeSensitiveText(raw);
      expect(sanitized).not.toContain("sk-secret-1234567890");
      expect(sanitized).not.toContain("super-secret");
      expect(sanitized).toContain('"apiKey": "[REDACTED]"');
      expect(sanitized).toContain('"password": "[REDACTED]"');
    });
  });

  describe("SEC-03: Header Allowlist Enforcement", () => {
    let mockTransport: MockAiTransport;

    beforeEach(() => {
      mockTransport = new MockAiTransport();
    });

    it("retains allowed provider headers and strips unknown debug headers (x-private-debug)", async () => {
      mockTransport.setDefaultResponse({
        status: 200,
        body: JSON.stringify({ ok: true }),
      });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {
          "authorization": "Bearer sk-proj-1234567890abcdef1234",
          "content-type": "application/json",
          "openai-organization": "org-devops-lens",
          "x-private-debug": "infiltrated-debug-header",
          "x-custom-tracking": "unapproved",
          "host": "evil.internal",
          "cookie": "session=malicious",
        },
        body: JSON.stringify({ prompt: "synthetic" }),
        timeoutMs: 5000,
        provider: "openai",
      };

      await mockTransport.execute(req);

      expect(mockTransport.recordedRequests.length).toBe(1);
      const recorded = mockTransport.recordedRequests[0];

      // Allowed headers present
      expect(recorded.headers["authorization"]).toBe("[REDACTED]");
      expect(recorded.headers["content-type"]).toBe("application/json");
      expect(recorded.headers["openai-organization"]).toBe("org-devops-lens");

      // Unapproved headers stripped
      expect(recorded.headers["x-private-debug"]).toBeUndefined();
      expect(recorded.headers["x-custom-tracking"]).toBeUndefined();
      expect(recorded.headers["host"]).toBeUndefined();
      expect(recorded.headers["cookie"]).toBeUndefined();
    });
  });

  describe("SEC-04: Non-Retention of Sensitive Request Bodies in Mock History", () => {
    let mockTransport: MockAiTransport;

    beforeEach(() => {
      mockTransport = new MockAiTransport();
    });

    it("retains metadata and sha256 hash but NEVER stores cleartext body in audit trail", async () => {
      mockTransport.setDefaultResponse({
        status: 200,
        body: JSON.stringify({ choices: [{ text: "synthetic-diagnosis" }] }),
      });

      const sensitivePayload = JSON.stringify({
        incident: "K8S-9999",
        logs: "PANIC: confidential stack trace containing cluster token",
      });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: sensitivePayload,
        timeoutMs: 5000,
        provider: "openai",
      };

      await mockTransport.execute(req);

      expect(mockTransport.recordedRequests.length).toBe(1);
      const audit = mockTransport.recordedRequests[0];

      // Assert that raw body is NOT stored
      expect("body" in audit).toBe(false);
      expect(audit.hasBody).toBe(true);
      expect(audit.bodyBytes).toBe(Buffer.byteLength(sensitivePayload, "utf8"));
      expect(audit.bodySha256).toBeDefined();
      expect(audit.bodySha256?.length).toBe(64);
    });
  });

  describe("SEC-06: Incremental Response Size Limiting (Streaming Guard)", () => {
    let mockTransport: MockAiTransport;

    beforeEach(() => {
      mockTransport = new MockAiTransport();
    });

    it("cuts off incremental streaming chunks when cumulative size exceeds maxResponseBytes", async () => {
      // 3 chunks of 1 KiB each (total 3 KiB)
      const chunk1 = "A".repeat(1024);
      const chunk2 = "B".repeat(1024);
      const chunk3 = "C".repeat(1024);

      mockTransport.setDefaultResponse({
        status: 200,
        streamChunks: [chunk1, chunk2, chunk3],
      });

      const req: AiTransportRequest = {
        endpoint: "https://api.anthropic.com/v1/messages",
        method: "POST",
        headers: { "content-type": "application/json" },
        timeoutMs: 5000,
        maxResponseBytes: 2000, // Limit is 2000 bytes (< 3072 bytes)
        provider: "anthropic",
      };

      await expect(mockTransport.execute(req)).rejects.toThrow(TransportResponseSizeError);
    });
  });

  describe("SEC-01: Guaranteed Timeout & Cancellation Invariants", () => {
    it("guarantees timeout even when the dispatch engine hangs and never resolves", async () => {
      const hangingEngine: TransportDispatchEngine = {
        dispatch: async () => {
          // Never resolves
          return new Promise<DispatchResult>(() => {});
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: hangingEngine });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1",
        method: "POST",
        headers: {},
        timeoutMs: 20, // 20ms timeout
        provider: "openai",
      };

      const start = Date.now();
      await expect(transport.execute(req)).rejects.toThrow(TransportTimeoutError);
      const elapsed = Date.now() - start;

      // Ensure execution returned promptly within deadline without hanging
      expect(elapsed).toBeLessThan(100);
    });

    it("terminates dispatch immediately when user aborts before engine completes", async () => {
      const controller = new AbortController();

      const slowEngine: TransportDispatchEngine = {
        dispatch: async (_req, context) => {
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return new Promise<DispatchResult>((resolve, reject) => {
            const timer = setTimeout(() => {
              resolve({
                status: 200,
                statusText: "OK",
                headers: {},
                body: "{}",
                preconnectTicket,
              });
            }, 500);

            context.signal.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(new TransportAbortError());
            });
          });
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: slowEngine });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        signal: controller.signal,
        provider: "openai",
      };

      setTimeout(() => controller.abort(), 20);

      await expect(transport.execute(req)).rejects.toThrow(TransportAbortError);
    });

    it("cancels backoff sleep immediately if user aborts during retry delay", async () => {
      let attempts = 0;
      const controller = new AbortController();

      const rateLimitEngine: TransportDispatchEngine = {
        dispatch: async (_req, context) => {
          attempts++;
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 429,
            statusText: "Too Many Requests",
            headers: { "retry-after": "5" }, // 5 seconds requested
            body: "rate limited",
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: rateLimitEngine });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1",
        method: "GET", // Idempotent GET allows retries & backoff (R2-02)
        headers: {},
        timeoutMs: 10000,
        maxRetries: 2,
        signal: controller.signal,
        provider: "openai",
      };

      setTimeout(() => controller.abort(), 30);

      const start = Date.now();
      await expect(transport.execute(req)).rejects.toThrow(TransportAbortError);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(150); // Aborted in ~30ms, didn't sleep 5 seconds
      expect(attempts).toBe(1); // Never ran second attempt
    });
  });

  describe("SEC-02: Pre-Connection SSRF & Verification Contract", () => {
    it("rejects an engine that does not perform verified pre-connection validation", async () => {
      const insecureEngine: TransportDispatchEngine = {
        dispatch: async () => {
          return {
            status: 200,
            statusText: "OK",
            headers: {},
            body: "{}",
            wasPreconnectValidated: false, // Insecure engine failed preconnect validation!
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: insecureEngine });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(
        /Engine did not perform verified pre-connection IP validation/,
      );
    });

    it("allows connection when engine validates pre-connect IP successfully", async () => {
      const secureEngine: TransportDispatchEngine = {
        dispatch: async (_req, context) => {
          // Engine performs pre-connect DNS resolution and checks IP
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34"); // Public IP

          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ success: true }),
            resolvedIp: "93.184.216.34",
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: secureEngine });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      const res = await transport.execute(req);
      expect(res.status).toBe(200);
    });

    it("blocks engine pre-connect when resolved IP points to private network (DNS Rebinding)", async () => {
      const rebindingEngine: TransportDispatchEngine = {
        dispatch: async (_req, context) => {
          // Pre-connect IP points to private 10.0.0.1
          const preconnectTicket = context.validatePreconnectIp("10.0.0.1");

          return {
            status: 200,
            statusText: "OK",
            headers: {},
            body: "{}",
            resolvedIp: "10.0.0.1",
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: rebindingEngine });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(SsrfSecurityViolationError);
    });
  });

  describe("SEC-05: Retry-After Header Parsing & Boundary Checks", () => {
    it("parses integer seconds correctly and bounds to MAX_RETRY_AFTER_MS", () => {
      expect(parseRetryAfterHeader("5")).toBe(5000);
      expect(parseRetryAfterHeader("0")).toBe(0);
      // 3600 seconds (1 hour) is capped at 10000ms
      expect(parseRetryAfterHeader("3600")).toBe(10000);
    });

    it("parses HTTP-Date format correctly", () => {
      const futureDate = new Date(Date.now() + 4000).toUTCString();
      const parsed = parseRetryAfterHeader(futureDate);
      expect(parsed).toBeDefined();
      expect(parsed).toBeGreaterThanOrEqual(2000);
      expect(parsed).toBeLessThanOrEqual(5000);
    });

    it("returns undefined for malformed or missing headers", () => {
      expect(parseRetryAfterHeader(undefined)).toBeUndefined();
      expect(parseRetryAfterHeader("")).toBeUndefined();
      expect(parseRetryAfterHeader("invalid-date-string")).toBeUndefined();
    });
  });

  describe("SEC-07: Synthetic Local Deny by Default", () => {
    it("denies synthetic-ai.local by default in DefaultSecureAiTransport", async () => {
      const defaultTransport = new DefaultSecureAiTransport();

      const req: AiTransportRequest = {
        endpoint: "https://synthetic-ai.local/v1",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "mock",
      };

      await expect(defaultTransport.execute(req)).rejects.toThrow(
        /Synthetic local endpoint is not permitted in this context/,
      );
    });

    it("permits synthetic-ai.local when allowSyntheticLocal is explicitly true", async () => {
      const mockEngine: TransportDispatchEngine = {
        dispatch: async (_req, context) => {
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ synthetic: true }),
            preconnectTicket,
          };
        },
      };

      const testTransport = new DefaultSecureAiTransport({
        engine: mockEngine,
        allowSyntheticLocal: true,
      });

      const req: AiTransportRequest = {
        endpoint: "https://synthetic-ai.local/v1",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "mock",
      };

      const res = await testTransport.execute(req);
      expect(res.status).toBe(200);
    });
  });

  describe("Fail-Closed Real Transport", () => {
    it("fails closed with RealTransportDisabledError when using default real network engine", async () => {
      const defaultTransport = new DefaultSecureAiTransport();

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(defaultTransport.execute(req)).rejects.toThrow(RealTransportDisabledError);
    });
  });

  describe("R2-01: Pre-connect SSRF Verification & Nonce Authority (P0)", () => {
    it("rejects engine returning a boolean wasPreconnectValidated without coordinator ticket", async () => {
      const rogueEngine: TransportDispatchEngine = {
        dispatch: async () => ({
          status: 200,
          statusText: "OK",
          headers: {},
          body: "{}",
          wasPreconnectValidated: true, // Untrusted boolean without coordinator ticket
        }),
      };

      const transport = new DefaultSecureAiTransport({ engine: rogueEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(SsrfSecurityViolationError);
    });

    it("rejects engine attempting to forge its own preconnect ticket with invalid nonce", async () => {
      const forgedTicketEngine: TransportDispatchEngine = {
        dispatch: async () => ({
          status: 200,
          statusText: "OK",
          headers: {},
          body: "{}",
          preconnectTicket: {
            ticketId: "forged-ticket-123",
            endpoint: "https://api.openai.com/v1",
            validatedIp: "93.184.216.34",
            issuedAt: Date.now(),
            nonce: "forged-nonce-value",
          },
        }),
      };

      const transport = new DefaultSecureAiTransport({ engine: forgedTicketEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(
        /Engine did not perform verified pre-connection IP validation|Untrusted connection rejected/,
      );
    });

    it("rejects engine when resolved IP mismatches the ticket validated IP (DNS Rebinding prevention)", async () => {
      const rebindingMismatchEngine: TransportDispatchEngine = {
        dispatch: async (_req, context) => {
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 200,
            statusText: "OK",
            headers: {},
            body: "{}",
            resolvedIp: "10.0.0.1", // Mismatch with ticket
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: rebindingMismatchEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(
        /differs from pre-connect validated IP/,
      );
    });
  });

  describe("R2-02: Zero Retries for Non-Idempotent POST Requests (P0)", () => {
    it("never retries POST requests on 429 to avoid duplicate inference charges or tokens", async () => {
      let dispatchCount = 0;
      const rateLimitEngine: TransportDispatchEngine = {
        dispatch: async (_req, context) => {
          dispatchCount++;
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 429,
            statusText: "Too Many Requests",
            headers: { "retry-after": "1" },
            body: JSON.stringify({ error: "Rate limit exceeded" }),
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: rateLimitEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        maxRetries: 2, // Even if maxRetries requested
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(TransportHttpError);
      expect(dispatchCount).toBe(1); // EXACTLY 1 attempt, zero retries
    });

    it("never retries POST requests on network errors", async () => {
      let dispatchCount = 0;
      const networkFailingEngine: TransportDispatchEngine = {
        dispatch: async () => {
          dispatchCount++;
          throw new Error("Simulated socket hangup during POST");
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: networkFailingEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        maxRetries: 2,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow("Simulated socket hangup during POST");
      expect(dispatchCount).toBe(1); // Zero retries
    });

    it("allows retries for idempotent GET requests up to maxRetries", async () => {
      let dispatchCount = 0;
      const transientGetEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          dispatchCount++;
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          if (dispatchCount === 1) {
            return {
              status: 429,
              statusText: "Too Many Requests",
              headers: { "retry-after": "0" } as Record<string, string>,
              body: "rate limited",
              preconnectTicket,
            };
          }
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" } as Record<string, string>,
            body: JSON.stringify({ models: ["gpt-4o"] }),
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: transientGetEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/models",
        method: "GET",
        headers: {},
        timeoutMs: 5000,
        maxRetries: 2,
        provider: "openai",
      };

      const res = await transport.execute(req);
      expect(res.status).toBe(200);
      expect(dispatchCount).toBe(2);
    });
  });

  describe("R2-03: Separate Request and Response Header Policies (P1)", () => {
    it("preserves Retry-After and Location headers in response while stripping cookies", () => {
      const rawHeaders = {
        "Retry-After": "10",
        "Location": "https://api.openai.com/v1/chat/completions",
        "Content-Type": "application/json",
        "Set-Cookie": "session=sensitive_token",
        "Connection": "keep-alive",
        "x-ratelimit-remaining-requests": "49",
        "anthropic-ratelimit-tokens-remaining": "1000",
      };

      const sanitized = sanitizeResponseHeaders(rawHeaders);
      expect(sanitized["retry-after"]).toBe("10");
      expect(sanitized["location"]).toBe("https://api.openai.com/v1/chat/completions");
      expect(sanitized["content-type"]).toBe("application/json");
      expect(sanitized["x-ratelimit-remaining-requests"]).toBe("49");
      expect(sanitized["anthropic-ratelimit-tokens-remaining"]).toBe("1000");

      // Cookies and hop-by-hop stripped
      expect(sanitized["set-cookie"]).toBeUndefined();
      expect(sanitized["connection"]).toBeUndefined();
    });

    it("retains retry-after in TransportHttpError for upstream decision making", async () => {
      const mockTransport = new MockAiTransport();
      mockTransport.setDefaultResponse({
        status: 429,
        statusText: "Too Many Requests",
        headers: { "Retry-After": "9" },
        body: JSON.stringify({ error: "rate limit" }),
      });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      try {
        await mockTransport.execute(req);
        fail("Expected execute to throw TransportHttpError");
      } catch (err) {
        expect(err).toBeInstanceOf(TransportHttpError);
        const httpError = err as TransportHttpError;
        expect(httpError.status).toBe(429);
        expect(httpError.retryAfterMs).toBe(9000); // 9 seconds parsed correctly
      }
    });
  });

  describe("R2-04: HTTP Redirects SSRF Validation & Fail-Closed (P1)", () => {
    it("blocks 302 redirect attempting SSRF to private IP 127.0.0.1", async () => {
      const mockTransport = new MockAiTransport();
      mockTransport.setDefaultResponse({
        status: 302,
        statusText: "Found",
        headers: { "Location": "http://127.0.0.1/admin" },
        body: "",
      });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(mockTransport.execute(req)).rejects.toThrow(SsrfSecurityViolationError);
    });

    it("blocks 301 redirect attempting SSRF to cloud metadata endpoint", async () => {
      const redirectEngine: TransportDispatchEngine = {
        dispatch: async (_req, context) => {
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 301,
            statusText: "Moved Permanently",
            headers: { "Location": "http://169.254.169.254/latest/meta-data" },
            body: "",
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: redirectEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(SsrfSecurityViolationError);
    });

    it("validates safe HTTPS redirect and returns response without auto-following to unverified endpoints", async () => {
      const mockTransport = new MockAiTransport();
      mockTransport.setDefaultResponse({
        status: 307,
        statusText: "Temporary Redirect",
        headers: { "Location": "https://api.openai.com/v1/chat/completions-v2" },
        body: "Redirecting",
      });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      const res = await mockTransport.execute(req);
      expect(res.status).toBe(307);
      expect(res.headers["location"]).toBe("https://api.openai.com/v1/chat/completions-v2");
    });
  });

  describe("R2-05: Bounded Async Stream Contract & Multi-Byte UTF-8 (P1)", () => {
    it("cancels async stream immediately when exceeding byte budget", async () => {
      let wasCancelled = false;
      let cancelReason: string | undefined;

      const mockStream = createMockAsyncStream(
        [
          new Uint8Array(500),
          new Uint8Array(600), // Total 1100 > 1000
          new Uint8Array(500),
        ],
        {
          onCancel: (reason) => {
            wasCancelled = true;
            cancelReason = reason;
          },
        },
      );

      const streamEngine: TransportDispatchEngine = {
        dispatch: async (_req, context) => {
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            stream: mockStream,
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: streamEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        maxResponseBytes: 1000, // Budget 1000 bytes
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(TransportResponseSizeError);
      expect(wasCancelled).toBe(true);
      expect(cancelReason).toContain("exceeded maximum allowed size of 1000 bytes");
    });

    it("correctly decodes multi-byte UTF-8 characters split across chunk boundaries", async () => {
      // Character 'ñ' is [0xC3, 0xB1] in UTF-8
      // Character '🎉' is [0xF0, 0x9F, 0x8E, 0x89] in UTF-8
      const part1 = Buffer.from([0x48, 0x6f, 0x6c, 0x61, 0x20, 0xc3]); // "Hola " + half of ñ
      const part2 = Buffer.from([0xb1, 0x6f, 0x20, 0xf0, 0x9f]); // other half of ñ + "o " + half of 🎉
      const part3 = Buffer.from([0x8e, 0x89, 0x21]); // rest of 🎉 + "!"

      const mockStream = createMockAsyncStream([part1, part2, part3]);

      const streamEngine: TransportDispatchEngine = {
        dispatch: async (_req, context) => {
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "text/plain; charset=utf-8" },
            stream: mockStream,
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: streamEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      const res = await transport.execute(req);
      expect(res.body).toBe("Hola ño 🎉!");
    });
  });

  describe("R3-01: Prohibit Automatic POST Retries (P0)", () => {
    it("never retries POST requests on 429 when idempotent is false", async () => {
      let dispatchCount = 0;
      const rateLimitEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          dispatchCount++;
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 429,
            statusText: "Too Many Requests",
            headers: { "retry-after": "1" },
            body: JSON.stringify({ error: "rate limit" }),
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: rateLimitEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        maxRetries: 2,
        idempotent: false,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(TransportHttpError);
      expect(dispatchCount).toBe(1);
    });

    it("never retries POST requests on 429 even when idempotent is set to true (strictly ignored)", async () => {
      let dispatchCount = 0;
      const rateLimitEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          dispatchCount++;
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 429,
            statusText: "Too Many Requests",
            headers: { "retry-after": "1" },
            body: JSON.stringify({ error: "rate limit" }),
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: rateLimitEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        maxRetries: 1,
        idempotent: true, // Should be ignored for POST in H8.8-01a
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(TransportHttpError);
      expect(dispatchCount).toBe(1); // EXACTLY 1 dispatch, zero retries
    });

    it("never retries POST requests on 503 Service Unavailable", async () => {
      let dispatchCount = 0;
      const serverErrorEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          dispatchCount++;
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 503,
            statusText: "Service Unavailable",
            headers: {},
            body: JSON.stringify({ error: "unavailable" }),
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: serverErrorEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        maxRetries: 2,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(TransportHttpError);
      expect(dispatchCount).toBe(1);
    });

    it("never retries POST requests on timeout", async () => {
      let dispatchCount = 0;
      const hangingEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          dispatchCount++;
          context.validatePreconnectIp("93.184.216.34");
          return new Promise<DispatchResult>(() => {});
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: hangingEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 30,
        maxRetries: 2,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(TransportTimeoutError);
      expect(dispatchCount).toBe(1);
    });

    it("never retries POST requests on network socket failure", async () => {
      let dispatchCount = 0;
      const networkEngine: TransportDispatchEngine = {
        dispatch: async (): Promise<DispatchResult> => {
          dispatchCount++;
          throw new Error("ECONNRESET");
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: networkEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        maxRetries: 2,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow("ECONNRESET");
      expect(dispatchCount).toBe(1);
    });

    it("never retries POST requests when cancelled / aborted", async () => {
      let dispatchCount = 0;
      const controller = new AbortController();

      const slowEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          dispatchCount++;
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return new Promise<DispatchResult>((resolve, reject) => {
            const timer = setTimeout(() => {
              resolve({
                status: 200,
                statusText: "OK",
                headers: {},
                body: "{}",
                preconnectTicket,
              });
            }, 500);

            context.signal.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(new TransportAbortError());
            });
          });
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: slowEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        maxRetries: 2,
        signal: controller.signal,
        provider: "openai",
      };

      setTimeout(() => controller.abort(), 20);

      await expect(transport.execute(req)).rejects.toThrow(TransportAbortError);
      expect(dispatchCount).toBe(1);
    });

    it("allows bounded retries for GET requests on 429 within budget", async () => {
      let dispatchCount = 0;
      const retryGetEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          dispatchCount++;
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          if (dispatchCount === 1) {
            return {
              status: 429,
              statusText: "Too Many Requests",
              headers: { "retry-after": "0" },
              body: "rate limited",
              preconnectTicket,
            };
          }
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ok: true }),
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: retryGetEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/models",
        method: "GET",
        headers: {},
        timeoutMs: 5000,
        maxRetries: 2,
        provider: "openai",
      };

      const res = await transport.execute(req);
      expect(res.status).toBe(200);
      expect(dispatchCount).toBe(2);
    });

    it("stops GET retries immediately when overall deadline is exhausted", async () => {
      let dispatchCount = 0;
      const deadlineGetEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          dispatchCount++;
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 429,
            statusText: "Too Many Requests",
            headers: { "retry-after": "5" }, // 5s backoff exceeds 30ms timeout
            body: "rate limited",
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: deadlineGetEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/models",
        method: "GET",
        headers: {},
        timeoutMs: 30, // 30ms overall deadline
        maxRetries: 2,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(TransportTimeoutError);
      expect(dispatchCount).toBe(1); // Exceeded deadline, never ran attempt 2
    });
  });

  describe("R3-02: SSRF Preconnect Contract Boundaries & Disabled Real Network (P0)", () => {
    it("fails closed rejecting any real external network request with DisabledRealNetworkEngine", async () => {
      const defaultTransport = new DefaultSecureAiTransport();
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(defaultTransport.execute(req)).rejects.toThrow(RealTransportDisabledError);
    });

    it("rejects forged tickets or mismatched nonce without physical socket assumption", async () => {
      const forgedEngine: TransportDispatchEngine = {
        dispatch: async (): Promise<DispatchResult> => ({
          status: 200,
          statusText: "OK",
          headers: {},
          body: "{}",
          preconnectTicket: {
            ticketId: "fake-123",
            endpoint: "https://api.openai.com/v1/chat/completions",
            validatedIp: "93.184.216.34",
            issuedAt: Date.now(),
            nonce: "wrong-nonce",
          },
        }),
      };

      const transport = new DefaultSecureAiTransport({ engine: forgedEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(SsrfSecurityViolationError);
    });

    it("rejects preconnect validation for private RFC 1918 addresses", async () => {
      const privateEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          context.validatePreconnectIp("192.168.1.1");
          return {
            status: 200,
            statusText: "OK",
            headers: {},
            body: "{}",
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: privateEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(SsrfSecurityViolationError);
    });

    it("rejects preconnect when resolvedIp does not match validated ticket IP (DNS rebinding)", async () => {
      const rebindingEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 200,
            statusText: "OK",
            headers: {},
            body: "{}",
            resolvedIp: "127.0.0.1", // DNS rebinding mismatch
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: rebindingEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(/differs from pre-connect validated IP/);
    });

    it("rejects engine that claims preconnect validation without obtaining a coordinator ticket", async () => {
      const lateEngine: TransportDispatchEngine = {
        dispatch: async (): Promise<DispatchResult> => ({
          status: 200,
          statusText: "OK",
          headers: {},
          body: "{}",
          wasPreconnectValidated: true, // Claim without invoking validatePreconnectIp
        }),
      };

      const transport = new DefaultSecureAiTransport({ engine: lateEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(SsrfSecurityViolationError);
    });
  });

  describe("R3-03: Global Deadline Throughout Bounded Stream Consumption (P0)", () => {
    it("times out promptly when a stream never delivers chunks and cancels the stream", async () => {
      let wasCancelled = false;
      let cancelReason: string | undefined;

      const hangingStream = {
        chunks: {
          [Symbol.asyncIterator]() {
            return {
              next: () => new Promise<IteratorResult<Uint8Array>>(() => {}), // Never resolves
            };
          },
        },
        cancel: async (reason?: string) => {
          wasCancelled = true;
          cancelReason = reason;
        },
      };

      const streamEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            stream: hangingStream,
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: streamEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 35, // 35ms deadline
        provider: "openai",
      };

      const start = Date.now();
      await expect(transport.execute(req)).rejects.toThrow(TransportTimeoutError);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(120); // Terminated promptly under deadline, didn't hang
      expect(wasCancelled).toBe(true);
      expect(cancelReason).toBeDefined();
    });

    it("times out promptly when a stream stalls after the first chunk and cancels cooperatively", async () => {
      let wasCancelled = false;
      let chunkCount = 0;

      const stallAfterFirstStream = {
        chunks: {
          [Symbol.asyncIterator]() {
            return {
              next: async (): Promise<IteratorResult<Uint8Array>> => {
                chunkCount++;
                if (chunkCount === 1) {
                  return { done: false, value: new Uint8Array([1, 2, 3]) };
                }
                // Second chunk stalls forever
                return new Promise<IteratorResult<Uint8Array>>(() => {});
              },
            };
          },
        },
        cancel: async () => {
          wasCancelled = true;
        },
      };

      const streamEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            stream: stallAfterFirstStream,
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: streamEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 40,
        provider: "openai",
      };

      const start = Date.now();
      await expect(transport.execute(req)).rejects.toThrow(TransportTimeoutError);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(120);
      expect(wasCancelled).toBe(true);
    });

    it("aborts reading immediately when client signals abort during stream reading", async () => {
      let wasCancelled = false;
      const controller = new AbortController();

      const slowStream = createMockAsyncStream(["chunk1", "chunk2", "chunk3"], {
        chunkDelayMs: 50,
        onCancel: () => {
          wasCancelled = true;
        },
      });

      const streamEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            stream: slowStream,
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: streamEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        signal: controller.signal,
        provider: "openai",
      };

      setTimeout(() => controller.abort(), 20);

      const start = Date.now();
      await expect(transport.execute(req)).rejects.toThrow(TransportAbortError);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(120);
      expect(wasCancelled).toBe(true);
    });

    it("does not hang caller if stream.cancel() is slow or never resolves", async () => {
      const uncooperativeStream = {
        chunks: {
          [Symbol.asyncIterator]() {
            return {
              next: () => new Promise<IteratorResult<Uint8Array>>(() => {}),
            };
          },
        },
        cancel: () => new Promise<void>(() => {}), // Uncooperative cancel() hangs forever!
      };

      const streamEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            stream: uncooperativeStream,
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: streamEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 30,
        provider: "openai",
      };

      const start = Date.now();
      await expect(transport.execute(req)).rejects.toThrow(TransportTimeoutError);
      const elapsed = Date.now() - start;

      // Caller unblocked promptly despite uncooperative stream.cancel()
      expect(elapsed).toBeLessThan(150);
    });

    it("immediately cuts off stream exceeding 2 MiB memory limit and cancels", async () => {
      let wasCancelled = false;
      const bigChunks = [
        new Uint8Array(1024 * 1024), // 1 MiB
        new Uint8Array(1024 * 1024), // 2 MiB
        new Uint8Array(1024), // 2 MiB + 1 KiB -> Exceeded!
      ];

      const bigStream = createMockAsyncStream(bigChunks, {
        onCancel: () => {
          wasCancelled = true;
        },
      });

      const streamEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            stream: bigStream,
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: streamEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(TransportResponseSizeError);
      expect(wasCancelled).toBe(true);
    });

    it("decodes multi-byte UTF-8 split across chunk boundaries without corruption", async () => {
      const part1 = Buffer.from([0xc3]); // First half of 'ñ'
      const part2 = Buffer.from([0xb1, 0x20]); // Second half of 'ñ' + space
      const part3 = Buffer.from([0xf0, 0x9f]); // First half of '🚀'
      const part4 = Buffer.from([0x9a, 0x80]); // Second half of '🚀'

      const utf8Stream = createMockAsyncStream([part1, part2, part3, part4]);

      const streamEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "text/plain; charset=utf-8" },
            stream: utf8Stream,
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: streamEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      const res = await transport.execute(req);
      expect(res.body).toBe("ñ 🚀");
    });
  });

  describe("R3-04: HTTP Redirects Without Valid Location Validation (P1)", () => {
    it("rejects 302 redirect missing Location header with TransportRedirectError", async () => {
      const noLocationEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 302,
            statusText: "Found",
            headers: {}, // Missing Location!
            body: "",
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: noLocationEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(TransportRedirectError);
    });

    it("rejects 301 redirect with empty Location header with TransportRedirectError", async () => {
      const mockTransport = new MockAiTransport();
      mockTransport.setDefaultResponse({
        status: 301,
        statusText: "Moved Permanently",
        headers: { "location": "   " }, // Empty Location!
        body: "",
      });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(mockTransport.execute(req)).rejects.toThrow(TransportRedirectError);
    });

    it("rejects 303 redirect with malformed Location URL with SsrfSecurityViolationError", async () => {
      const mockTransport = new MockAiTransport();
      mockTransport.setDefaultResponse({
        status: 303,
        statusText: "See Other",
        headers: { "location": "http://[invalid:host:name" },
        body: "",
      });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(mockTransport.execute(req)).rejects.toThrow(SsrfSecurityViolationError);
    });

    it("rejects 307 redirect pointing to localhost with SsrfSecurityViolationError", async () => {
      const mockTransport = new MockAiTransport();
      mockTransport.setDefaultResponse({
        status: 307,
        statusText: "Temporary Redirect",
        headers: { "location": "http://localhost:8080/internal" },
        body: "",
      });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(mockTransport.execute(req)).rejects.toThrow(SsrfSecurityViolationError);
    });

    it("rejects 308 redirect pointing to cloud metadata with SsrfSecurityViolationError", async () => {
      const redirectEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 308,
            statusText: "Permanent Redirect",
            headers: { "location": "http://169.254.169.254/latest/meta-data" },
            body: "",
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: redirectEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(SsrfSecurityViolationError);
    });

    it("validates 302 redirect pointing to safe public HTTPS without auto-following", async () => {
      const mockTransport = new MockAiTransport();
      mockTransport.setDefaultResponse({
        status: 302,
        statusText: "Found",
        headers: { "location": "https://api.openai.com/v1/chat/completions-v2" },
        body: "Redirecting to v2",
      });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      const res = await mockTransport.execute(req);
      expect(res.status).toBe(302);
      expect(res.headers["location"]).toBe("https://api.openai.com/v1/chat/completions-v2");
    });

    it("does NOT require Location header for HTTP 304 Not Modified responses", async () => {
      const notModifiedEngine: TransportDispatchEngine = {
        dispatch: async (_req, context): Promise<DispatchResult> => {
          const preconnectTicket = context.validatePreconnectIp("93.184.216.34");
          return {
            status: 304,
            statusText: "Not Modified",
            headers: { "etag": '"v1-cached"' }, // 304 has no Location
            body: "",
            preconnectTicket,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: notModifiedEngine });
      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/models",
        method: "GET",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      const res = await transport.execute(req);
      expect(res.status).toBe(304);
      expect(res.headers["location"]).toBeUndefined();
    });
  });
});
