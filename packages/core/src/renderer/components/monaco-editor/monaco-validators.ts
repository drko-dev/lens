/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import yaml from "js-yaml";

export interface MonacoValidator {
  (value: string): void;
}

export interface YamlValidationResult {
  valid: boolean;
  error?: string;
  line?: number;
  column?: number;
  reason?: string;
}

/**
 * Validates YAML syntax and extracts line and column if available.
 */
export function validateYamlSyntax(value: string): YamlValidationResult {
  try {
    yaml.loadAll(value);

    return { valid: true };
  } catch (error: any) {
    const line = error?.mark?.line !== undefined ? error.mark.line + 1 : undefined;
    const column = error?.mark?.column !== undefined ? error.mark.column + 1 : undefined;
    const reason = error?.reason || (error instanceof Error ? error.message : String(error));
    const loc = line !== undefined && column !== undefined ? ` (line ${line}, col ${column})` : "";

    return {
      valid: false,
      error: `${reason}${loc}`,
      line,
      column,
      reason,
    };
  }
}

/**
 * Validates that the YAML represents a single, valid Kubernetes resource manifest shape.
 * Checks for single document and required fields: apiVersion, kind, metadata.name.
 */
export function validateKubernetesResourceYaml(value: string): YamlValidationResult {
  if (!value || !value.trim()) {
    return {
      valid: false,
      error: "Resource manifest cannot be empty",
    };
  }

  const syntaxResult = validateYamlSyntax(value);

  if (!syntaxResult.valid) {
    return syntaxResult;
  }

  try {
    const rawDocs = yaml.loadAll(value);
    const docs = rawDocs.filter(d => d !== null && d !== undefined);

    if (docs.length === 0) {
      return {
        valid: false,
        error: "Resource manifest cannot be empty",
      };
    }

    if (docs.length > 1) {
      return {
        valid: false,
        error: `Only a single Kubernetes resource document is supported (found ${docs.length} documents)`,
      };
    }

    const doc = docs[0] as any;

    if (typeof doc !== "object" || Array.isArray(doc)) {
      return {
        valid: false,
        error: "Resource manifest must be a YAML mapping (object)",
      };
    }

    if (typeof doc.apiVersion !== "string" || !doc.apiVersion.trim()) {
      return {
        valid: false,
        error: "Missing required field: apiVersion",
      };
    }

    if (typeof doc.kind !== "string" || !doc.kind.trim()) {
      return {
        valid: false,
        error: "Missing required field: kind",
      };
    }

    if (!doc.metadata || typeof doc.metadata !== "object" || Array.isArray(doc.metadata)) {
      return {
        valid: false,
        error: "Missing required field: metadata",
      };
    }

    if (typeof doc.metadata.name !== "string" || !doc.metadata.name.trim()) {
      return {
        valid: false,
        error: "Missing required field: metadata.name",
      };
    }

    return { valid: true };
  } catch (error: any) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function yamlValidator(value: string) {
  const result = validateYamlSyntax(value);

  if (!result.valid) {
    const error = new Error(result.error);

    Object.assign(error, {
      line: result.line,
      column: result.column,
      reason: result.reason,
    });
    throw error;
  }
}

export function jsonValidator(value: string) {
  try {
    JSON.parse(value);
  } catch (error) {
    throw String(error);
  }
}

export const monacoValidators = {
  yaml: yamlValidator,
  json: jsonValidator,
};
