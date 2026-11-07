/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SsrfSecurityViolationError } from "./ai-transport-errors";

export interface ValidatedEndpoint {
  url: URL;
  origin: string;
  normalizedHostname: string;
  isSyntheticMock: boolean;
}

/**
 * Hostnames explicitly forbidden by SSRF policy.
 */
export const EXPLICIT_FORBIDDEN_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "::",
  "169.254.169.254", // AWS/GCP/Azure IPv4 metadata
  "metadata.google.internal",
  "metadata",
  "fd00:ec2::254", // AWS IMDSv6
]);

/**
 * Standard forbidden ports for AI provider transport.
 * Internal administration, Kubernetes, and non-standard endpoints are blocked.
 */
export const FORBIDDEN_PORTS = new Set([
  21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 445, 1433, 1521, 2375, 2376, 2379,
  2380, 3306, 3389, 5432, 6379, 6443, 8080, 8443, 9090, 9200, 10250, 10255, 10257, 10259,
]);

/**
 * Tries to parse any numeric IPv4 representation (integer, octal, hex, dotted shorthand).
 * Returns canonical [a, b, c, d] octets, or null if not a valid IPv4 representation.
 */
export function parseNumericIpv4(host: string): [number, number, number, number] | null {
  const trimmed = host.trim();

  // 1. Single 32-bit integer or hex/octal number: e.g. "2130706433", "0x7f000001", "017700000001"
  if (/^(0x[0-9a-fA-F]+|0[0-7]+|[0-9]+)$/.test(trimmed)) {
    const num = Number(trimmed);

    if (Number.isSafeInteger(num) && num >= 0 && num <= 0xffffffff) {
      return [
        (num >>> 24) & 255,
        (num >>> 16) & 255,
        (num >>> 8) & 255,
        num & 255,
      ];
    }
  }

  // 2. Dotted parts (1 to 4 parts)
  const parts = trimmed.split(".");

  if (parts.length >= 1 && parts.length <= 4) {
    const numericParts: number[] = [];

    for (const part of parts) {
      if (!part) return null;

      let val: number;

      if (part.startsWith("0x") || part.startsWith("0X")) {
        val = parseInt(part, 16);
      } else if (part.startsWith("0") && part.length > 1 && /^[0-7]+$/.test(part)) {
        val = parseInt(part, 8);
      } else if (/^\d+$/.test(part)) {
        val = parseInt(part, 10);
      } else {
        return null;
      }

      if (isNaN(val) || val < 0) return null;
      numericParts.push(val);
    }

    if (numericParts.length === 4) {
      if (numericParts.every(p => p <= 255)) {
        return [numericParts[0], numericParts[1], numericParts[2], numericParts[3]];
      }
    } else if (numericParts.length === 3) {
      // a.b.c -> c is 16-bit
      if (numericParts[0] <= 255 && numericParts[1] <= 255 && numericParts[2] <= 65535) {
        return [numericParts[0], numericParts[1], (numericParts[2] >>> 8) & 255, numericParts[2] & 255];
      }
    } else if (numericParts.length === 2) {
      // a.b -> b is 24-bit
      if (numericParts[0] <= 255 && numericParts[1] <= 0xffffff) {
        return [
          numericParts[0],
          (numericParts[1] >>> 16) & 255,
          (numericParts[1] >>> 8) & 255,
          numericParts[1] & 255,
        ];
      }
    }
  }

  return null;
}

/**
 * Checks if IPv4 octets fall into private, loopback, link-local, or reserved ranges.
 */
export function isPrivateOrReservedIpv4(a: number, b: number, c: number, d: number): boolean {
  // Loopback (127.0.0.0/8)
  if (a === 127) return true;

  // "This" host / network (0.0.0.0/8)
  if (a === 0) return true;

  // RFC 1918 Private: 10.0.0.0/8
  if (a === 10) return true;

  // RFC 1918 Private: 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // RFC 1918 Private: 192.168.0.0/16
  if (a === 192 && b === 168) return true;

  // Link-Local & AWS/GCP/Azure Metadata (169.254.0.0/16)
  if (a === 169 && b === 254) return true;

  // Carrier-Grade NAT (100.64.0.0/10: 100.64.0.0 to 100.127.255.255)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // Multicast & Reserved (224.0.0.0/4 and 240.0.0.0/4)
  if (a >= 224) return true;

  return false;
}

