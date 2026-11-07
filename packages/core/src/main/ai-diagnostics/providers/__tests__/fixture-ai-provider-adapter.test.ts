/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { MockAiTransport } from "../../transport/mock-ai-transport";
import { TransportPayloadValidationError, TransportHttpError } from "../../transport/ai-transport-errors";
import { FixtureAiProviderAdapter } from "../fixture-ai-provider-adapter";
import type { DiagnosisPromptContext, DiagnosisExecutionOptions } from "../ai-provider-adapter";
import type { Incident } from "../../../../common/incident/incident-types";
import {
  FIXTURE_CONCLUSIVE_JSON,
  FIXTURE_INCONCLUSIVE_JSON,
  FIXTURE_MALFORMED_JSON,
  FIXTURE_MISSING_FIELDS_JSON,
} from "../../fixtures";

describe("FixtureAiProviderAdapter", () => {
  let transport: MockAiTransport;
  let adapter: FixtureAiProviderAdapter;

  const mockIncident: Incident = {
    id: "inc-test-001",
    clusterId: "c-prod-1",
    namespace: "payments",
    workloadKind: "Deployment",
    workloadName: "payment-gateway",
    title: "CrashLoopBackOff in payment-gateway",
    severity: "high",
    status: "INVESTIGANDO",
    isPinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleContext: DiagnosisPromptContext = {
    incident: mockIncident,
    evidences: [
      {
        id: "evd-001",
        incidentId: "inc-test-001",
        clusterId: "c-prod-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "kubectl-logs",
        resourceKind: "Pod",
        resourceName: "payment-gateway-7f89d",
        contentSnippet: "Container terminated with exit code 137 OOMKilled",
        sha256Hash: "abcdef1234567890",
        fingerprint: "fp-001",
        snippetBytes: 48,
        capturedAt: new Date().toISOString(),
      },
    ],
  };

  const defaultOptions: DiagnosisExecutionOptions = {
    maxTokens: 2048,
    timeoutMs: 5000,
  };

  beforeEach(() => {
    transport = new MockAiTransport();
    adapter = new FixtureAiProviderAdapter(transport, {
      endpoint: "https://synthetic-ai.local/v1/diagnose",
      provider: "mock",
      model: "synthetic-fixture-v1",
    });
  });

  it("dispatches POST request through SecureAiTransport and returns normalized result", async () => {
    transport.setDefaultResponse({
      status: 200,
      headers: { "content-type": "application/json" },
      body: FIXTURE_CONCLUSIVE_JSON,
    });

    const result = await adapter.generateDiagnosis(sampleContext, defaultOptions);

    expect(result.status).toBe("CONCLUSIVE");
    expect(result.facts.length).toBe(2);
    expect(result.hypotheses[0].confidence).toBe(0.95);
    expect(result.tokenUsage.totalTokens).toBe(830);

    const recorded = transport.recordedRequests;
    expect(recorded.length).toBe(1);
    expect(recorded[0].method).toBe("POST");
    expect(recorded[0].endpoint).toBe("https://synthetic-ai.local/v1/diagnose");
  });

  it("returns normalized INCONCLUSO result when fixture is inconclusive", async () => {
    transport.setDefaultResponse({
      status: 200,
      headers: { "content-type": "application/json" },
      body: FIXTURE_INCONCLUSIVE_JSON,
    });

    const result = await adapter.generateDiagnosis(sampleContext, defaultOptions);

    expect(result.status).toBe("INCONCLUSO");
    expect(result.inconclusiveReason).toContain("Insufficient or conflicting evidence");
  });

  it("throws TransportPayloadValidationError when response is malformed JSON", async () => {
    transport.setDefaultResponse({
      status: 200,
      headers: { "content-type": "application/json" },
      body: FIXTURE_MALFORMED_JSON,
    });

    await expect(adapter.generateDiagnosis(sampleContext, defaultOptions)).rejects.toThrow(
      TransportPayloadValidationError,
    );
  });

  it("throws TransportPayloadValidationError when response is missing mandatory fields", async () => {
    transport.setDefaultResponse({
      status: 200,
      headers: { "content-type": "application/json" },
      body: FIXTURE_MISSING_FIELDS_JSON,
    });

    await expect(adapter.generateDiagnosis(sampleContext, defaultOptions)).rejects.toThrow(
      TransportPayloadValidationError,
    );
  });

  it("propagates TransportHttpError on upstream HTTP error status", async () => {
    transport.setDefaultResponse({
      status: 503,
      statusText: "Service Unavailable",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Upstream cluster overloaded" }),
    });

    await expect(adapter.generateDiagnosis(sampleContext, defaultOptions)).rejects.toThrow(
      TransportHttpError,
    );
  });

  it("enforces 0 retries on POST requests", async () => {
    transport.setDefaultResponse({
      status: 429,
      statusText: "Too Many Requests",
      headers: { "retry-after": "1" },
      body: JSON.stringify({ error: "Rate limit exceeded" }),
    });

    await expect(adapter.generateDiagnosis(sampleContext, defaultOptions)).rejects.toThrow(
      TransportHttpError,
    );

    // Strictly 1 attempt, zero retries
    expect(transport.recordedRequests.length).toBe(1);
  });

  it("does not retain cleartext prompt bodies in transport audit history", async () => {
    transport.setDefaultResponse({
      status: 200,
      headers: { "content-type": "application/json" },
      body: FIXTURE_CONCLUSIVE_JSON,
    });

    await adapter.generateDiagnosis(sampleContext, defaultOptions);

    const audit = transport.recordedRequests[0];
    expect(audit.hasBody).toBe(true);
    expect(audit.bodyBytes).toBeGreaterThan(0);
    // Request audit never stores cleartext body property
    expect((audit as unknown as Record<string, unknown>).body).toBeUndefined();
    expect(audit.bodySha256).toBeDefined();
  });
});
