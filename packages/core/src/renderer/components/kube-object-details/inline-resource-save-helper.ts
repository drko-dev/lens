/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { JsonApiErrorParsed } from "@openlens/json-api";
import { base64 } from "@openlens/utilities";
import { getErrorMessage } from "../../../common/utils/get-error-message";

export type KeyValueMap = Partial<Record<string, string>>;

export type KeyModificationStatus =
  | "modified-locally"
  | "modified-remotely"
  | "conflict-both-modified";

export interface KeyConflictDetail {
  key: string;
  status: KeyModificationStatus;
}

export interface KeyValueConflictSummary {
  localChangedKeys: string[];
  /**
   * `undefined` when the current cluster version could not be read.
   */
  remoteChangedKeys: string[] | undefined;
  overlappingKeys: string[];
  keyDetails: KeyConflictDetail[];
  remoteResourceVersion?: string;
  remoteDeleted?: boolean;
  uidChanged?: boolean;
}

/**
 * Normalizes a key-value map (`data`) into a shallow plain object copy.
 * If `stringData` is present (e.g. on a Secret), encodes plain-text entries
 * into base64 when not already overridden in `data`.
 */
export function normalizeSecretData(
  data: KeyValueMap | undefined,
  stringData?: Partial<Record<string, string>> | undefined,
): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};

  if (stringData && typeof stringData === "object") {
    for (const [key, plainValue] of Object.entries(stringData)) {
      if (typeof plainValue === "string") {
        normalized[key] = base64.encode(plainValue);
      }
    }
  }

  if (data && typeof data === "object") {
    for (const [key, value] of Object.entries(data)) {
      normalized[key] = value;
    }
  }

  return normalized;
}

export function normalizeConfigMapData(
  data: KeyValueMap | undefined,
): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};

  if (data && typeof data === "object") {
    for (const [key, value] of Object.entries(data)) {
      normalized[key] = value;
    }
  }

  return normalized;
}

/**
 * Returns the sorted list of keys whose values differ between `base` and `target`.
 */
export function getChangedKeys(
  base: Record<string, string | undefined>,
  target: Record<string, string | undefined>,
): string[] {
  const allKeys = new Set([...Object.keys(base), ...Object.keys(target)]);
  const changed: string[] = [];

  for (const key of allKeys) {
    const baseVal = base[key] ?? "";
    const targetVal = target[key] ?? "";

    if (key in base !== key in target || baseVal !== targetVal) {
      changed.push(key);
    }
  }

  return changed.sort();
}

export function hasUnsavedKeyChanges(
  base: Record<string, string | undefined>,
  draft: Record<string, string | undefined>,
): boolean {
  return getChangedKeys(base, draft).length > 0;
}

/**
 * Builds a key-level conflict summary without ever exposing secret values.
 */
export function describeKeyValueConflict(
  base: Record<string, string | undefined>,
  draft: Record<string, string | undefined>,
  remote: Record<string, string | undefined> | undefined,
  options: {
    remoteResourceVersion?: string;
    remoteDeleted?: boolean;
    uidChanged?: boolean;
  } = {},
): KeyValueConflictSummary {
  const localChangedKeys = getChangedKeys(base, draft);
  const remoteChangedKeys = remote ? getChangedKeys(base, remote) : undefined;
  const remoteSet = new Set(remoteChangedKeys ?? []);
  const overlappingKeys = localChangedKeys.filter(key => remoteSet.has(key));
  const overlappingSet = new Set(overlappingKeys);

  const allChangedKeys = new Set([
    ...localChangedKeys,
    ...(remoteChangedKeys ?? []),
  ]);

  const keyDetails: KeyConflictDetail[] = [...allChangedKeys].sort().map(key => {
    if (overlappingSet.has(key)) {
      return { key, status: "conflict-both-modified" };
    }

    if (remoteSet.has(key)) {
      return { key, status: "modified-remotely" };
    }

    return { key, status: "modified-locally" };
  });

  return {
    localChangedKeys,
    remoteChangedKeys,
    overlappingKeys,
    keyDetails,
    remoteResourceVersion: options.remoteResourceVersion,
    remoteDeleted: options.remoteDeleted,
    uidChanged: options.uidChanged,
  };
}

/**
 * Re-applies only the keys modified by the user (`base` -> `draft`) on top of `remote`.
 */
