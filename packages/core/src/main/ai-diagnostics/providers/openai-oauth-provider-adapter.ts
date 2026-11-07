/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  OPENAI_SIWC_RESPONSES_ENDPOINT,
  validateAiEndpoint,
  type AiProviderProfile,
  type AiProviderType,
} from "../../../common/incident/ai-profile-types";
import { EvidenceSanitizer } from "../../incident-storage/evidence-sanitizer";
import { AiDiagnosisSecurityError } from "../ai-diagnosis-errors";
import type { OpenAiSiwcOAuthManager } from "../oauth/openai-siwc-oauth-manager";
import { TransportAbortError, TransportHttpError } from "../transport/ai-transport-errors";
import type { SecureAiTransport } from "../transport/ai-transport-types";
import type {
  AiProviderAdapter,
  DiagnosisExecutionOptions,
  DiagnosisPromptContext,
  RawDiagnosisResult,
} from "./ai-provider-adapter";
import { validateRawDiagnosisResult } from "./diagnosis-payload-validator";

export const CHATGPT_PLAN_MAX_OUTPUT_TOKENS = 4096;
export const CHATGPT_PLAN_MIN_OUTPUT_TOKENS = 256;
export const MAX_OPENAI_PAYLOAD_BYTES = 192 * 1024; // 196,608 bytes (192 KiB)

export interface ParsedOpenAiSseResult {
  outputText: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  responseId?: string;
}

/**
 * Parses a complete Server-Sent Events (SSE) stream from OpenAI `/v1/responses`.
 * Enforces that `response.completed` is received before accepting the output,
 * and detects quota exhaustion, errors, incomplete responses, and cancellations.
 */
