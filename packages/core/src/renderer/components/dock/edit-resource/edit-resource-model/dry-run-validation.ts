/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { RawKubeObject } from "@openlens/kube-object";

/**
 * Lifecycle of a server-side dry-run validation of the current editor draft.
 */
export type DraftValidationStatus =
  | "not-validated"
  | "validating"
  | "passed"
  | "failed"
  | "unavailable";

/**
 * Structured classification of why a dry-run (or its preflight) failed.
 */
export type DryRunErrorKind =
  | "malformed-yaml" // local YAML parse failure, server was not contacted
  | "bad-request" // HTTP 400
  | "forbidden" // HTTP 403, e.g. RBAC
  | "not-found" // HTTP 404, unknown API or resource
  | "conflict" // HTTP 409, resourceVersion/precondition mismatch
  | "invalid" // HTTP 422, schema, immutable field or policy validation
  | "admission-denied" // admission webhook rejection
  | "connection" // timeout, abort or network failure
  | "context-mismatch" // the tab no longer matches its host cluster
  | "unknown";

export interface DryRunValidationCause {
  /**
   * JSON pointer of the offending field, when the API server provides one.
   */
  field?: string;
  message: string;
}

export interface DryRunValidationState {
  status: DraftValidationStatus;
  errorKind?: DryRunErrorKind;
  statusCode?: number;
  reason?: string;
  /**
   * Human readable message, redacted for Secrets.
   */
  message?: string;
  causes?: DryRunValidationCause[];
  clusterName?: string;
  resourceKind?: string;
  resourceName?: string;
  /**
   * ISO timestamp of when the check completed.
   */
  validatedAt?: string;
  /**
   * HTTP verb used for the dry-run request ("put" | "patch"), for transparency.
   */
  requestMethod?: "put" | "patch";
  /**
   * True when the validation ran against a production cluster.
   */
  isProduction?: boolean;
}

interface KubeErrorCausePayload {
  field?: string;
  message?: string;
  reason?: string;
}

export interface KubeErrorPayload {
  code?: number;
  reason?: string;
  message?: string;
  details?: {
    causes?: KubeErrorCausePayload[];
  };
}

const isAbort = (error: unknown): boolean => (
  typeof error === "object"
  && error !== null
  && (error as { name?: string }).name === "AbortError"
);

const ADMISSION_WEBHOOK_PATTERN = /admission\s+webhook/i;

const CONNECTION_ERROR_PATTERN = /abort|timeout|timed?\s*out|network|fetch\s*failed|econnrefused|enotfound|econnreset|eai_again|socket\s*hang\s*up|failed\s*to\s*fetch/i;

/**
 * Extracts the structured Kubernetes `Status` payload from an error thrown by
 * the JSON API layer, if present.
 */
export const getKubeErrorPayload = (error: unknown): KubeErrorPayload | undefined => (
  typeof error === "object" && error !== null && "error" in error
    ? (error as { error?: unknown }).error as KubeErrorPayload | undefined
    : undefined
);

export interface DryRunFailureClassification {
  errorKind: DryRunErrorKind;
  statusCode?: number;
  reason?: string;
  message: string;
  causes: DryRunValidationCause[];
}

/**
 * Classifies a dry-run failure from the structured payload when available and
 * from the fallback message otherwise. Never claims more precision than the
 * server provided.
 */
