/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";

export const MAX_SNIPPET_BYTES = 64 * 1024; // 64 KiB UTF-8

export const FORBIDDEN_RESOURCE_KINDS = new Set([
  "secret",
  "secrets",
  "serviceaccount",
  "serviceaccounts",
  "token",
  "tokens",
  "rolebinding",
  "rolebindings",
  "clusterrolebinding",
  "clusterrolebindings",
]);

export class EvidenceSecurityError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "EvidenceSecurityError";
  }
}

export interface SanitizationResult {
  sanitizedContent: string;
  sha256Hash: string;
  byteLength: number;
  redactionsCount: number;
}

const SENSITIVE_KEY_PATTERNS = [
  "password",
  "passwd",
  "pwd",
  "token",
  "secret",
  "privatekey",
  "privkey",
  "clientkeydata",
  "clientcertificatedata",
  "authorization",
  "proxyauthorization",
  "apikey",
  "credentials",
  "credential",
  "stringdata",
];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, "");
}

function isSensitiveKey(key: string): boolean {
  const norm = normalizeKey(key);

  return SENSITIVE_KEY_PATTERNS.some(pat => norm.includes(pat));
}

export class EvidenceSanitizer {
  /**
   * Validates and strictly sanitizes raw content before persistence.
   * Never leaks raw content into errors or exceptions.
   */
  public static sanitize(rawContent: string, resourceKind?: string): SanitizationResult {
    if (typeof rawContent !== "string") {
      throw new EvidenceSecurityError("INVALID_CONTENT_TYPE", "El contenido de la evidencia debe ser una cadena de texto.");
    }

    // 1. Validar resourceKind contra la lista negra de Kubernetes
    if (resourceKind) {
      const normalizedKind = resourceKind.toLowerCase().trim();

      if (FORBIDDEN_RESOURCE_KINDS.has(normalizedKind)) {
        throw new EvidenceSecurityError(
          "FORBIDDEN_RESOURCE_KIND",
          `El tipo de recurso '${resourceKind}' está estrictamente prohibido como evidencia de diagnóstico.`,
        );
      }
    }

    // 2. Comprobar que no sea un manifiesto Secret o ServiceAccount embebido
    const kindMatch = rawContent.match(/^\s*kind\s*:\s*["']?([A-Za-z0-9]+)["']?/m);

    if (kindMatch) {
      const embeddedKind = kindMatch[1].toLowerCase();

      if (FORBIDDEN_RESOURCE_KINDS.has(embeddedKind)) {
        throw new EvidenceSecurityError(
          "FORBIDDEN_RESOURCE_CONTENT",
          `El contenido contiene un manifiesto de tipo '${kindMatch[1]}', cuya persistencia está prohibida.`,
        );
      }
    }

    // 3. Validar ausencia de caracteres binarios nulos
    if (rawContent.includes("\0")) {
      throw new EvidenceSecurityError(
        "UNSANITIZABLE_CONTENT",
        "El contenido contiene caracteres nulos o formato binario no procesable.",
      );
    }

    // 4. Redacción exhaustiva
    let text = rawContent;
    let redactionsCount = 0;

    const countMatches = (regex: RegExp) => {
      const matches = text.match(regex);

      if (matches) redactionsCount += matches.length;
    };

    // Private Keys
    const privateKeyRegex = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

    countMatches(privateKeyRegex);
    text = text.replace(privateKeyRegex, "[REDACTED_PRIVATE_KEY]");

    // Certificates
    const certRegex = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;

    countMatches(certRegex);
    text = text.replace(certRegex, "[REDACTED_CERTIFICATE]");

    // SSH Keys
    const sshKeyRegex = /(?:ssh-rsa|ssh-dss|ssh-ed25519|ecdsa-sha2-[a-z0-9]+)\s+[A-Za-z0-9+/=]{30,}/gi;

    countMatches(sshKeyRegex);
    text = text.replace(sshKeyRegex, "[REDACTED_SSH_KEY]");

    // Bearer & Basic Auth
    const bearerRegex = /(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi;

    countMatches(bearerRegex);
    text = text.replace(bearerRegex, "$1[REDACTED_TOKEN]");

    const basicRegex = /(Basic\s+)[A-Za-z0-9+/]+=*/gi;

    countMatches(basicRegex);
    text = text.replace(basicRegex, "$1[REDACTED_TOKEN]");

    // JWT Tokens
    const jwtRegex = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

    countMatches(jwtRegex);
    text = text.replace(jwtRegex, "[REDACTED_JWT]");

    // Passwords in URLs/URIs (http://, https://, redis://, postgres://, amqp://, etc. user:password@hostname)
    const urlPasswordRegex = /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^:@\s]+):([^@\s]+)@/gi;

    countMatches(urlPasswordRegex);
    text = text.replace(urlPasswordRegex, "$1$2:[REDACTED_PASSWORD]@");

    // Sensitive URL Query Parameters (?token=... &apiKey=...)
    text = text.replace(/([?&])([^=&#\s]+)=([^&#\s]*)/g, (match, separator: string, key: string) => {
      let decodedKey = key;

      try {
        decodedKey = decodeURIComponent(key);
      } catch {}

      if (isSensitiveKey(decodedKey)) {
        redactionsCount++;

        return `${separator}${key}=[REDACTED_TOKEN]`;
      }

      return match;
    });

    // Sensitive Key-Value pairs in JSON/YAML/CLI text (supports unquoted, single-quoted, and double-quoted keys, including prefixes like DATABASE_PASSWORD)
    const keyValueRegex = /((?:"|')?(?:[A-Za-z0-9_.-]*?(?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|password|passwd|secret|token|credential|private[_-]?key)[A-Za-z0-9_.-]*?)(?:"|')?\s*[:=]\s*)(".*?"|'.*?'|\[REDACTED_[A-Z_]+\]|[^\s,;}\]]+)/gi;

    text = text.replace(keyValueRegex, (fullMatch, prefix: string, value: string) => {
      const unquotedVal = typeof value === "string" ? value.replace(/^["']|["']$/g, "") : "";

      if (unquotedVal.startsWith("[REDACTED_") && unquotedVal.endsWith("]")) {
        return fullMatch; // Preservar redacción previa especializada (ej. [REDACTED_JWT] o "[REDACTED_TOKEN]")
      }
      redactionsCount++;

      return `${prefix}[REDACTED_TOKEN]`;
    });

    // 5. Normalización determinística (CRLF a LF, trim de líneas)
    const normalizedContent = text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(line => line.trimEnd())
      .join("\n")
      .trim();

    // 6. Verificación de tamaño UTF-8 post-redacción
    const byteLength = Buffer.byteLength(normalizedContent, "utf8");

    if (byteLength > MAX_SNIPPET_BYTES) {
      throw new EvidenceSecurityError(
        "SNIPPET_EXCEEDS_64KB",
        `El fragmento sanitizado (${byteLength} bytes) supera el límite máximo permitido de 64 KiB (${MAX_SNIPPET_BYTES} bytes).`,
      );
    }

    const sha256Hash = crypto.createHash("sha256").update(normalizedContent, "utf8").digest("hex");

    return {
      sanitizedContent: normalizedContent,
      sha256Hash,
      byteLength,
      redactionsCount,
    };
  }
}
