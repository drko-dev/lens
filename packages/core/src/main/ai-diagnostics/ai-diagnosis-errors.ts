/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export class AiDiagnosisSecurityError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "AiDiagnosisSecurityError";
  }
}

export type SafeAiFailureCode =
  | "ERR_TIMEOUT"
  | "ERR_ABORTED"
  | "ERR_HTTP_429"
  | "ERR_HTTP_5XX"
  | "ERR_HTTP_4XX"
  | "ERR_NETWORK"
  | "ERR_PAYLOAD_VALIDATION"
  | "ERR_PAYLOAD_TOO_LARGE"
  | "ERR_TOKEN_BUDGET_EXCEEDED"
  | "ERR_BUDGET_EXCEEDED"
  | "ERR_CONSENT_INVALID"
  | "ERR_CONSENT_EXPIRED"
  | "ERR_CONSENT_MISMATCH"
  | "ERR_SCOPE_MISMATCH"
  | "ERR_INCIDENT_CLOSED"
  | "ERR_PROFILE_INACTIVE"
  | "ERR_PROFILE_ALTERED"
  | "ERR_EXTERNAL_PROVIDER_DISABLED"
  | "ERR_OPERATION_DUPLICATE"
  | "ERR_UNKNOWN";

export const ALLOWED_SAFE_FAILURE_CODES: readonly SafeAiFailureCode[] = [
  "ERR_TIMEOUT",
  "ERR_ABORTED",
  "ERR_HTTP_429",
  "ERR_HTTP_5XX",
  "ERR_HTTP_4XX",
  "ERR_NETWORK",
  "ERR_PAYLOAD_VALIDATION",
  "ERR_PAYLOAD_TOO_LARGE",
  "ERR_TOKEN_BUDGET_EXCEEDED",
  "ERR_BUDGET_EXCEEDED",
  "ERR_CONSENT_INVALID",
  "ERR_CONSENT_EXPIRED",
  "ERR_CONSENT_MISMATCH",
  "ERR_SCOPE_MISMATCH",
  "ERR_INCIDENT_CLOSED",
  "ERR_PROFILE_INACTIVE",
  "ERR_PROFILE_ALTERED",
  "ERR_EXTERNAL_PROVIDER_DISABLED",
  "ERR_OPERATION_DUPLICATE",
  "ERR_UNKNOWN",
];

export function isSafeAiFailureCode(code: unknown): code is SafeAiFailureCode {
  return typeof code === "string" && (ALLOWED_SAFE_FAILURE_CODES as readonly string[]).includes(code);
}

export function classifyErrorToSafeCode(err: unknown): SafeAiFailureCode {
  if (!err) return "ERR_UNKNOWN";

  if (err instanceof AiDiagnosisSecurityError) {
    switch (err.code) {
      case "INVALID_CONSENT_TOKEN":
        return "ERR_CONSENT_INVALID";
      case "EXPIRED_CONSENT_TOKEN":
        return "ERR_CONSENT_EXPIRED";
      case "CONSENT_SCOPE_MISMATCH":
        return "ERR_SCOPE_MISMATCH";
      case "CONSENT_EVIDENCE_MISMATCH":
        return "ERR_CONSENT_MISMATCH";
      case "INCIDENT_CLOSED":
      case "ERR_INCIDENT_CLOSED":
        return "ERR_INCIDENT_CLOSED";
      case "ERR_ABORTED":
        return "ERR_ABORTED";
      case "PROFILE_INACTIVE":
        return "ERR_PROFILE_INACTIVE";
      case "CONSENT_PROFILE_ALTERED":
        return "ERR_PROFILE_ALTERED";
      case "EXTERNAL_PROVIDER_DISABLED":
        return "ERR_EXTERNAL_PROVIDER_DISABLED";
      case "DUPLICATE_OPERATION_ID":
        return "ERR_OPERATION_DUPLICATE";
      case "BUDGET_EXCEEDED":
        return "ERR_BUDGET_EXCEEDED";
      case "TOKEN_BUDGET_EXCEEDED":
        return "ERR_TOKEN_BUDGET_EXCEEDED";
      case "PAYLOAD_BUDGET_EXCEEDED":
        return "ERR_PAYLOAD_TOO_LARGE";
      default:
        return "ERR_UNKNOWN";
    }
  }

  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";

  if (name === "AbortError" || msg.includes("aborted") || msg.includes("abort")) {
    return "ERR_ABORTED";
  }
  if (msg.includes("ETIMEDOUT") || msg.includes("timeout") || msg.includes("Timeout")) {
    return "ERR_TIMEOUT";
  }
  if (msg.includes("429")) {
    return "ERR_HTTP_429";
  }
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504")) {
    return "ERR_HTTP_5XX";
  }
  if (msg.includes("400") || msg.includes("401") || msg.includes("403") || msg.includes("404")) {
    return "ERR_HTTP_4XX";
  }
  if (name.includes("PayloadValidation") || msg.includes("payload") || msg.includes("PAYLOAD") || msg.includes("schema")) {
    return "ERR_PAYLOAD_VALIDATION";
  }
  if (name.includes("Network") || msg.includes("network") || msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
    return "ERR_NETWORK";
  }

  return "ERR_UNKNOWN";
}
