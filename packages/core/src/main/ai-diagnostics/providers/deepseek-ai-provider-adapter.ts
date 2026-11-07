/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  DEEPSEEK_EXCLUSIVE_ENDPOINT,
  validateAiEndpoint,
  type AiProviderProfile,
  type AiProviderType,
  type DeepSeekModelId,
  type DeepSeekPricingBand,
  type DeepSeekPricingConfig,
  type DeepSeekTokenUsageDetails,
} from "../../../common/incident/ai-profile-types";
import { EvidenceSanitizer } from "../../incident-storage/evidence-sanitizer";
import { AiDiagnosisSecurityError } from "../ai-diagnosis-errors";
import type { AiProfileManager } from "../ai-profile-manager";
import { TransportAbortError } from "../transport/ai-transport-errors";
import type { SecureAiTransport } from "../transport/ai-transport-types";
import type {
  AiProviderAdapter,
  DiagnosisExecutionOptions,
  DiagnosisPromptContext,
  RawDiagnosisResult,
} from "./ai-provider-adapter";
import { validateRawDiagnosisResult } from "./diagnosis-payload-validator";

export const ALLOWED_DEEPSEEK_MODELS: readonly DeepSeekModelId[] = [
  "deepseek-flash",
  "deepseek-v4-pro",
];

export const MAX_DEEPSEEK_PAYLOAD_BYTES = 192 * 1024; // 196,608 bytes (192 KiB)

/**
 * Current official DeepSeek API pricing table (USD per 1M tokens) from:
 * https://api-docs.deepseek.com/quick_start/pricing/
 *
 * - Peak hours (`standard`): Monday–Friday, 01:00–04:00 UTC and 06:00–10:00 UTC (excluding Chinese public holidays).
 * - Off-peak hours (`offPeakDiscount`): All other weekday hours, full weekends, and verified Chinese public holidays (50% of Peak).
 *
 * NOTE: All costs computed from this table are local referential estimates for operational visibility
 * and never constitute definitive provider billing.
 */
export const DEFAULT_DEEPSEEK_PRICING: Record<DeepSeekModelId, DeepSeekPricingConfig> = {
  "deepseek-flash": {
    currency: "USD",
    standard: {
      inputCacheHitPer1M: 0.006,
      inputCacheMissPer1M: 0.30,
      outputPer1M: 1.20,
      reasoningOutputPer1M: 1.20,
    },
    offPeakDiscount: {
      inputCacheHitPer1M: 0.003,
      inputCacheMissPer1M: 0.15,
      outputPer1M: 0.60,
      reasoningOutputPer1M: 0.60,
    },
    enableOffPeakBand: true,
  },
  "deepseek-v4-pro": {
    currency: "USD",
    standard: {
      inputCacheHitPer1M: 0.044,
      inputCacheMissPer1M: 1.32,
      outputPer1M: 3.96,
      reasoningOutputPer1M: 3.96,
    },
    offPeakDiscount: {
      inputCacheHitPer1M: 0.022,
      inputCacheMissPer1M: 0.66,
      outputPer1M: 1.98,
      reasoningOutputPer1M: 1.98,
    },
    enableOffPeakBand: true,
  },
};

export interface DeepSeekScheduleOptions {
  /**
   * Optional set or list of verified Chinese public holiday dates in UTC `YYYY-MM-DD` format.
   * When omitted or when a weekday date is not in this verified set, weekday peak windows
   * (`01:00–04:00` and `06:00–10:00` UTC) are conservatively treated as Peak (`standard`)
   * so expenditure is never underestimated.
   */
  verifiedChineseHolidaysUtc?: ReadonlySet<string> | readonly string[];
  /**
   * When true, forces conservative Peak (`standard`) estimation because holiday or tariff
   * information is unavailable or unverified.
   */
  unverifiedTariffOrHoliday?: boolean;
}

export interface DeepSeekExtendedDiagnosisResult extends RawDiagnosisResult {
  tokenUsageDetails: DeepSeekTokenUsageDetails;
  /** Referential estimated cost in USD (never definitive provider billing). */
  calculatedCostUsd: number;
}

function isVerifiedChineseHoliday(
  utcDateKey: string,
  holidays?: ReadonlySet<string> | readonly string[],
): boolean {
  if (!holidays) {
    return false;
  }
  if (holidays instanceof Set) {
    return holidays.has(utcDateKey);
  }
  if (Array.isArray(holidays)) {
    return holidays.includes(utcDateKey);
  }
  return false;
}

