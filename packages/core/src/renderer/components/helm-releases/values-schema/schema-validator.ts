/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import Ajv from "ajv";
import type { AnySchema, ErrorObject } from "ajv";

export interface SchemaValidationError {
  path: string;
  pathSegments: (string | number)[];
  keyword: string;
  message: string;
  expected?: string;
  actual?: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaValidationError[];
  /** A schema that cannot be compiled is never reported as completely validated. */
  unsupportedKeywords: string[];
  complete: boolean;
}

const ajv = new Ajv({
  allErrors: true,
  strictSchema: true,
  strictTypes: false,
  strictTuples: false,
  strictRequired: false,
  validateFormats: false,
  multipleOfPrecision: 12,
  addUsedSchema: false,
});

function getJsonType(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }

  return typeof value;
}

function parseInstancePath(instancePath: string, value: unknown): (string | number)[] {
  let current = value;

  return instancePath.split("/").slice(1).map((part) => {
    const decoded = part.replace(/~1/g, "/").replace(/~0/g, "~");
    const segment = Array.isArray(current) && /^\d+$/.test(decoded) ? Number(decoded) : decoded;

    current = current && typeof current === "object"
      ? (current as Record<string | number, unknown>)[segment]
      : undefined;

    return segment;
  });
}

function formatPath(segments: (string | number)[]): string {
  if (segments.length === 0) {
    return "(root)";
  }

  return segments.reduce<string>((path, segment) => {
    if (typeof segment === "number") {
      return `${path}[${segment}]`;
    }

    return /^[A-Za-z_$][\w$]*$/.test(segment)
      ? `${path ? `${path}.` : ""}${segment}`
      : `${path}[${JSON.stringify(segment)}]`;
  }, "");
}

function getValueAtPath(value: unknown, segments: (string | number)[]): unknown {
  return segments.reduce<unknown>((current, segment) => {
    if (current === null || typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string | number, unknown>)[segment];
  }, value);
}

function toValidationError(error: ErrorObject, values: unknown): SchemaValidationError {
  const pathSegments = parseInstancePath(error.instancePath, values);

  if (error.keyword === "required" && typeof error.params.missingProperty === "string") {
    pathSegments.push(error.params.missingProperty);
  }

  if (error.keyword === "additionalProperties" && typeof error.params.additionalProperty === "string") {
    pathSegments.push(error.params.additionalProperty);
  }

  const expected = error.keyword === "type"
    ? String(error.params.type)
    : undefined;
  const actual = expected === undefined
    ? undefined
    : getJsonType(getValueAtPath(values, pathSegments));

  return {
    path: formatPath(pathSegments),
    pathSegments,
    keyword: error.keyword,
    message: expected === undefined ? error.message ?? "does not satisfy the schema" : `expected ${expected}, got ${actual}`,
    ...(expected !== undefined ? { expected, actual } : {}),
  };
}

export const MAX_VALUES_VALIDATION_BYTES = 1024 * 1024; // 1 MiB
export const MAX_SCHEMA_PATTERN_LENGTH = 256;

function estimatePayloadSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

function containsExcessivePatterns(schema: unknown, depth = 0): boolean {
  if (!schema || typeof schema !== "object" || depth > 20) {
    return false;
  }

  const obj = schema as Record<string, unknown>;

  if (typeof obj.pattern === "string" && obj.pattern.length > MAX_SCHEMA_PATTERN_LENGTH) {
    return true;
  }

  for (const key of Object.keys(obj)) {
    if (containsExcessivePatterns(obj[key], depth + 1)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates Helm values against the default draft-07 JSON Schema dialect. Unknown keywords,
 * invalid schemas, and unresolved references fail compilation and therefore produce a partial
 * result instead of silently claiming validation passed.
 */
export function validateValuesAgainstSchema(values: unknown, schema: unknown): SchemaValidationResult {
  if (estimatePayloadSize(values) > MAX_VALUES_VALIDATION_BYTES) {
    return {
      valid: false,
      errors: [],
      unsupportedKeywords: [`Values document exceeds maximum validation size (${MAX_VALUES_VALIDATION_BYTES} bytes)`],
      complete: false,
    };
  }

  if (containsExcessivePatterns(schema)) {
    return {
      valid: false,
      errors: [],
      unsupportedKeywords: [`Schema contains a pattern that exceeds maximum safe length (${MAX_SCHEMA_PATTERN_LENGTH}) to mitigate ReDoS`],
      complete: false,
    };
  }

  let validate: ReturnType<typeof ajv.compile>;

  try {
    validate = ajv.compile(schema as AnySchema);
  } catch (error) {
    return {
      valid: true,
      errors: [],
      unsupportedKeywords: [error instanceof Error ? error.message : String(error)],
      complete: false,
    };
  }

  const valid = validate(values);
  const errors = (validate.errors ?? []).map(error => toValidationError(error, values));

  return {
    valid: valid === true,
    errors,
    unsupportedKeywords: [],
    complete: true,
  };
}
