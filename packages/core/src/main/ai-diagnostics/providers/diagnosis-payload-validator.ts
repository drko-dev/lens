/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { TransportPayloadValidationError } from "../transport/ai-transport-errors";
import type {
  RawDiagnosisResult,
  RawDiagnosisFact,
  RawDiagnosisHypothesis,
  RawRemediationProposal,
} from "./ai-provider-adapter";

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function isStringArray(val: unknown): val is string[] {
  return Array.isArray(val) && val.every((item) => typeof item === "string");
}

/**
 * Validates untrusted AI provider response payloads strictly at runtime.
 * Ensures the parsed JSON conforms precisely to RawDiagnosisResult without any type corruption,
 * malicious code injection, or structural omissions.
 */
export function validateRawDiagnosisResult(data: unknown): RawDiagnosisResult {
  if (!isRecord(data)) {
    throw new TransportPayloadValidationError("Response body must be a valid JSON object");
  }

  // 1. Status validation
  const status = data.status;
  if (status !== "CONCLUSIVE" && status !== "INCONCLUSO") {
    throw new TransportPayloadValidationError(
      `Invalid diagnostic status '${String(status)}'. Must be 'CONCLUSIVE' or 'INCONCLUSO'`,
    );
  }

  // 2. Inconclusive reason
  let inconclusiveReason: string | undefined;
  if (data.inconclusiveReason !== undefined) {
    if (typeof data.inconclusiveReason !== "string") {
      throw new TransportPayloadValidationError("Field 'inconclusiveReason' must be a string");
    }
    inconclusiveReason = data.inconclusiveReason;
  } else if (status === "INCONCLUSO") {
    inconclusiveReason = "Diagnóstico inconcluso por evidencias insuficientes.";
  }

  // 3. Facts validation
  if (!Array.isArray(data.facts)) {
    throw new TransportPayloadValidationError("Field 'facts' must be an array");
  }

  const facts: RawDiagnosisFact[] = [];
  for (let i = 0; i < data.facts.length; i++) {
    const f = data.facts[i];
    if (!isRecord(f)) {
      throw new TransportPayloadValidationError(`Fact at index ${i} must be an object`);
    }

    if (typeof f.text !== "string" || f.text.trim().length === 0) {
      throw new TransportPayloadValidationError(`Fact at index ${i} must contain a non-empty 'text' string`);
    }

    let citation: RawDiagnosisFact["citation"];
    if (f.citation !== undefined) {
      if (!isRecord(f.citation)) {
        throw new TransportPayloadValidationError(`Citation in fact at index ${i} must be an object`);
      }

      if (typeof f.citation.evidenceId !== "string" || f.citation.evidenceId.trim().length === 0) {
        throw new TransportPayloadValidationError(
          `Citation in fact at index ${i} must contain a non-empty 'evidenceId'`,
        );
      }

      if (f.citation.excerpt !== undefined && typeof f.citation.excerpt !== "string") {
        throw new TransportPayloadValidationError(
          `Citation excerpt in fact at index ${i} must be a string if defined`,
        );
      }

      if (f.citation.resourceKind !== undefined && typeof f.citation.resourceKind !== "string") {
        throw new TransportPayloadValidationError(
          `Citation resourceKind in fact at index ${i} must be a string if defined`,
        );
      }

      if (f.citation.resourceName !== undefined && typeof f.citation.resourceName !== "string") {
        throw new TransportPayloadValidationError(
          `Citation resourceName in fact at index ${i} must be a string if defined`,
        );
      }

      citation = {
        evidenceId: f.citation.evidenceId.trim(),
        excerpt: (f.citation.excerpt as string) || "",
        resourceKind: f.citation.resourceKind as string | undefined,
        resourceName: f.citation.resourceName as string | undefined,
      };
    }

    facts.push({
      text: f.text.trim(),
      citation,
    });
  }

  // 4. Hypotheses validation
  if (!Array.isArray(data.hypotheses)) {
    throw new TransportPayloadValidationError("Field 'hypotheses' must be an array");
  }

  const hypotheses: RawDiagnosisHypothesis[] = [];
  for (let i = 0; i < data.hypotheses.length; i++) {
    const h = data.hypotheses[i];
    if (!isRecord(h)) {
      throw new TransportPayloadValidationError(`Hypothesis at index ${i} must be an object`);
    }

    if (typeof h.id !== "string" || h.id.trim().length === 0) {
      throw new TransportPayloadValidationError(`Hypothesis at index ${i} must contain a non-empty 'id'`);
    }

    if (typeof h.title !== "string" || h.title.trim().length === 0) {
      throw new TransportPayloadValidationError(`Hypothesis at index ${i} must contain a non-empty 'title'`);
    }

    if (typeof h.confidence !== "number" || isNaN(h.confidence) || h.confidence < 0 || h.confidence > 1) {
      throw new TransportPayloadValidationError(
        `Hypothesis at index ${i} has invalid confidence '${String(h.confidence)}'. Must be a number between 0.0 and 1.0`,
      );
    }

    if (typeof h.rationale !== "string") {
      throw new TransportPayloadValidationError(`Hypothesis at index ${i} must contain a 'rationale' string`);
    }

    if (!Array.isArray(h.citationIds) || !h.citationIds.every((id) => typeof id === "string")) {
      throw new TransportPayloadValidationError(
        `Hypothesis at index ${i} must contain a 'citationIds' string array`,
      );
    }

    hypotheses.push({
      id: h.id.trim(),
      title: h.title.trim(),
      confidence: h.confidence,
      rationale: h.rationale.trim(),
      citationIds: (h.citationIds as string[]).map((id) => id.trim()),
    });
  }

  // 5. Contradictions, missingInformation, recommendedNextSteps
  if (!Array.isArray(data.contradictions) || !isStringArray(data.contradictions)) {
    throw new TransportPayloadValidationError("Field 'contradictions' must be an array of strings");
  }

  if (!Array.isArray(data.missingInformation) || !isStringArray(data.missingInformation)) {
    throw new TransportPayloadValidationError("Field 'missingInformation' must be an array of strings");
  }

  if (!Array.isArray(data.recommendedNextSteps) || !isStringArray(data.recommendedNextSteps)) {
    throw new TransportPayloadValidationError("Field 'recommendedNextSteps' must be an array of strings");
  }

  // 6. Optional Remediation Proposal
  let remediationProposal: RawRemediationProposal | undefined;
  if (data.remediationProposal !== undefined && data.remediationProposal !== null) {
    const r = data.remediationProposal;
    if (!isRecord(r)) {
      throw new TransportPayloadValidationError("Field 'remediationProposal' must be an object if present");
    }

    if (typeof r.id !== "string" || r.id.trim().length === 0) {
      throw new TransportPayloadValidationError("remediationProposal must contain a non-empty 'id'");
    }

    if (typeof r.title !== "string" || r.title.trim().length === 0) {
      throw new TransportPayloadValidationError("remediationProposal must contain a non-empty 'title'");
    }

    if (typeof r.problemSummary !== "string" || r.problemSummary.trim().length === 0) {
      throw new TransportPayloadValidationError("remediationProposal must contain a non-empty 'problemSummary'");
    }

    if (r.suggestedYamlDiff !== undefined && typeof r.suggestedYamlDiff !== "string") {
      throw new TransportPayloadValidationError("remediationProposal 'suggestedYamlDiff' must be a string");
    }

    if (r.suggestedConfigDescription !== undefined && typeof r.suggestedConfigDescription !== "string") {
      throw new TransportPayloadValidationError(
        "remediationProposal 'suggestedConfigDescription' must be a string",
      );
    }

    if (!Array.isArray(r.preconditions) || !isStringArray(r.preconditions)) {
      throw new TransportPayloadValidationError("remediationProposal 'preconditions' must be an array of strings");
    }

    if (typeof r.risksAndImpact !== "string") {
      throw new TransportPayloadValidationError("remediationProposal 'risksAndImpact' must be a string");
    }

    if (!Array.isArray(r.validationSteps) || !isStringArray(r.validationSteps)) {
      throw new TransportPayloadValidationError("remediationProposal 'validationSteps' must be an array of strings");
    }

    if (typeof r.rollbackProcedure !== "string") {
      throw new TransportPayloadValidationError("remediationProposal 'rollbackProcedure' must be a string");
    }

    remediationProposal = {
      id: r.id.trim(),
      title: r.title.trim(),
      problemSummary: r.problemSummary.trim(),
      suggestedYamlDiff: r.suggestedYamlDiff as string | undefined,
      suggestedConfigDescription: r.suggestedConfigDescription as string | undefined,
      preconditions: [...r.preconditions],
      risksAndImpact: r.risksAndImpact.trim(),
      validationSteps: [...r.validationSteps],
      rollbackProcedure: r.rollbackProcedure.trim(),
    };
  }

  // 7. Token Usage
  if (!isRecord(data.tokenUsage)) {
    throw new TransportPayloadValidationError("Field 'tokenUsage' must be an object");
  }

  const { promptTokens, completionTokens, totalTokens } = data.tokenUsage;
  if (
    typeof promptTokens !== "number" ||
    isNaN(promptTokens) ||
    promptTokens < 0 ||
    typeof completionTokens !== "number" ||
    isNaN(completionTokens) ||
    completionTokens < 0 ||
    typeof totalTokens !== "number" ||
    isNaN(totalTokens) ||
    totalTokens < 0
  ) {
    throw new TransportPayloadValidationError(
      "Field 'tokenUsage' must contain non-negative numbers for promptTokens, completionTokens, and totalTokens",
    );
  }

  return {
    status,
    inconclusiveReason,
    facts,
    hypotheses,
    contradictions: [...data.contradictions],
    missingInformation: [...data.missingInformation],
    recommendedNextSteps: [...data.recommendedNextSteps],
    remediationProposal,
    tokenUsage: {
      promptTokens: Math.floor(promptTokens),
      completionTokens: Math.floor(completionTokens),
      totalTokens: Math.floor(totalTokens),
    },
  };
}