/**
 * Determines whether a given UTC timestamp falls within DeepSeek's Peak window:
 * - Monday through Friday (`utcDay` 1..5)
 * - `01:00–04:00` UTC (`[01:00:00.000, 04:00:00.000)`) or `06:00–10:00` UTC (`[06:00:00.000, 10:00:00.000)`)
 * - Excluding verified Chinese public holidays.
 *
 * If the timestamp is invalid or `unverifiedTariffOrHoliday` is set, returns `true` (Peak)
 * conservatively so cost is never underestimated.
 */
export function isDeepSeekPeakUtc(
  timestampMs: number,
  options?: DeepSeekScheduleOptions,
): boolean {
  if (
    typeof timestampMs !== "number" ||
    !Number.isFinite(timestampMs) ||
    options?.unverifiedTariffOrHoliday === true
  ) {
    return true;
  }

  const d = new Date(timestampMs);
  if (Number.isNaN(d.getTime())) {
    return true;
  }

  const utcDay = d.getUTCDay();
  // Saturday (6) and Sunday (0) are always off-peak (valle)
  if (utcDay === 0 || utcDay === 6) {
    return false;
  }

  const msIntoDay =
    ((d.getUTCHours() * 60 + d.getUTCMinutes()) * 60 + d.getUTCSeconds()) * 1000 +
    d.getUTCMilliseconds();

  const H01 = 1 * 3600 * 1000; // 01:00:00.000 UTC
  const H04 = 4 * 3600 * 1000; // 04:00:00.000 UTC
  const H06 = 6 * 3600 * 1000; // 06:00:00.000 UTC
  const H10 = 10 * 3600 * 1000; // 10:00:00.000 UTC

  const inPeakWindow1 = msIntoDay >= H01 && msIntoDay < H04;
  const inPeakWindow2 = msIntoDay >= H06 && msIntoDay < H10;

  if (!inPeakWindow1 && !inPeakWindow2) {
    return false;
  }

  const utcDateKey = d.toISOString().slice(0, 10);
  if (isVerifiedChineseHoliday(utcDateKey, options?.verifiedChineseHolidaysUtc)) {
    return false;
  }

  return true;
}

/**
 * Determines whether a given UTC timestamp falls within DeepSeek's Off-Peak (valle) window.
 * Returns `false` (conservatively assuming Peak) when the timestamp is invalid or tariff/holiday data is unverified.
 */
export function isDeepSeekOffPeakUtc(
  timestampMs: number,
  options?: DeepSeekScheduleOptions,
): boolean {
  return !isDeepSeekPeakUtc(timestampMs, options);
}

/**
 * Calculates a referential USD cost estimate (never definitive billing) for a DeepSeek request differentiating:
 * - Prompt cache hit vs. cache miss input tokens
 * - Output completion vs. reasoning tokens
 * - Peak (`standard`) vs. Off-Peak (`off_peak`) UTC bands
 *
 * When `timestampMs` is omitted, invalid, or tariff/holiday data is unverified, conservatively uses
 * the Peak (`standard`) band so expenditure is never underestimated.
 */
export function calculateDeepSeekCostUsd(
  usage: DeepSeekTokenUsageDetails,
  pricing: DeepSeekPricingConfig,
  timestampMs?: number,
  scheduleOptions?: DeepSeekScheduleOptions,
): { costUsd: number; bandUsed: "standard" | "off_peak"; isEstimatedReferential: true } {
  const hasValidTimestamp = typeof timestampMs === "number" && Number.isFinite(timestampMs);
  const canUseOffPeak =
    hasValidTimestamp &&
    Boolean(pricing.enableOffPeakBand && pricing.offPeakDiscount) &&
    !pricing.unverifiedTariff &&
    !scheduleOptions?.unverifiedTariffOrHoliday &&
    isDeepSeekOffPeakUtc(timestampMs!, scheduleOptions);

  const activeBand: DeepSeekPricingBand =
    canUseOffPeak && pricing.offPeakDiscount ? pricing.offPeakDiscount : pricing.standard;

  const hitCost = (usage.promptCacheHitTokens / 1_000_000) * activeBand.inputCacheHitPer1M;
  const missCost = (usage.promptCacheMissTokens / 1_000_000) * activeBand.inputCacheMissPer1M;

  const nonReasoningCompletion = Math.max(0, usage.completionTokens - usage.reasoningTokens);
  const reasoningRate = activeBand.reasoningOutputPer1M ?? activeBand.outputPer1M;

  const regularOutputCost = (nonReasoningCompletion / 1_000_000) * activeBand.outputPer1M;
  const reasoningOutputCost = (usage.reasoningTokens / 1_000_000) * reasoningRate;

  const totalCost = hitCost + missCost + regularOutputCost + reasoningOutputCost;
  const roundedCost = Math.round(totalCost * 1_000_000) / 1_000_000;

  return {
    costUsd: roundedCost,
    bandUsed: canUseOffPeak ? "off_peak" : "standard",
    isEstimatedReferential: true,
  };
}

