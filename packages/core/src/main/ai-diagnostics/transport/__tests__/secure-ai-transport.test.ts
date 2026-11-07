/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { MockAiTransport } from "../mock-ai-transport";
import {
  DefaultSecureAiTransport,
  type TransportDispatchEngine,
} from "../secure-ai-transport";
import type { AiTransportRequest, AiTransportHeaders } from "../ai-transport-types";
import {
  RealTransportDisabledError,
  TransportAbortError,
  TransportHttpError,
  TransportResponseSizeError,
  TransportTimeoutError,
  sanitizeSensitiveText,
} from "../ai-transport-errors";
import { SsrfSecurityViolationError } from "../ai-transport-errors";

describe("H8.8-01a: Secure AI Transport Contracts & Engine Tests", () => {
  describe("Secret Redaction & Error Sanitization", () => {
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
  });

  describe("MockAiTransport: Offline Simulation", () => {
    let mockTransport: MockAiTransport;

    beforeEach(() => {
      mockTransport = new MockAiTransport();
    });

    it("returns successful JSON response and records request with redacted secrets", async () => {
      mockTransport.setDefaultResponse({
        status: 200,
        body: JSON.stringify({ choices: [{ text: "synthetic-diagnosis" }] }),
      });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: {
          "authorization": "Bearer sk-test-key-12345678901234567890",
          "content-type": "application/json",
          "x-custom-trace": "trace-123",
        },
        body: JSON.stringify({ model: "gpt-4" }),
        timeoutMs: 5000,
        provider: "openai",
      };

      const res = await mockTransport.execute(req);
      expect(res.status).toBe(200);
      expect(res.json<{ choices: Array<{ text: string }> }>().choices[0].text).toBe("synthetic-diagnosis");
      expect(res.timing.durationMs).toBeGreaterThanOrEqual(0);

      // Verify request was recorded with secrets REDACTED
      expect(mockTransport.recordedRequests.length).toBe(1);
      const recorded = mockTransport.recordedRequests[0];
      expect(recorded.headers["authorization"]).toBe("[REDACTED]");
      expect(recorded.headers["x-custom-trace"]).toBe("trace-123");
    });

    it("enforces response size limit and throws TransportResponseSizeError", async () => {
      mockTransport.setDefaultResponse({
        status: 200,
        body: "A".repeat(5000), // 5000 bytes
      });

      const req: AiTransportRequest = {
        endpoint: "https://api.anthropic.com/v1/messages",
        method: "POST",
        headers: { "content-type": "application/json" },
        timeoutMs: 5000,
        maxResponseBytes: 1000, // limit to 1000 bytes
        provider: "anthropic",
      };

      await expect(mockTransport.execute(req)).rejects.toThrow(TransportResponseSizeError);
    });

    it("handles AbortSignal before request starts", async () => {
      const controller = new AbortController();
      controller.abort();

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        signal: controller.signal,
        provider: "openai",
      };

      await expect(mockTransport.execute(req)).rejects.toThrow(TransportAbortError);
    });

    it("handles AbortSignal mid-execution during simulated delay", async () => {
      mockTransport.setDefaultResponse({
        status: 200,
        body: "{}",
        delayMs: 200,
      });

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 20);

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        signal: controller.signal,
        provider: "openai",
      };

      await expect(mockTransport.execute(req)).rejects.toThrow(TransportAbortError);
    });

    it("throws TransportTimeoutError when delay exceeds timeoutMs", async () => {
      mockTransport.setDefaultResponse({
        status: 200,
        body: "{}",
        delayMs: 200,
      });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1",
        method: "POST",
        headers: {},
        timeoutMs: 50, // 50ms timeout < 200ms delay
        provider: "openai",
      };

      await expect(mockTransport.execute(req)).rejects.toThrow(TransportTimeoutError);
    });

    it("converts HTTP 4xx and 5xx to TransportHttpError without exposing credentials", async () => {
      mockTransport.setDefaultResponse({
        status: 401,
        statusText: "Unauthorized",
        body: JSON.stringify({ error: "Invalid API key sk-proj-12345678901234567890" }),
      });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1",
        method: "POST",
        headers: { "authorization": "Bearer sk-proj-12345678901234567890" },
        timeoutMs: 5000,
        provider: "openai",
      };

      try {
        await mockTransport.execute(req);
        fail("Should have thrown TransportHttpError");
      } catch (err: any) {
        expect(err).toBeInstanceOf(TransportHttpError);
        expect(err.status).toBe(401);
        expect(err.isRetryable).toBe(false);
        expect(err.message).not.toContain("sk-proj-12345678901234567890");
        expect(err.message).toContain("[REDACTED_API_KEY]");
      }
    });

    it("detects and blocks simulated DNS rebinding in MockAiTransport", async () => {
      mockTransport.setSimulatedResolvedIp("127.0.0.1");

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        provider: "openai",
      };

      await expect(mockTransport.execute(req)).rejects.toThrow(SsrfSecurityViolationError);
    });
  });

  describe("DefaultSecureAiTransport & Resilience Policy", () => {
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

    it("retries transient HTTP 429 errors up to maxRetries", async () => {
      let attempts = 0;

      const mockEngine: TransportDispatchEngine = {
        dispatch: async () => {
          attempts++;
          if (attempts < 3) {
            const retryHeaders: AiTransportHeaders = {
              "retry-after": "0",
              "content-type": "application/json",
            };

            return {
              status: 429,
              statusText: "Too Many Requests",
              headers: retryHeaders,
              body: JSON.stringify({ error: "rate limit exceeded" }),
            };
          }

          const successHeaders: AiTransportHeaders = {
            "content-type": "application/json",
          };

          return {
            status: 200,
            statusText: "OK",
            headers: successHeaders,
            body: JSON.stringify({ success: true }),
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: mockEngine });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        maxRetries: 2,
        provider: "openai",
      };

      const res = await transport.execute(req);
      expect(res.status).toBe(200);
      expect(attempts).toBe(3); // 1 initial + 2 retries
    });

    it("does NOT retry non-retryable 401 or 400 errors", async () => {
      let attempts = 0;

      const mockEngine: TransportDispatchEngine = {
        dispatch: async () => {
          attempts++;
          return {
            status: 401,
            statusText: "Unauthorized",
            headers: {},
            body: "Invalid credential",
          };
        },
      };

      const transport = new DefaultSecureAiTransport({ engine: mockEngine });

      const req: AiTransportRequest = {
        endpoint: "https://api.openai.com/v1",
        method: "POST",
        headers: {},
        timeoutMs: 5000,
        maxRetries: 2,
        provider: "openai",
      };

      await expect(transport.execute(req)).rejects.toThrow(TransportHttpError);
      expect(attempts).toBe(1); // No retries for 401
    });

    it("verifies resolved IP and blocks connection if engine resolves to a private IP", async () => {
      const rebindingEngine: TransportDispatchEngine = {
        dispatch: async () => {
          return {
            status: 200,
            statusText: "OK",
            headers: {},
            body: "{}",
            resolvedIp: "10.0.0.1", // Engine connected to internal IP
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
});
