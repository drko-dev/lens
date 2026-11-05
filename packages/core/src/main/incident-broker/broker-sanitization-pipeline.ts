/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";
import {
  EvidenceSanitizer,
  MAX_SNIPPET_BYTES,
  type SanitizationResult,
} from "../incident-storage/evidence-sanitizer";
import { FORBIDDEN_RESOURCE_KINDS } from "../../common/incident/broker-types";

export type DataClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

export interface ProcessedEvidencePayload {
  rawKind: string;
  classification: DataClassification;
  sanitizedContent: string;
  fencedContent: string;
  sha256Hash: string;
  byteLength: number;
  isTruncated: boolean;
  isSanitized: boolean;
  redactionsCount: number;
  metadata: {
    clusterId: string;
    namespace?: string;
    resourceName?: string;
    container?: string;
    timestamp: string;
    warnings?: string[];
  };
}

export interface PipelineContext {
  clusterId: string;
  namespace?: string;
  resourceKind: string;
  resourceName?: string;
  container?: string;
  toolName?: string;
}

const INJECTION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /<\s*\|\s*im_start\s*\|\s*>/gi, replacement: "[NEUTRALIZED_TOKEN]" },
  { pattern: /<\s*\|\s*im_end\s*\|\s*>/gi, replacement: "[NEUTRALIZED_TOKEN]" },
  { pattern: /\[\s*INST\s*\]/gi, replacement: "[NEUTRALIZED_TAG]" },
  { pattern: /\[\s*\/\s*INST\s*\]/gi, replacement: "[NEUTRALIZED_TAG]" },
  { pattern: /<<\s*SYS\s*>>/gi, replacement: "[NEUTRALIZED_TAG]" },
  { pattern: /<<\s*\/\s*SYS\s*>>/gi, replacement: "[NEUTRALIZED_TAG]" },
  { pattern: /\b(?:ignore|forget|disregard)\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions|prompts|commands|rules)\b/gi, replacement: "[NEUTRALIZED_INJECTION_DIRECTIVE]" },
  { pattern: /\b(?:you\s+are\s+now|act\s+as)\s+(?:a|an)\s+(?:root|admin|unrestricted|jailbroken)\b/gi, replacement: "[NEUTRALIZED_JAILBREAK_ATTEMPT]" },
];

export class PromptInjectionNeutralizer {
  /**
   * Neutralizes prompt injection directives and delimiters embedded in untrusted logs or manifests.
   */
  public static neutralize(content: string): { neutralized: string; modified: boolean } {
    let modified = false;
    let result = content;

    for (const { pattern, replacement } of INJECTION_PATTERNS) {
      if (pattern.test(result)) {
        modified = true;
        result = result.replace(pattern, replacement);
      }
    }

    return { neutralized: result, modified };
  }

  /**
   * Wraps untrusted content into an isolated, nonce-delimited boundary.
   */
  public static fenceContent(content: string, nonce: string): string {
    // Escape any attempt to close the nonce-delimited container prematurely
    const escaped = content.replace(new RegExp(`</untrusted_k8s_observation_${nonce}>`, "gi"), `&lt;/untrusted_k8s_observation_${nonce}&gt;`);

    return `<untrusted_k8s_observation_${nonce}>\n${escaped}\n</untrusted_k8s_observation_${nonce}>`;
  }
}

export class BrokerSanitizationPipeline {
  private static sanitizeObjectFields(val: any): any {
    if (val === null || val === undefined || typeof val !== "object") {
      return val;
    }

    if (Array.isArray(val)) {
      return val.map(v => this.sanitizeObjectFields(v));
    }

    const SENSITIVE_PATTERNS = [
      "password", "passwd", "pwd", "token", "secret",
      "privatekey", "privkey", "apikey", "credential", "auth",
    ];

    const out: Record<string, any> = {};

    for (const [key, value] of Object.entries(val)) {
      const normKey = key.toLowerCase().replace(/[-_]/g, "");
      const isSensitive = SENSITIVE_PATTERNS.some(p => normKey.includes(p));

      if (isSensitive) {
        out[key] = "[REDACTED_TOKEN]";
      } else if (typeof value === "object" && value !== null) {
        out[key] = this.sanitizeObjectFields(value);
      } else {
        out[key] = value;
      }
    }

    return out;
  }