export function parseOpenAiResponsesSseStream(
  rawSseBody: string,
  signal?: AbortSignal,
): ParsedOpenAiSseResult {
  if (signal?.aborted) {
    throw new TransportAbortError("OpenAI SSE stream processing aborted.");
  }

  if (!rawSseBody || typeof rawSseBody !== "string" || rawSseBody.trim().length === 0) {
    throw new AiDiagnosisSecurityError(
      "OPENAI_RESPONSE_INCOMPLETE",
      "El stream SSE de OpenAI está vacío y no contiene eventos.",
    );
  }

  const lines = rawSseBody.split(/\r?\n/);
  let currentEvent = "";
  let currentDataLines: string[] = [];

  const deltaChunks: string[] = [];
  let doneOutputText = "";
  let completedOutputText = "";
  let completedEventReceived = false;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let responseId: string | undefined;

  const processEventBlock = (eventName: string, dataPayload: string) => {
    if (signal?.aborted) {
      throw new TransportAbortError("OpenAI SSE stream aborted during event parsing.");
    }

    const trimmedData = dataPayload.trim();
    if (!trimmedData || trimmedData === "[DONE]") {
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmedData) as Record<string, unknown>;
    } catch {
      throw new AiDiagnosisSecurityError(
        "ERR_PAYLOAD_VALIDATION",
        "Evento JSON malformado recibido en el stream SSE de OpenAI.",
      );
    }

    const effectiveType =
      eventName || (typeof parsed.type === "string" ? parsed.type : "");

    if (effectiveType === "error" || effectiveType === "response.failed") {
      const errObj =
        (parsed.error as Record<string, unknown> | undefined) ??
        ((parsed.response as Record<string, unknown> | undefined)?.error as
          | Record<string, unknown>
          | undefined) ??
        parsed;
      const errCode = typeof errObj?.code === "string" ? errObj.code.toLowerCase() : "";
      const errType = typeof errObj?.type === "string" ? errObj.type.toLowerCase() : "";
      const errMsg = typeof errObj?.message === "string" ? errObj.message : "Error en stream de OpenAI";

      if (
        errCode.includes("quota") ||
        errCode.includes("rate_limit") ||
        errCode.includes("usage_limit") ||
        errType.includes("quota") ||
        errType.includes("usage_limit") ||
        errMsg.toLowerCase().includes("quota") ||
        errMsg.toLowerCase().includes("usage limit")
      ) {
        throw new AiDiagnosisSecurityError(
          "CHATGPT_QUOTA_EXHAUSTED",
          "Se alcanzó el límite de cuota del plan ChatGPT. No se realiza cambio automático de proveedor.",
        );
      }

      throw new AiDiagnosisSecurityError(
        "ERR_PAYLOAD_VALIDATION",
        "El servidor de OpenAI reportó un fallo durante el streaming de la respuesta.",
      );
    }

    if (effectiveType === "response.incomplete") {
      const reason =
        ((parsed.response as Record<string, unknown> | undefined)?.incomplete_details as
          | Record<string, unknown>
          | undefined)?.reason ?? "unknown";
      throw new AiDiagnosisSecurityError(
        "OPENAI_RESPONSE_INCOMPLETE",
        `La respuesta de OpenAI quedó incompleta ('response.incomplete', motivo: ${String(reason)}).`,
      );
    }

    if (effectiveType === "response.output_text.delta") {
      if (typeof parsed.delta === "string") {
        deltaChunks.push(parsed.delta);
      }
      return;
    }

    if (effectiveType === "response.output_text.done") {
      if (typeof parsed.text === "string") {
        doneOutputText = parsed.text;
      }
      return;
    }

    if (effectiveType === "response.completed") {
      const respObj = (parsed.response as Record<string, unknown> | undefined) ?? parsed;
      const status = typeof respObj.status === "string" ? respObj.status : "completed";

      if (status === "incomplete") {
        throw new AiDiagnosisSecurityError(
          "OPENAI_RESPONSE_INCOMPLETE",
          "El evento 'response.completed' indicó estado 'incomplete'.",
        );
      }
      if (status === "failed" || status === "cancelled") {
        throw new AiDiagnosisSecurityError(
          "OPENAI_RESPONSE_INCOMPLETE",
          `El evento 'response.completed' indicó estado no exitoso '${status}'.`,
        );
      }

      completedEventReceived = true;
      if (typeof respObj.id === "string") {
        responseId = respObj.id;
      }

      // Extract output text from response.output array if present
      if (typeof respObj.output_text === "string" && respObj.output_text.trim().length > 0) {
        completedOutputText = respObj.output_text;
      } else if (Array.isArray(respObj.output)) {
        const textParts: string[] = [];
        for (const item of respObj.output) {
          if (!item || typeof item !== "object") continue;
          const itemObj = item as Record<string, unknown>;
          if (Array.isArray(itemObj.content)) {
            for (const contentPart of itemObj.content) {
              if (
                contentPart &&
                typeof contentPart === "object" &&
                typeof (contentPart as Record<string, unknown>).text === "string"
              ) {
                textParts.push((contentPart as Record<string, unknown>).text as string);
              }
            }
          }
        }
        if (textParts.length > 0) {
          completedOutputText = textParts.join("");
        }
      }

      // Extract token usage
      const usage = respObj.usage as Record<string, unknown> | undefined;
      if (usage && typeof usage === "object") {
        const inTok =
          typeof usage.input_tokens === "number"
            ? usage.input_tokens
            : typeof usage.prompt_tokens === "number"
              ? usage.prompt_tokens
              : 0;
        const outTok =
          typeof usage.output_tokens === "number"
            ? usage.output_tokens
            : typeof usage.completion_tokens === "number"
              ? usage.completion_tokens
              : 0;
        const totTok =
          typeof usage.total_tokens === "number" ? usage.total_tokens : inTok + outTok;

        if (
          !Number.isSafeInteger(inTok) ||
          inTok < 0 ||
          !Number.isSafeInteger(outTok) ||
          outTok < 0 ||
          !Number.isSafeInteger(totTok) ||
          totTok < 0
        ) {
          throw new AiDiagnosisSecurityError(
            "ERR_PAYLOAD_VALIDATION",
            "Conteo de tokens inválido en 'response.completed' de OpenAI.",
          );
        }

        promptTokens = inTok;
        completionTokens = outTok;
        totalTokens = totTok;
      }
    }
  };

  for (const line of lines) {
    if (line.trim() === "") {
      if (currentEvent || currentDataLines.length > 0) {
        processEventBlock(currentEvent, currentDataLines.join("\n"));
        currentEvent = "";
        currentDataLines = [];
      }
      continue;
    }

    if (line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      currentEvent = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      currentDataLines.push(line.slice("data:".length).trim());
    }
  }

  if (currentEvent || currentDataLines.length > 0) {
    processEventBlock(currentEvent, currentDataLines.join("\n"));
  }

  if (!completedEventReceived) {
    throw new AiDiagnosisSecurityError(
      "OPENAI_RESPONSE_INCOMPLETE",
      "El stream SSE de OpenAI finalizó sin emitir el evento terminal obligatorio 'response.completed'.",
    );
  }

  const finalOutputText =
    deltaChunks.length > 0
      ? deltaChunks.join("")
      : doneOutputText || completedOutputText;

  if (!finalOutputText || finalOutputText.trim().length === 0) {
    throw new AiDiagnosisSecurityError(
      "OPENAI_RESPONSE_INCOMPLETE",
      "El evento 'response.completed' de OpenAI no produjo texto de diagnóstico.",
    );
  }

  return {
    outputText: finalOutputText,
    promptTokens,
    completionTokens,
    totalTokens,
    responseId,
  };
}