/**
 * Computes a conservative pre-dispatch upper-bound cost estimate in USD that NEVER underestimates
 * potential spend:
 * - Assumes worst-case tokenization density (`ceil(payloadBytes / 2)` input tokens).
 * - Assumes 0% cache hits (`100%` cache miss rate).
 * - Assumes 100% of `maxOutputTokens` are generated at the highest output/reasoning rate.
 * - Always uses Peak (`standard`) band rates (falling back to `deepseek-v4-pro` Peak if model is unknown).
 */
export function estimateConservativePreDispatchDeepSeekMaxCostUsd(params: {
  model: string;
  payloadBytes: number;
  maxOutputTokens: number;
  pricing?: DeepSeekPricingConfig;
}): {
  estimatedMaxInputTokens: number;
  maxOutputTokens: number;
  conservativeMaxCostUsd: number;
  bandAssumed: "standard";
} {
  const effectivePricing =
    params.pricing ??
    (params.model === "deepseek-flash"
      ? DEFAULT_DEEPSEEK_PRICING["deepseek-flash"]
      : DEFAULT_DEEPSEEK_PRICING["deepseek-v4-pro"]);

  const peakBand = effectivePricing.standard;
  const safePayloadBytes = Math.max(0, Math.ceil(params.payloadBytes || 0));
  const estimatedMaxInputTokens = Math.max(1, Math.ceil(safePayloadBytes / 2));
  const safeMaxOutputTokens = Math.max(1, Math.ceil(params.maxOutputTokens || 4096));

  const maxInputRatePer1M = Math.max(peakBand.inputCacheMissPer1M, peakBand.inputCacheHitPer1M);
  const maxOutputRatePer1M = Math.max(
    peakBand.outputPer1M,
    peakBand.reasoningOutputPer1M ?? peakBand.outputPer1M,
  );

  const rawMaxCost =
    (estimatedMaxInputTokens / 1_000_000) * maxInputRatePer1M +
    (safeMaxOutputTokens / 1_000_000) * maxOutputRatePer1M;

  const conservativeMaxCostUsd = Math.ceil(rawMaxCost * 1_000_000) / 1_000_000;

  return {
    estimatedMaxInputTokens,
    maxOutputTokens: safeMaxOutputTokens,
    conservativeMaxCostUsd,
    bandAssumed: "standard",
  };
}

/**
 * Extracts and validates DeepSeek token usage (input, cache hit/miss, output, and reasoning tokens)
 * from a `/responses` JSON payload.
 */