/**
 * Checks if an IPv6 address string is private, loopback, link-local, or reserved.
 */
export function isPrivateOrReservedIpv6(host: string): boolean {
  const clean = host.replace(/^\[|\]$/g, "").toLowerCase().trim();

  // Loopback (::1) or Unspecified (::)
  if (clean === "::1" || clean === "::") return true;

  // IPv4-mapped IPv6: ::ffff:127.0.0.1 (dotted) or ::ffff:7f00:1 (hex pairs)
  if (clean.startsWith("::ffff:")) {
    const rest = clean.slice(7);
    const parsedDotted = parseNumericIpv4(rest);
    if (parsedDotted) {
      return isPrivateOrReservedIpv4(...parsedDotted);
    }

    const hexParts = rest.split(":");
    if (hexParts.length === 2) {
      const high = parseInt(hexParts[0], 16);
      const low = parseInt(hexParts[1], 16);
      if (!isNaN(high) && !isNaN(low)) {
        return isPrivateOrReservedIpv4(
          (high >>> 8) & 255,
          high & 255,
          (low >>> 8) & 255,
          low & 255,
        );
      }
    }
  }

  // Link-Local (fe80::/10)
  if (clean.startsWith("fe80:") || clean.startsWith("fe8") || clean.startsWith("fe9") || clean.startsWith("fea") || clean.startsWith("feb")) {
    return true;
  }

  // Unique Local Address (fc00::/7 -> fc00:: or fd00::)
  if (clean.startsWith("fc") || clean.startsWith("fd")) {
    return true;
  }

  // Multicast (ff00::/8)
  if (clean.startsWith("ff")) {
    return true;
  }

  return false;
}

/**
 * Validates an endpoint URL against strict SSRF constraints.
 * Rejects non-HTTPS schemes, embedded credentials, loopbacks, private IPs,
 * metadata endpoints, and forbidden ports.
 */