/**
 * Official OpenAI Sign in with ChatGPT (OAuth) Provider Adapter (H8.8-03a).
 * - Sends authorized requests exclusively to `https://api.openai.com/v1/responses`.
 * - Enforces `store: false` and `stream: true` on every request.
 * - Adapts diagnostic parameters to ChatGPT plan restrictions.
 * - Processes full SSE streaming until `response.completed`.
 * - Never falls back to API keys or alternative providers.
 */
export class OpenAiOAuthProviderAdapter implements AiProviderAdapter {
  public readonly provider: AiProviderType = "openai";

  constructor(
    private readonly profile: AiProviderProfile,
    private readonly oauthManager: OpenAiSiwcOAuthManager,
    private readonly transport: SecureAiTransport,
  ) {}

  public async generateDiagnosis(
    context: DiagnosisPromptContext,
    options: DiagnosisExecutionOptions,
  ): Promise<RawDiagnosisResult> {
    if (options.signal?.aborted) {
      throw new TransportAbortError("Diagnosis aborted before OpenAI OAuth dispatch.");
    }

    if (this.profile.authMode !== "oauth_siwc") {
      throw new AiDiagnosisSecurityError(
        "EXTERNAL_PROVIDER_DISABLED",
        "OpenAI requiere Sign in with ChatGPT (OAuth). El acceso directo por API key no está habilitado como mecanismo principal.",
      );
    }

    if (this.profile.availabilityStatus === "sin_permiso") {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_PERMISSION_DENIED",
        this.profile.unavailableReason ||
          "La cuenta de ChatGPT no posee los permisos 'resource.invoke' y 'chatgpt.tokens.use.direct'.",
      );
    }

    if (this.profile.availabilityStatus === "no_models_available") {
      throw new AiDiagnosisSecurityError(
        "OPENAI_MODELS_UNAVAILABLE",
        this.profile.unavailableReason ||
          "No hay modelos compatibles disponibles en la cuenta de ChatGPT autorizada.",
      );
    }

    // Validate target endpoint (always https://api.openai.com/v1/responses)
    const targetEndpoint = validateAiEndpoint(OPENAI_SIWC_RESPONSES_ENDPOINT, "openai");

    // Obtain valid OAuth access token (serialized refresh if expired)
    const accessToken = await this.oauthManager.ensureValidAccessToken(this.profile.id);

    // Adapt max_output_tokens to ChatGPT plan restrictions
    const adaptedMaxOutputTokens = Math.min(
      Math.max(options.maxTokens || 2048, CHATGPT_PLAN_MIN_OUTPUT_TOKENS),
      CHATGPT_PLAN_MAX_OUTPUT_TOKENS,
    );