export function mergeDraftKeysOntoRemote(
  base: Record<string, string | undefined>,
  draft: Record<string, string | undefined>,
  remote: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = { ...remote };
  const localChangedKeys = getChangedKeys(base, draft);

  for (const key of localChangedKeys) {
    if (key in draft) {
      merged[key] = draft[key];
    } else {
      delete merged[key];
    }
  }

  return merged;
}

/**
 * Extracts HTTP status code from `JsonApiErrorParsed` or KubeStatus-like errors.
 */
export function getHttpStatusCode(error: unknown): number | undefined {
  if (error instanceof JsonApiErrorParsed) {
    const raw = error.error as { code?: unknown; status?: unknown } | undefined;

    if (typeof raw?.code === "number") {
      return raw.code;
    }

    if (typeof raw?.status === "number") {
      return raw.status;
    }
  }

  if (error && typeof error === "object") {
    const candidate = error as {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      error?: { code?: unknown; status?: unknown };
    };

    if (typeof candidate.code === "number") {
      return candidate.code;
    }

    if (typeof candidate.status === "number") {
      return candidate.status;
    }

    if (typeof candidate.statusCode === "number") {
      return candidate.statusCode;
    }

    if (typeof candidate.error?.code === "number") {
      return candidate.error.code;
    }

    if (typeof candidate.error?.status === "number") {
      return candidate.error.status;
    }
  }

  return undefined;
}

export function isSaveConflictError(error: unknown): boolean {
  const code = getHttpStatusCode(error);

  if (code === 409) {
    return true;
  }

  if (error instanceof JsonApiErrorParsed) {
    const raw = error.error as { reason?: unknown } | undefined;

    if (raw?.reason === "Conflict") {
      return true;
    }
  }

  if (error && typeof error === "object") {
    const reason = (error as { reason?: unknown }).reason;

    if (reason === "Conflict") {
      return true;
    }
  }

  return false;
}

export function isForbiddenError(error: unknown): boolean {
  const code = getHttpStatusCode(error);

  if (code === 403) {
    return true;
  }

  if (error && typeof error === "object") {
    const reason = (error as { reason?: unknown }).reason;

    if (reason === "Forbidden") {
      return true;
    }
  }

  return false;
}

export function isNotFoundError(error: unknown): boolean {
  const code = getHttpStatusCode(error);

  if (code === 404) {
    return true;
  }

  if (error && typeof error === "object") {
    const reason = (error as { reason?: unknown }).reason;

    if (reason === "NotFound") {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether an error thrown by `store.api.get` in unit tests is simply due
 * to an unoverridden `fetchInjectable` in `getDiForUnitTesting()`, rather than a real
 * or simulated API failure.
 */
export function isUnoverriddenTestDependencyError(error: unknown): boolean {
  const message = getErrorMessage(error);

  return /without overriding|Tried to inject/i.test(message);
}

/**
 * Redacts any raw or base64-decoded secret values from an error string or log message
 * so secret material never leaks into notifications or logs.
 */
export function redactSecretValues(
  message: string,
  secretDictionaries: (Record<string, string | undefined> | undefined)[],
): string {
  if (!message) {
    return message;
  }

  const sensitiveTokens = new Set<string>();

  for (const dict of secretDictionaries) {
    if (!dict || typeof dict !== "object") {
      continue;
    }

    for (const rawValue of Object.values(dict)) {
      if (typeof rawValue !== "string" || rawValue.length === 0) {
        continue;
      }

      if (rawValue.length >= 3) {
        sensitiveTokens.add(rawValue);
      }

      try {
        const decoded = base64.decode(rawValue);

        if (decoded && decoded.length >= 3) {
          sensitiveTokens.add(decoded);
        }
      } catch {
        // Ignore invalid base64 while collecting redaction tokens
      }
    }
  }

  // Replace longest tokens first to avoid partial token leaks
  const sortedTokens = [...sensitiveTokens].sort((a, b) => b.length - a.length);
  let sanitized = message;

  for (const token of sortedTokens) {
    sanitized = sanitized.split(token).join("[REDACTED]");
  }

  return sanitized;
}

export function findUnpersistedKeys(
  edited: Record<string, string | undefined>,
  persisted: Record<string, string | undefined>,
  changedKeys: string[],
): string[] {
  return changedKeys.filter(key => {
    const expected = edited[key] ?? "";
    const actual = persisted[key] ?? "";

    return (key in edited !== key in persisted) || expected !== actual;
  });
}