export function validateTransportEndpoint(
  endpointUrl: string,
  options?: { allowSyntheticLocal?: boolean },
): ValidatedEndpoint {
  if (!endpointUrl || typeof endpointUrl !== "string") {
    throw new SsrfSecurityViolationError("Endpoint URL must be a non-empty string.");
  }

  let url: URL;

  try {
    url = new URL(endpointUrl);
  } catch {
    throw new SsrfSecurityViolationError(`Malformed endpoint URL: '${endpointUrl}'.`);
  }

  // 1. Strictly forbid embedded credentials (https://user:pass@evil.com)
  if (url.username || url.password) {
    throw new SsrfSecurityViolationError(
      "Endpoint URL contains embedded credentials (username/password), which is strictly prohibited.",
    );
  }

  // 2. Protocol enforcement: HTTPS only
  if (url.protocol !== "https:") {
    throw new SsrfSecurityViolationError(
      `Insecure scheme '${url.protocol}'. Only 'https:' endpoints are permitted for AI provider transport.`,
    );
  }

  // 3. Port check
  if (url.port) {
    const portNum = parseInt(url.port, 10);
    if (FORBIDDEN_PORTS.has(portNum)) {
      throw new SsrfSecurityViolationError(
        `Targeting forbidden port '${portNum}'. Transport blocked by security policy.`,
      );
    }
  }

  // 4. Hostname normalization
  let rawHostname = url.hostname.toLowerCase().trim();

  // Strip trailing dot (e.g. api.openai.com.)
  if (rawHostname.endsWith(".")) {
    rawHostname = rawHostname.slice(0, -1);
  }

  const hostWithoutBrackets = rawHostname.replace(/^\[|\]$/g, "");

  // Synthetic local test endpoint exemption
  const isSyntheticMock = hostWithoutBrackets === "synthetic-ai.local";
  if (isSyntheticMock) {
    if (options?.allowSyntheticLocal === false) {
      throw new SsrfSecurityViolationError("Synthetic local endpoint is not permitted in this context.");
    }

    return {
      url,
      origin: url.origin,
      normalizedHostname: hostWithoutBrackets,
      isSyntheticMock: true,
    };
  }

  // 5. Explicit forbidden hostnames
  if (EXPLICIT_FORBIDDEN_HOSTS.has(hostWithoutBrackets) || EXPLICIT_FORBIDDEN_HOSTS.has(rawHostname)) {
    throw new SsrfSecurityViolationError(
      `Prohibited loopback/metadata endpoint '${rawHostname}'. Access blocked by SSRF defense.`,
    );
  }

  // 6. Check internal domain suffixes
  if (
    hostWithoutBrackets.endsWith(".internal") ||
    hostWithoutBrackets.endsWith(".local") ||
    hostWithoutBrackets.endsWith(".localhost") ||
    hostWithoutBrackets.endsWith(".onion")
  ) {
    throw new SsrfSecurityViolationError(
      `Targeting internal or private domain '${hostWithoutBrackets}' is strictly prohibited.`,
    );
  }

  // 7. Numeric IPv4 parsing & check (catches decimal integers, octal, hex representations)
  const ipv4Octets = parseNumericIpv4(hostWithoutBrackets);
  if (ipv4Octets) {
    if (isPrivateOrReservedIpv4(...ipv4Octets)) {
      throw new SsrfSecurityViolationError(
        `Targeting internal/reserved IPv4 address '${ipv4Octets.join(".")}' (from '${hostWithoutBrackets}') is prohibited.`,
      );
    }
  }

  // 8. IPv6 check
  if (hostWithoutBrackets.includes(":") || rawHostname.startsWith("[")) {
    if (isPrivateOrReservedIpv6(hostWithoutBrackets)) {
      throw new SsrfSecurityViolationError(
        `Targeting internal/reserved IPv6 address '${hostWithoutBrackets}' is prohibited.`,
      );
    }
  }

  return {
    url,
    origin: url.origin,
    normalizedHostname: hostWithoutBrackets,
    isSyntheticMock: false,
  };
}

/**
 * Validates a DNS-resolved IP address to prevent DNS rebinding attacks.
 * Throws SsrfSecurityViolationError if the resolved IP points to private, loopback, or metadata addresses.
 */
export function validateResolvedIpAddress(ipAddress: string): void {
  if (!ipAddress || typeof ipAddress !== "string") {
    throw new SsrfSecurityViolationError("Resolved IP address must be a valid non-empty string.");
  }

  const trimmed = ipAddress.trim().toLowerCase();

  // Check IPv4
  const ipv4Octets = parseNumericIpv4(trimmed);
  if (ipv4Octets) {
    if (isPrivateOrReservedIpv4(...ipv4Octets)) {
      throw new SsrfSecurityViolationError(
        `DNS rebinding defense: resolved IP '${trimmed}' points to a private, loopback, or metadata network address. Connection blocked.`,
      );
    }
    return;
  }

  // Check IPv6
  if (trimmed.includes(":")) {
    if (isPrivateOrReservedIpv6(trimmed)) {
      throw new SsrfSecurityViolationError(
        `DNS rebinding defense: resolved IPv6 '${trimmed}' points to a private, loopback, or metadata network address. Connection blocked.`,
      );
    }
    return;
  }

  throw new SsrfSecurityViolationError(`Unrecognized resolved IP address format: '${ipAddress}'.`);
}

/**
 * Validates an HTTP redirect target against the full SSRF policy.
 * Cross-protocol or redirects to private IPs are strictly blocked.
 */
export function validateRedirectTarget(
  currentUrl: string,
  targetUrl: string,
  options?: { allowSyntheticLocal?: boolean },
): ValidatedEndpoint {
  let resolvedTarget: string;

  try {
    resolvedTarget = new URL(targetUrl, currentUrl).toString();
  } catch {
    throw new SsrfSecurityViolationError(`Malformed redirect target URL: '${targetUrl}'.`);
  }

  return validateTransportEndpoint(resolvedTarget, options);
}
