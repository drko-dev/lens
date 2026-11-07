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
  TransportResponseSizeError,
  TransportTimeoutError,
  sanitizeSensitiveText,
} from "../ai-transport-errors";
import { SsrfSecurityViolationError } from "../ai-transport-errors";
import { parseRetryAfterHeader } from "../ai-transport-types";

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
          return new Promise<DispatchResult>((resolve, reject) => {
            const timer = setTimeout(() => {
              resolve({
                status: 200,
                statusText: "OK",
                headers: {},
                body: "{}",
                wasPreconnectValidated: true,
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
        dispatch: async () => {
          attempts++;
          return {
            status: 429,
            statusText: "Too Many Requests",
            headers: { "retry-after": "5" }, // 5 seconds requested
            body: "rate limited",
            wasPreconnectValidated: true,
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: rateLimitEngine });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1",
        method: "POST",
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
          context.validatePreconnectIp("93.184.216.34"); // Public IP

          return {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ success: true }),
            resolvedIp: "93.184.216.34",
            wasPreconnectValidated: true,
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
          context.validatePreconnectIp("10.0.0.1");

          return {
            status: 200,
            statusText: "OK",
            headers: {},
            body: "{}",
            resolvedIp: "10.0.0.1",
            wasPreconnectValidated: true,
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
        dispatch: async () => ({
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ synthetic: true }),
          wasPreconnectValidated: true,
        }),
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
});