export function extractDeepSeekUsageDetails(
  rawResponse: Record<string, unknown>,
  pricingBandUsed: "standard" | "off_peak" = "standard",
): DeepSeekTokenUsageDetails {
  const usageObj =
    (rawResponse.usage as Record<string, unknown> | undefined) ??
    (rawResponse.tokenUsage as Record<string, unknown> | undefined) ??
    rawResponse;

  const promptTokens =
    typeof usageObj.input_tokens === "number"
      ? usageObj.input_tokens
      : typeof usageObj.prompt_tokens === "number"
        ? usageObj.prompt_tokens
        : typeof usageObj.promptTokens === "number"
          ? usageObj.promptTokens
          : 0;

  const completionTokens =
    typeof usageObj.output_tokens === "number"
      ? usageObj.output_tokens
      : typeof usageObj.completion_tokens === "number"
        ? usageObj.completion_tokens
        : typeof usageObj.completionTokens === "number"
          ? usageObj.completionTokens
          : 0;

  const inputDetails =
    (usageObj.input_tokens_details as Record<string, unknown> | undefined) ??
    (usageObj.prompt_tokens_details as Record<string, unknown> | undefined);

  const outputDetails =
    (usageObj.output_tokens_details as Record<string, unknown> | undefined) ??
    (usageObj.completion_tokens_details as Record<string, unknown> | undefined);

  const rawCacheHit =
    typeof usageObj.prompt_cache_hit_tokens === "number"
      ? usageObj.prompt_cache_hit_tokens
      : typeof inputDetails?.cached_tokens === "number"
        ? inputDetails.cached_tokens
        : 0;

  const rawCacheMiss =
    typeof usageObj.prompt_cache_miss_tokens === "number"
      ? usageObj.prompt_cache_miss_tokens
      : Math.max(0, promptTokens - rawCacheHit);

  const reasoningTokens =
    typeof outputDetails?.reasoning_tokens === "number"
      ? outputDetails.reasoning_tokens
      : typeof usageObj.reasoning_tokens === "number"
        ? usageObj.reasoning_tokens
        : 0;

  const totalTokens =
    typeof usageObj.total_tokens === "number"
      ? usageObj.total_tokens
      : typeof usageObj.totalTokens === "number"
        ? usageObj.totalTokens
        : promptTokens + completionTokens;

  for (const val of [
    promptTokens,
    rawCacheHit,
    rawCacheMiss,
    completionTokens,
    reasoningTokens,
    totalTokens,
  ]) {
    if (typeof val !== "number" || !Number.isSafeInteger(val) || val < 0) {
      throw new AiDiagnosisSecurityError(
        "ERR_PAYLOAD_VALIDATION",
        "Conteo de tokens inválido o negativo en la respuesta de DeepSeek.",
      );
    }
  }

  return {
    promptTokens,
    promptCacheHitTokens: rawCacheHit,
    promptCacheMissTokens: rawCacheMiss,
    completionTokens,
    reasoningTokens,
    totalTokens,
    pricingBandUsed,
  };
}

/**
 * Independent DeepSeek Responses API Provider Adapter (H8.8-03b).
 * - Exclusive endpoint: `https://api.deepseek.com/responses`.
 * - Supported models: `deepseek-flash` (initial default) and `deepseek-v4-pro` (advanced).
 * - Bearer authentication via API key retrieved from `SecureCredentialVault`.
 * - Accounts for input (cache hit/miss), output, and reasoning tokens.
 * - Configurable referential tariff estimator with cache and UTC peak/off-peak differentiation.
 * - Zero automatic POST retries, zero external tools, zero automatic executions.
 */
export class DeepSeekAiProviderAdapter implements AiProviderAdapter {
  public readonly provider: AiProviderType = "deepseek";
  private pricingOverrides = new Map<string, DeepSeekPricingConfig>();
  private lastUsageDetails?: DeepSeekTokenUsageDetails;
  private lastCalculatedCostUsd?: number;
  private lastPreDispatchConservativeMaxCostUsd?: number;
  private readonly clockFn: () => number;
  private readonly scheduleOptions?: DeepSeekScheduleOptions;

  constructor(
    private readonly profile: AiProviderProfile,
    private readonly profileManager: AiProfileManager,
    private readonly transport: SecureAiTransport,
    options?: {
      pricingConfig?: Partial<Record<DeepSeekModelId, DeepSeekPricingConfig>>;
      clockFn?: () => number;
      scheduleOptions?: DeepSeekScheduleOptions;
    },
  ) {
    this.clockFn = options?.clockFn ?? (() => Date.now());
    this.scheduleOptions = options?.scheduleOptions;
    if (options?.pricingConfig) {
      for (const [modelId, cfg] of Object.entries(options.pricingConfig)) {
        if (cfg) {
          this.pricingOverrides.set(modelId, cfg);
        }
      }
    }
  }

  public setPricingConfig(modelId: string, config: DeepSeekPricingConfig): void {
    this.pricingOverrides.set(modelId, config);
  }

  /**
   * Returns the pricing configuration for the given model.
   * For unknown models without verified tariff overrides, conservatively returns `deepseek-v4-pro`
   * with `unverifiedTariff: true` so cost is never underestimated.
   */
  public getPricingConfig(modelId: string): DeepSeekPricingConfig {
    const override = this.pricingOverrides.get(modelId);
    if (override) {
      return override;
    }
    if (modelId === "deepseek-flash") {
      return DEFAULT_DEEPSEEK_PRICING["deepseek-flash"];
    }
    if (modelId === "deepseek-v4-pro") {
      return DEFAULT_DEEPSEEK_PRICING["deepseek-v4-pro"];
    }
    return {
      ...DEFAULT_DEEPSEEK_PRICING["deepseek-v4-pro"],
      unverifiedTariff: true,
    };
  }

