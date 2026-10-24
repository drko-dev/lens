/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
export function getBoolean(query: URLSearchParams, key: string): boolean {
  const value = query.get(key);

  switch (value?.toLowerCase()) {
    case "false":
    case "f":
    case "0":
    case null:
    case undefined:
      return false;
    default:
      return true;
  }
}

/**
 * Reads a positive integer query parameter.
 * Returns undefined when the parameter is absent or cannot be parsed as a positive integer,
 * so callers can distinguish "not requested" from an explicit value.
 */
export function getInteger(query: URLSearchParams, key: string): number | undefined {
  const value = query.get(key);

  if (value === null || value.trim() === "") {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return undefined;
  }

  return parsed;
}