  /**
   * Classifies data sensitivity based on Kubernetes resource kind.
   */
  public static classifyData(resourceKind: string): DataClassification {
    const norm = (resourceKind || "").toLowerCase().trim();

    if (FORBIDDEN_RESOURCE_KINDS.has(norm)) {
      return "RESTRICTED";
    }

    if (norm === "configmaps" || norm === "configmap" || norm === "persistentvolumeclaims" || norm === "pvc") {
      return "CONFIDENTIAL";
    }

    return "INTERNAL";
  }

  /**
   * Complete pipeline:
   * 1. Check classification (Fail-closed on RESTRICTED)
   * 2. Format raw input to string
   * 3. Run EvidenceSanitizer (redact secrets, tokens, credentials, PII)
   * 4. Run PromptInjectionNeutralizer (neutralize injection tokens)
   * 5. Fence content safely
   * 6. Generate metadata, flags, and SHA-256
   */
  public static processK8sOutput(
    rawOutput: unknown,
    context: PipelineContext,
  ): ProcessedEvidencePayload {
    const classification = this.classifyData(context.resourceKind);

    if (classification === "RESTRICTED") {
      throw new Error(`Access Denied: Resource kind '${context.resourceKind}' is classified as RESTRICTED and cannot be processed.`);
    }

    let stringified: string;

    if (typeof rawOutput === "string") {
      stringified = rawOutput;
    } else if (Array.isArray(rawOutput) && rawOutput.every(x => typeof x === "string")) {
      stringified = rawOutput.join("\n");
    } else {
      try {
        const preSanitizedObj = this.sanitizeObjectFields(rawOutput);
        stringified = JSON.stringify(preSanitizedObj, null, 2);
      } catch {
        stringified = String(rawOutput);
      }
    }

    // 1. Evidence Sanitizer
    const sanitization: SanitizationResult = EvidenceSanitizer.sanitize(stringified, context.resourceKind);

    // 2. Neutralize Prompt Injections in untrusted logs/manifests
    const { neutralized, modified: injectionNeutralized } = PromptInjectionNeutralizer.neutralize(sanitization.sanitizedContent);

    // 3. Fence content
    const nonce = crypto.randomBytes(8).toString("hex");
    const fencedContent = PromptInjectionNeutralizer.fenceContent(neutralized, nonce);

    const warnings: string[] = [];

    if (sanitization.redactionsCount > 0) {
      warnings.push(`Redacted ${sanitization.redactionsCount} sensitive credential(s) from output.`);
    }

    if (sanitization.byteLength >= MAX_SNIPPET_BYTES) {
      warnings.push("Output was truncated to maximum permitted size (64 KiB).");
    }

    if (injectionNeutralized) {
      warnings.push("Neutralized suspicious prompt injection directive(s) in Kubernetes content.");
    }

    return {
      rawKind: context.resourceKind,
      classification,
      sanitizedContent: neutralized,
      fencedContent,
      sha256Hash: sanitization.sha256Hash,
      byteLength: sanitization.byteLength,
      isTruncated: sanitization.byteLength >= MAX_SNIPPET_BYTES,
      isSanitized: sanitization.redactionsCount > 0 || injectionNeutralized,
      redactionsCount: sanitization.redactionsCount,
      metadata: {
        clusterId: context.clusterId,
        namespace: context.namespace,
        resourceName: context.resourceName,
        container: context.container,
        timestamp: new Date().toISOString(),
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    };
  }
}