    const filteredEvidences = context.evidences.filter(e => {
      if (!e.resourceKind) return true;
      const k = e.resourceKind.toLowerCase().trim();
      return !["secret", "serviceaccount", "secrets", "serviceaccounts"].includes(k);
    });

    // Build Responses API request body enforcing `store: false` and `stream: true`
    const requestBodyObject = {
      model: this.profile.model,
      store: false as const,
      stream: true as const,
      tool_choice: "none" as const,
      max_output_tokens: adaptedMaxOutputTokens,
      instructions:
        "You are NovaKube AI Incident Diagnostics. Return ONLY a strict JSON object matching the NovaKube diagnosis schema (status, facts, hypotheses, contradictions, missingInformation, recommendedNextSteps, remediationProposal, tokenUsage). Cite ONLY provided evidence IDs. Never invent evidence IDs or echo secrets.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                incident: {
                  id: context.incident.id,
                  clusterId: context.incident.clusterId,
                  namespace: context.incident.namespace,
                  workloadKind: context.incident.workloadKind,
                  workloadName: context.incident.workloadName,
                  title: context.incident.title,
                  severity: context.incident.severity,
                },
                evidences: filteredEvidences.map(ev => ({
                  id: ev.id,
                  type: ev.type,
                  resourceKind: ev.resourceKind,
                  resourceName: ev.resourceName,
                  contentSnippet: ev.contentSnippet,
                })),
                manualContexts: (context.manualContexts ?? []).map(mc => ({
                  id: mc.id,
                  filename: mc.filename,
                  fileType: mc.fileType,
                  sanitizedContent: mc.sanitizedContent,
                })),
              }),
            },
          ],
        },
      ],
    };

    const serializedBody = JSON.stringify(requestBodyObject);
    const payloadBytes = Buffer.byteLength(serializedBody, "utf8");

    if (payloadBytes > MAX_OPENAI_PAYLOAD_BYTES) {
      throw new AiDiagnosisSecurityError(
        "PAYLOAD_BUDGET_EXCEEDED",
        `El payload hacia OpenAI Responses (${payloadBytes} bytes) excede el límite estricto de ${MAX_OPENAI_PAYLOAD_BYTES} bytes (192 KiB).`,
      );
    }

    let response;
    try {
      options.onBeforeDispatch?.();
      response = await this.transport.execute({
        provider: "openai",
        endpoint: targetEndpoint,
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
          authorization: `Bearer ${accessToken}`,
          "x-novakube-incident-id": context.incident.id,
        },
        body: serializedBody,
        timeoutMs: options.timeoutMs,
        signal: options.signal,
        maxRetries: 0,
      });
    } catch (err) {
      if (err instanceof TransportHttpError) {
        const lowerSummary = (err.responseBodySummary || err.message || "").toLowerCase();
        if (
          err.status === 429 ||
          lowerSummary.includes("insufficient_quota") ||
          lowerSummary.includes("usage_limit") ||
          lowerSummary.includes("quota")
        ) {
          throw new AiDiagnosisSecurityError(
            "CHATGPT_QUOTA_EXHAUSTED",
            "Cuota de ChatGPT agotada (HTTP 429 / quota exceeded). No se realiza failover automático.",
          );
        }
        if (err.status === 401 || err.status === 403) {
          if (lowerSummary.includes("scope") || lowerSummary.includes("permission")) {
            throw new AiDiagnosisSecurityError(
              "OPENAI_OAUTH_PERMISSION_DENIED",
              "OpenAI rechazó la solicitud por falta de permisos OAuth ('resource.invoke' / 'chatgpt.tokens.use.direct').",
            );
          }
          throw new AiDiagnosisSecurityError(
            "OPENAI_OAUTH_SESSION_INVALID",
            `OpenAI rechazó las credenciales OAuth (HTTP ${err.status}).`,
          );
        }
      }
      throw err;
    }

    const sseParsed = parseOpenAiResponsesSseStream(response.body, options.signal);

    let parsedDiagnosisObj: Record<string, unknown>;
    try {
      parsedDiagnosisObj = JSON.parse(sseParsed.outputText) as Record<string, unknown>;
    } catch {
      throw new AiDiagnosisSecurityError(
        "ERR_PAYLOAD_VALIDATION",
        "El texto ensamblado del stream SSE de OpenAI no es un objeto JSON válido.",
      );
    }

    const existingTokenUsage =
      parsedDiagnosisObj.tokenUsage && typeof parsedDiagnosisObj.tokenUsage === "object"
        ? (parsedDiagnosisObj.tokenUsage as Record<string, unknown>)
        : undefined;

    const finalPromptTokens =
      sseParsed.promptTokens > 0
        ? sseParsed.promptTokens
        : typeof existingTokenUsage?.promptTokens === "number"
          ? existingTokenUsage.promptTokens
          : 0;
    const finalCompletionTokens =
      sseParsed.completionTokens > 0
        ? sseParsed.completionTokens
        : typeof existingTokenUsage?.completionTokens === "number"
          ? existingTokenUsage.completionTokens
          : 0;
    const finalTotalTokens =
      sseParsed.totalTokens > 0
        ? sseParsed.totalTokens
        : typeof existingTokenUsage?.totalTokens === "number"
          ? existingTokenUsage.totalTokens
          : finalPromptTokens + finalCompletionTokens;

    const enrichedPayload = {
      ...parsedDiagnosisObj,
      tokenUsage: {
        promptTokens: finalPromptTokens,
        completionTokens: finalCompletionTokens,
        totalTokens: finalTotalTokens,
      },
    };

    const validatedResult = validateRawDiagnosisResult(enrichedPayload);

    // Check diagnosis narrative text fields for reflected secrets or credentials
    const narrativeTexts: string[] = [
      validatedResult.inconclusiveReason ?? "",
      ...validatedResult.facts.flatMap(f => [f.text, f.citation?.excerpt ?? ""]),
      ...validatedResult.hypotheses.flatMap(h => [h.title, h.rationale]),
      ...validatedResult.contradictions,
      ...validatedResult.missingInformation,
      ...validatedResult.recommendedNextSteps,
      validatedResult.remediationProposal?.title ?? "",
      validatedResult.remediationProposal?.problemSummary ?? "",
      validatedResult.remediationProposal?.suggestedYamlDiff ?? "",
      validatedResult.remediationProposal?.suggestedConfigDescription ?? "",
      validatedResult.remediationProposal?.risksAndImpact ?? "",
      validatedResult.remediationProposal?.rollbackProcedure ?? "",
      ...(validatedResult.remediationProposal?.preconditions ?? []),
      ...(validatedResult.remediationProposal?.validationSteps ?? []),
    ];

    const reflectionCheck = EvidenceSanitizer.sanitize(narrativeTexts.join("\n"));
    if (reflectionCheck.redactionsCount > 0) {
      throw new AiDiagnosisSecurityError(
        "ERR_PAYLOAD_VALIDATION",
        "La respuesta de OpenAI fue rechazada porque contenía patrones de secretos o credenciales reflejadas.",
      );
    }

    // Verify citations against provided evidence IDs (defense-in-depth at adapter boundary)
    const validEvidenceIds = new Set(filteredEvidences.map(e => e.id));
    for (const fact of validatedResult.facts) {
      if (fact.citation && !validEvidenceIds.has(fact.citation.evidenceId)) {
        throw new AiDiagnosisSecurityError(
          "ERR_PAYLOAD_VALIDATION",
          "La respuesta de OpenAI incluyó citas a evidencias inexistentes o inventadas.",
        );
      }
    }
    for (const hyp of validatedResult.hypotheses) {
      for (const cid of hyp.citationIds) {
        if (!validEvidenceIds.has(cid)) {
          throw new AiDiagnosisSecurityError(
            "ERR_PAYLOAD_VALIDATION",
            "La respuesta de OpenAI incluyó hipótesis con citas inventadas.",
          );
        }
      }
    }

    return validatedResult;
  }
}