export const classifyDryRunFailure = (
  error: unknown,
  fallbackMessage: string,
): DryRunFailureClassification => {
  const payload = getKubeErrorPayload(error) ?? (typeof error === "object" && error !== null && "code" in error
    ? error as KubeErrorPayload
    : undefined);

  if (!payload) {
    return {
      errorKind: isAbort(error) || CONNECTION_ERROR_PATTERN.test(fallbackMessage) ? "connection" : "unknown",
      message: fallbackMessage,
      causes: [],
    };
  }

  const code = typeof payload.code === "number" ? payload.code : undefined;
  const reason = typeof payload.reason === "string" ? payload.reason : undefined;
  const message = typeof payload.message === "string" && payload.message.trim() !== ""
    ? payload.message
    : fallbackMessage;

  const causes = (payload.details?.causes ?? [])
    .filter((cause): cause is { field?: string; message: string } => typeof cause.message === "string")
    .map(cause => ({
      ...(typeof cause.field === "string" && cause.field !== "" ? { field: cause.field } : {}),
      message: cause.message,
    }));

  let errorKind: DryRunErrorKind = "unknown";

  if (ADMISSION_WEBHOOK_PATTERN.test(message) && (code === 400 || code === 422)) {
    errorKind = "admission-denied";
  } else if (code === 400) {
    errorKind = "bad-request";
  } else if (code === 403) {
    errorKind = "forbidden";
  } else if (code === 404) {
    errorKind = "not-found";
  } else if (code === 409) {
    errorKind = "conflict";
  } else if (code === 422) {
    errorKind = "invalid";
  } else if (code !== undefined && code >= 500) {
    errorKind = "connection";
  }

  return { errorKind, statusCode: code, reason, message, causes };
};

/**
 * Accepts either the current draft or several versions of it (for instance the
 * originally loaded Secret plus the edited one). Previous values matter: an
 * API server may echo a value the user just removed.
 */
export type SecretRedactionSources = RawKubeObject | Array<RawKubeObject | undefined> | undefined;

const normalizeSources = (sources: SecretRedactionSources): RawKubeObject[] => (
  Array.isArray(sources)
    ? sources.filter((source): source is RawKubeObject => Boolean(source))
    : sources ? [sources] : []
);

const isSecretObject = (object: RawKubeObject | undefined): boolean => object?.kind === "Secret";

/**
 * Collects the sensitive string values of Secret manifests (base64 `data` and
 * plaintext `stringData`). Only exact values present in the provided versions
 * are treated as sensitive: nothing else is guessed or removed.
 */
export const collectSecretValues = (sources: SecretRedactionSources): string[] => {
  const values = new Set<string>();

  for (const draft of normalizeSources(sources)) {
    for (const source of [draft.data, (draft as { stringData?: unknown }).stringData]) {
      if (source && typeof source === "object") {
        for (const value of Object.values(source as Record<string, unknown>)) {
          if (typeof value === "string" && value !== "") {
            values.add(value);
          }
        }
      }
    }
  }

  // Longest first, so a value that contains another one is replaced as a whole.
  return [...values].sort((a, b) => b.length - a.length);
};

const isSecretKind = (kind: string | undefined, sources: SecretRedactionSources): boolean => (
  kind === "Secret"
  || (kind === undefined && normalizeSources(sources).some(isSecretObject))
);

/**
 * Replaces exact occurrences of Secret values in arbitrary text with
 * `<redacted>`. Used for server messages, reasons and causes which could echo
 * submitted or previously loaded values back. Non-Secret kinds are untouched.
 */
export const redactSecretText = (
  kind: string | undefined,
  text: string,
  source: SecretRedactionSources,
): string => {
  if (!isSecretKind(kind, source)) {
    return text;
  }

  return collectSecretValues(source).reduce(
    (acc, value) => acc.split(value).join("<redacted>"),
    text,
  );
};

export const redactSecretCauses = (
  kind: string | undefined,
  causes: DryRunValidationCause[],
  source: SecretRedactionSources,
): DryRunValidationCause[] => (
  isSecretKind(kind, source)
    ? causes.map(cause => ({
      ...cause,
      ...(cause.field !== undefined ? { field: redactSecretText(kind, cause.field, source) } : {}),
      message: redactSecretText(kind, cause.message, source),
    }))
    : causes
);

/**
 * Redacts every text-bearing field of a classification result. Status codes
 * and structured metadata are kept: they are safe and useful for support.
 */
export const redactDryRunFailure = <T extends DryRunFailureClassification>(
  kind: string | undefined,
  failure: T,
  source: SecretRedactionSources,
): T => (
    isSecretKind(kind, source)
      ? {
        ...failure,
        message: redactSecretText(kind, failure.message, source),
        ...(failure.reason !== undefined ? { reason: redactSecretText(kind, failure.reason, source) } : {}),
        causes: redactSecretCauses(kind, failure.causes, source),
      }
      : failure
  );
