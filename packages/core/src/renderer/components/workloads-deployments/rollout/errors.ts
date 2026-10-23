/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

interface RolloutErrorLike {
  message?: unknown;
  statusCode?: unknown;
  code?: unknown;
  error?: {
    code?: unknown;
    status?: unknown;
    reason?: unknown;
    message?: unknown;
    details?: {
      causes?: Array<{ field?: unknown; message?: unknown; reason?: unknown }>;
    };
  };
}

const asNumber = (value: unknown): number | undefined => (
  typeof value === "number" && Number.isFinite(value) ? value : undefined
);

const asString = (value: unknown): string | undefined => (
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined
);

export const getHttpStatusCodeForRolloutError = (err: unknown): number | undefined => {
  const error = err as RolloutErrorLike | undefined;

  return asNumber(error?.error?.code)
    ?? asNumber(error?.statusCode)
    ?? asNumber(error?.code);
};

export interface RolloutErrorCause {
  field?: string;
  message: string;
}

export const getRolloutErrorCauses = (err: unknown): RolloutErrorCause[] => {
  const error = err as RolloutErrorLike | undefined;
  const causes = error?.error?.details?.causes;

  if (!Array.isArray(causes)) {
    return [];
  }

  return causes
    .map(cause => asString(cause?.field))
    .filter((field): field is string => field !== undefined)
    .map(field => ({ field, message: "Validation failed." }));
};

export const describeRolloutError = (err: unknown): string => {
  const statusCode = getHttpStatusCodeForRolloutError(err);
  const messages: Record<number, string> = {
    403: "The API server denied the rollback request.",
    404: "The Deployment or selected revision no longer exists.",
    409: "The Deployment changed. Refresh the history and validate again.",
    422: "The API server rejected the rollback patch.",
  };

  return statusCode === undefined
    ? "The rollback request failed. Check cluster connectivity and try again."
    : messages[statusCode] ?? `The rollback request failed (HTTP ${statusCode}).`;
};
