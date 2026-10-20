/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import yaml from "js-yaml";
import type { RawKubeObject } from "@openlens/kube-object";

/**
 * Sanitizes a Secret object so that actual secret values (base64 or plaintext)
 * are never exposed in diff views, logs, or test snapshots.
 */
export function sanitizeSecretForDiff(
  current: RawKubeObject,
  base?: RawKubeObject,
): RawKubeObject {
  if (current.kind !== "Secret") {
    return current;
  }

  const cloned = JSON.parse(JSON.stringify(current)) as RawKubeObject;

  // Sanitize data field (base64)
  if (cloned.data && typeof cloned.data === "object") {
    const sanitizedData: Record<string, string> = {};
    const baseData = (base?.data && typeof base.data === "object") ? (base.data as Record<string, string>) : undefined;

    for (const key of Object.keys(cloned.data)) {
      if (!baseData || baseData[key] === undefined) {
        sanitizedData[key] = base ? "<redacted (new)>" : "<redacted>";
      } else if (baseData[key] !== (current.data as Record<string, string>)[key]) {
        sanitizedData[key] = "<redacted (modified)>";
      } else {
        sanitizedData[key] = "<redacted>";
      }
    }

    cloned.data = sanitizedData;
  }

  // Sanitize stringData field (plaintext)
  const rawStringData = (cloned as any).stringData;

  if (rawStringData && typeof rawStringData === "object") {
    const sanitizedStringData: Record<string, string> = {};
    const baseStringData = (base as any)?.stringData && typeof (base as any).stringData === "object"
      ? (base as any).stringData
      : undefined;

    for (const key of Object.keys(rawStringData)) {
      if (!baseStringData || baseStringData[key] === undefined) {
        sanitizedStringData[key] = base ? "<redacted (new)>" : "<redacted>";
      } else if (baseStringData[key] !== (current as any).stringData[key]) {
        sanitizedStringData[key] = "<redacted (modified)>";
      } else {
        sanitizedStringData[key] = "<redacted>";
      }
    }

    (cloned as any).stringData = sanitizedStringData;
  }

  // Sanitize last-applied-configuration annotation if present
  if (cloned.metadata?.annotations?.["kubectl.kubernetes.io/last-applied-configuration"]) {
    cloned.metadata.annotations["kubectl.kubernetes.io/last-applied-configuration"] =
      "<redacted last-applied-configuration>";
  }

  return cloned;
}

/**
 * Sanitizes YAML string for safe display in Monaco Diff.
 * If kind is Secret, redacts sensitive values. Otherwise returns raw YAML.
 */
export function sanitizeYamlForDiff(
  rawYaml: string,
  kind?: string,
  baseYaml?: string,
): string {
  if (!rawYaml || !rawYaml.trim()) {
    return rawYaml;
  }

  let parsed: RawKubeObject;

  try {
    parsed = yaml.load(rawYaml) as RawKubeObject;
  } catch {
    // If YAML cannot be parsed, return rawYaml (Monaco will show syntax markers)
    return rawYaml;
  }

  if (!parsed || typeof parsed !== "object" || (parsed.kind !== "Secret" && kind !== "Secret")) {
    return rawYaml;
  }

  let baseParsed: RawKubeObject | undefined;

  if (baseYaml) {
    try {
      baseParsed = yaml.load(baseYaml) as RawKubeObject;
    } catch {
      // Ignore base parsing failure
    }
  }

  const sanitized = sanitizeSecretForDiff(parsed, baseParsed);

  return yaml.dump(sanitized);
}