  public getLastUsageDetails(): DeepSeekTokenUsageDetails | undefined {
    return this.lastUsageDetails;
  }

  public getLastCalculatedCostUsd(): number | undefined {
    return this.lastCalculatedCostUsd;
  }

  public getLastPreDispatchConservativeMaxCostUsd(): number | undefined {
    return this.lastPreDispatchConservativeMaxCostUsd;
  }

  public async generateDiagnosis(
    context: DiagnosisPromptContext,
    options: DiagnosisExecutionOptions,
  ): Promise<DeepSeekExtendedDiagnosisResult> {
    if (options.signal?.aborted) {
      throw new TransportAbortError("Diagnosis aborted before DeepSeek dispatch.");
    }

    if (this.profile.provider !== "deepseek") {
      throw new AiDiagnosisSecurityError(
        "ERR_SCOPE_MISMATCH",
        `DeepSeekAiProviderAdapter requiere un perfil con provider 'deepseek', recibido '${this.profile.provider}'.`,
      );
    }

    if (!(ALLOWED_DEEPSEEK_MODELS as readonly string[]).includes(this.profile.model)) {
      throw new AiDiagnosisSecurityError(
        "ERR_PAYLOAD_VALIDATION",
        `Modelo DeepSeek '${this.profile.model}' no soportado. Modelos permitidos: ${ALLOWED_DEEPSEEK_MODELS.join(", ")}.`,
      );
    }

    // Strictly enforce exclusive endpoint https://api.deepseek.com/responses
    const validatedEndpoint = validateAiEndpoint(
      this.profile.endpoint || DEEPSEEK_EXCLUSIVE_ENDPOINT,
      "deepseek",
    );

    if (validatedEndpoint !== DEEPSEEK_EXCLUSIVE_ENDPOINT) {
      throw new AiDiagnosisSecurityError(
        "ERR_PAYLOAD_VALIDATION",
        `DeepSeek requiere exclusivamente el endpoint '${DEEPSEEK_EXCLUSIVE_ENDPOINT}'.`,
      );
    }

    // Retrieve encrypted Bearer API key from SecureCredentialVault
    const apiKey = await this.profileManager.getApiKeyForProfile(this.profile.id);
    if (!apiKey || apiKey.trim().length === 0) {
      throw new AiDiagnosisSecurityError(
        "PROFILE_INACTIVE",
        "La API key de DeepSeek en SecureCredentialVault está vacía o no disponible.",
      );
    }

    const filteredEvidences = context.evidences.filter(e => {
      if (!e.resourceKind) return true;
      const k = e.resourceKind.toLowerCase().trim();
      return !["secret", "serviceaccount", "secrets", "serviceaccounts"].includes(k);
    });

    const maxOutputTokens = Math.min(Math.max(options.maxTokens || 4096, 256), 8192);

    // Build DeepSeek Create Response payload without external tools or automatic execution
    const requestBodyObject = {
      model: this.profile.model,
      stream: false as const,
      max_output_tokens: maxOutputTokens,
      instructions:
        "You are NovaKube AI Incident Diagnostics. Respond ONLY with a valid JSON object matching the NovaKube diagnosis schema. Cite ONLY provided evidence IDs. Never invent citations or echo secrets.",
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

    if (payloadBytes > MAX_DEEPSEEK_PAYLOAD_BYTES) {
      throw new AiDiagnosisSecurityError(
        "PAYLOAD_BUDGET_EXCEEDED",
        `El payload hacia DeepSeek (${payloadBytes} bytes) supera el límite estricto de ${MAX_DEEPSEEK_PAYLOAD_BYTES} bytes (192 KiB).`,
      );
    }

    // R1-05: Compute conservative pre-dispatch upper-bound cost (100% cache miss, Peak band, full maxOutputTokens)
    const pricing = this.getPricingConfig(this.profile.model);
    const preDispatchConservative = estimateConservativePreDispatchDeepSeekMaxCostUsd({
      model: this.profile.model,
      payloadBytes,
      maxOutputTokens,
      pricing,
    });
    this.lastPreDispatchConservativeMaxCostUsd = preDispatchConservative.conservativeMaxCostUsd;

    // Dispatch with maxRetries: 0 (no automatic POST retries)
    options.onBeforeDispatch?.();
    const response = await this.transport.execute({
      provider: "deepseek",
      endpoint: DEEPSEEK_EXCLUSIVE_ENDPOINT,
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${apiKey.trim()}`,
        "x-novakube-incident-id": context.incident.id,
      },
      body: serializedBody,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
      maxRetries: 0,
    });

    let rawJson: Record<string, unknown>;
    try {
      rawJson = response.json<Record<string, unknown>>();
    } catch {
      throw new AiDiagnosisSecurityError(
        "ERR_PAYLOAD_VALIDATION",
        "La respuesta de DeepSeek no es un JSON válido.",
      );
    }

    if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) {
      throw new AiDiagnosisSecurityError(
        "ERR_PAYLOAD_VALIDATION",
        "La respuesta de DeepSeek debe ser un objeto JSON estructurado.",
      );
    }

    // Support both direct structured JSON and `/responses` envelope (`output_text` or `output[].content[].text`)
    let diagnosisObject: Record<string, unknown> = rawJson;
    if (typeof rawJson.output_text === "string" && rawJson.output_text.trim().length > 0) {
      try {
        diagnosisObject = JSON.parse(rawJson.output_text) as Record<string, unknown>;
      } catch {
        throw new AiDiagnosisSecurityError(
          "ERR_PAYLOAD_VALIDATION",
          "El campo 'output_text' de DeepSeek no contiene un JSON de diagnóstico válido.",
        );
      }
    } else if (Array.isArray(rawJson.output) && !Array.isArray(rawJson.hypotheses)) {
      const textParts: string[] = [];
      for (const item of rawJson.output) {
        if (!item || typeof item !== "object") continue;
        const itemObj = item as Record<string, unknown>;
        if (itemObj.type === "message" && Array.isArray(itemObj.content)) {
          for (const part of itemObj.content) {
            if (
              part &&
              typeof part === "object" &&
              typeof (part as Record<string, unknown>).text === "string"
            ) {
              textParts.push((part as Record<string, unknown>).text as string);
            }
          }
        }
      }
      if (textParts.length > 0) {
        try {
          diagnosisObject = JSON.parse(textParts.join("")) as Record<string, unknown>;
        } catch {
          throw new AiDiagnosisSecurityError(
            "ERR_PAYLOAD_VALIDATION",
            "El bloque 'output' de DeepSeek no contiene un JSON de diagnóstico válido.",
          );
        }
      }
    }

    const nowMs = this.clockFn();
    const initialBand =
      pricing.enableOffPeakBand &&
      pricing.offPeakDiscount &&
      !pricing.unverifiedTariff &&
      isDeepSeekOffPeakUtc(nowMs, this.scheduleOptions)
        ? "off_peak"
        : "standard";

    const usageDetails = extractDeepSeekUsageDetails(rawJson, initialBand);
    const { costUsd, bandUsed } = calculateDeepSeekCostUsd(
      usageDetails,
      pricing,
      nowMs,
      this.scheduleOptions,
    );
    usageDetails.pricingBandUsed = bandUsed;

    this.lastUsageDetails = usageDetails;
    this.lastCalculatedCostUsd = costUsd;

    const enrichedDiagnosis = {
      ...diagnosisObject,
      tokenUsage: {
        promptTokens: usageDetails.promptTokens,
        completionTokens: usageDetails.completionTokens,
        totalTokens: usageDetails.totalTokens,
      },
    };

    const validatedResult = validateRawDiagnosisResult(enrichedDiagnosis);

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
        "La respuesta de DeepSeek fue rechazada porque contenía patrones de secretos o credenciales reflejadas.",
      );
    }

    // Verify citations against provided evidence IDs
    const validEvidenceIds = new Set(filteredEvidences.map(e => e.id));
    for (const fact of validatedResult.facts) {
      if (fact.citation && !validEvidenceIds.has(fact.citation.evidenceId)) {
        throw new AiDiagnosisSecurityError(
          "ERR_PAYLOAD_VALIDATION",
          "La respuesta de DeepSeek incluyó citas a evidencias inexistentes o inventadas.",
        );
      }
    }
    for (const hyp of validatedResult.hypotheses) {
      for (const cid of hyp.citationIds) {
        if (!validEvidenceIds.has(cid)) {
          throw new AiDiagnosisSecurityError(
            "ERR_PAYLOAD_VALIDATION",
            "La respuesta de DeepSeek incluyó hipótesis con citas inventadas.",
          );
        }
      }
    }

    return {
      ...validatedResult,
      tokenUsageDetails: usageDetails,
      calculatedCostUsd: costUsd,
    };
  }
}
