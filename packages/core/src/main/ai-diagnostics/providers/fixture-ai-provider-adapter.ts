/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { AiProviderType } from "../../../common/incident/ai-profile-types";
import type { SecureAiTransport, AiTransportRequest } from "../transport/ai-transport-types";
import { TransportPayloadValidationError } from "../transport/ai-transport-errors";
import type {
  AiProviderAdapter,
  DiagnosisPromptContext,
  DiagnosisExecutionOptions,
  RawDiagnosisResult,
} from "./ai-provider-adapter";
import { validateRawDiagnosisResult } from "./diagnosis-payload-validator";

export interface FixtureAiProviderAdapterOptions {
  endpoint?: string;
  provider?: AiProviderType;
  model?: string;
}

/**
 * Fixture-backed AI Provider Adapter.
 * Connects the AI Diagnosis Engine to synthetic test responses via SecureAiTransport.
 * Performs strict runtime payload validation, guarantees 0 POST retries, and enforces
 * that AI-generated data is treated as untrusted passive facts without execution.
 */
export class FixtureAiProviderAdapter implements AiProviderAdapter {
  public readonly provider: AiProviderType;
  public readonly model: string;
  public readonly endpoint: string;

  constructor(
    private readonly transport: SecureAiTransport,
    options?: FixtureAiProviderAdapterOptions,
  ) {
    this.provider = options?.provider ?? "mock";
    this.model = options?.model ?? "synthetic-fixture-model-v1";
    this.endpoint = options?.endpoint ?? "https://synthetic-ai.local/v1/diagnose";
  }

  public async generateDiagnosis(
    context: DiagnosisPromptContext,
    options: DiagnosisExecutionOptions,
  ): Promise<RawDiagnosisResult> {
    // 1. Serialize prompt context strictly as passive data structure
    const payload = {
      incident: {
        id: context.incident.id,
        clusterId: context.incident.clusterId,
        namespace: context.incident.namespace,
        workloadKind: context.incident.workloadKind,
        workloadName: context.incident.workloadName,
        title: context.incident.title,
        severity: context.incident.severity,
      },
      evidences: context.evidences
        .filter((e) => {
          if (!e.resourceKind) return true;
          const k = e.resourceKind.toLowerCase().trim();
          return !["secret", "serviceaccount", "secrets", "serviceaccounts"].includes(k);
        })
        .map((e) => ({
        id: e.id,
        type: e.type,
        origin: e.origin,
        resourceKind: e.resourceKind,
        resourceName: e.resourceName,
        contentSnippet: e.contentSnippet,
        sha256Hash: e.sha256Hash,
      })),
      manualContexts: (context.manualContexts || []).map((m) => ({
        id: m.id,
        filename: m.filename,
        fileType: m.fileType,
        sanitizedContent: m.sanitizedContent,
      })),
      options: {
        maxTokens: options.maxTokens,
        timeoutMs: options.timeoutMs,
      },
    };

    const request: AiTransportRequest = {
      provider: this.provider,
      endpoint: this.endpoint,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
      },
      body: JSON.stringify(payload),
      timeoutMs: options.timeoutMs,
      signal: options.signal,
      maxRetries: 0, // R3-01: Zero retries on POST
    };

    // 2. Dispatch request via SecureAiTransport
    const response = await this.transport.execute(request);

    // 3. Safe JSON parsing with typed payload validation error (R1-03: prevent data leak in error)
    let rawJson: unknown;
    try {
      rawJson = response.json();
    } catch (_parseErr: unknown) {
      throw new TransportPayloadValidationError("AI provider returned invalid JSON.");
    }

    // 4. Strict runtime schema validation & normalization
    return validateRawDiagnosisResult(rawJson);
  }
}
