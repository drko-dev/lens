/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// Pure Kubernetes Quantity Parser according to k8s.io/apimachinery/pkg/api/resource

const BINARY_SI_FACTORS: Record<string, number> = {
  "Ki": 1024,
  "Mi": 1024 ** 2,
  "Gi": 1024 ** 3,
  "Ti": 1024 ** 4,
  "Pi": 1024 ** 5,
  "Ei": 1024 ** 6,
  // Also accept optional trailing B
  "KiB": 1024,
  "MiB": 1024 ** 2,
  "GiB": 1024 ** 3,
  "TiB": 1024 ** 4,
  "PiB": 1024 ** 5,
  "EiB": 1024 ** 6,
};

const DECIMAL_SI_FACTORS: Record<string, number> = {
  "k": 1000,
  "M": 1000 ** 2,
  "G": 1000 ** 3,
  "T": 1000 ** 4,
  "P": 1000 ** 5,
  "E": 1000 ** 6,
  // Also accept optional trailing B
  "kB": 1000,
  "MB": 1000 ** 2,
  "GB": 1000 ** 3,
  "TB": 1000 ** 4,
  "PB": 1000 ** 5,
  "EB": 1000 ** 6,
};

const CPU_SUFFIX_MILLIS: Record<string, number> = {
  "n": 1e-6, // 1 nanocore = 10^-6 millicores
  "u": 1e-3, // 1 microcore = 10^-3 millicores
  "m": 1,    // 1 millicore = 1 millicore
  "": 1000,  // 1 core = 1000 millicores
};

/**
 * Strict regex for a single numeric component with at most one decimal point.
 * Matches: 1, 0.5, .5, 100, 1.25e3.
 * Strictly rejects multiple decimal points (1..2, 2.3.4), trailing garbage (12pods), etc.
 */
const STRICT_NUMBER_REGEX = /^[+]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;

/**
 * Parses CPU quantity to millicores (1 core = 1000m)
 * Avoids distorting rounding for valid fractional CPU quantities (e.g. 1.5m).
 * Rejects invalid patterns (e.g. 1..2, 2.3.4m, 12cpu).
 */
export function parseCpuQuantity(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;

  if (typeof value === "number") {
    if (isNaN(value) || !isFinite(value) || value < 0) return undefined;

    return Math.round(value * 1000 * 1000) / 1000;
  }

  const trimmed = value.trim();

  if (!trimmed) return undefined;

  const match = trimmed.match(/^([+]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+))(?:[eE][+-]?\d+)?)\s*([num]?)$/);

  if (!match) return undefined;

  const numStr = match[1];

  if (!STRICT_NUMBER_REGEX.test(numStr)) return undefined;

  const num = Number(numStr);

  if (isNaN(num) || !isFinite(num) || num < 0) return undefined;

  const suffix = match[2];
  const factor = CPU_SUFFIX_MILLIS[suffix];

  if (factor === undefined) return undefined;

  const millicores = num * factor;

  // Preserve up to 3 decimal places for fractional millicores without distorting valid quantities
  return Math.round(millicores * 1000) / 1000;
}

/**
 * Parses Memory or Storage quantity to bytes
 * Rejects invalid patterns with multiple dots or unrecognised suffixes (e.g. 1.2.3Gi, 1..2).
 */
export function parseMemoryQuantity(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;

  if (typeof value === "number") {
    if (isNaN(value) || !isFinite(value) || value < 0) return undefined;

    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) return undefined;

  // Check binary SI first (e.g. 100Mi, 2Gi)
  const binaryMatch = trimmed.match(/^([+]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+))(?:[eE][+-]?\d+)?)\s*([KMGTPE]iB?)$/);

  if (binaryMatch) {
    const numStr = binaryMatch[1];

    if (!STRICT_NUMBER_REGEX.test(numStr)) return undefined;

    const num = Number(numStr);
    const factor = BINARY_SI_FACTORS[binaryMatch[2]];

    if (isNaN(num) || !isFinite(num) || num < 0 || factor === undefined) return undefined;

    return Math.round(num * factor);
  }

  // Check decimal SI (e.g. 100M, 2G, 500k)
  const decimalMatch = trimmed.match(/^([+]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+))(?:[eE][+-]?\d+)?)\s*([kKMGTPE]B?)$/);

  if (decimalMatch) {
    const numStr = decimalMatch[1];

    if (!STRICT_NUMBER_REGEX.test(numStr)) return undefined;

    const num = Number(numStr);
    const unit = decimalMatch[2];
    const factor = DECIMAL_SI_FACTORS[unit] ?? DECIMAL_SI_FACTORS[unit.toUpperCase()];

    if (isNaN(num) || !isFinite(num) || num < 0 || factor === undefined) return undefined;

    return Math.round(num * factor);
  }

  // Plain number (bytes)
  const plainMatch = trimmed.match(/^([+]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+))(?:[eE][+-]?\d+)?)$/);

  if (plainMatch) {
    const numStr = plainMatch[1];

    if (!STRICT_NUMBER_REGEX.test(numStr)) return undefined;

    const num = Number(numStr);

    if (isNaN(num) || !isFinite(num) || num < 0) return undefined;

    return Math.round(num);
  }

  return undefined;
}

/**
 * Parses Count quantity (pods, pvc, services, etc.)
 * Strictly enforces integer quantities. Rejects fractional counts (1.5),
 * multiple dots (1..2), and unrecognised suffixes or trailing text (12pods).
 */
export function parseCountQuantity(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;

  if (typeof value === "number") {
    if (isNaN(value) || !isFinite(value) || value < 0) return undefined;

    // Kubernetes object counts must be non-negative integers
    if (!Number.isInteger(value)) return undefined;

    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) return undefined;

  // Strict integer regex: only non-negative integers without fractions or trailing text
  const match = trimmed.match(/^[+]?(0|[1-9]\d*)$/);

  if (!match) return undefined;

  const num = Number(match[0]);

  if (isNaN(num) || !isFinite(num) || num < 0) return undefined;

  return num;
}

/**
 * Dispatches to the appropriate quantity parser according to the Kubernetes resource name
 */
export function parseK8sQuantity(resourceName: string, value: string | number | undefined | null): number | undefined {
  const lower = resourceName.toLowerCase();

  if (lower.includes("cpu")) {
    return parseCpuQuantity(value);
  }

  if (lower.includes("memory") || lower.includes("storage") || lower.includes("ephemeral-storage")) {
    return parseMemoryQuantity(value);
  }

  return parseCountQuantity(value);
}

/**
 * Formats a quantity value back into a human-readable string
 */
export function formatQuantity(resourceName: string, value: number): string {
  if (isNaN(value) || !isFinite(value) || value < 0) return "N/A";

  const lower = resourceName.toLowerCase();

  if (lower.includes("cpu")) {
    // value in millicores
    if (value >= 1000) {
      const cores = value / 1000;

      return Number.isInteger(cores) ? `${cores}` : `${cores.toFixed(2)} cores`;
    }

    return `${value}m`;
  }

  if (lower.includes("memory") || lower.includes("storage") || lower.includes("ephemeral-storage")) {
    // value in bytes
    const GiB = 1024 ** 3;
    const MiB = 1024 ** 2;
    const KiB = 1024;

    if (value >= GiB) {
      const gib = value / GiB;

      return `${gib.toFixed(1)} GiB`;
    }

    if (value >= MiB) {
      const mib = value / MiB;

      return `${mib.toFixed(1)} MiB`;
    }

    if (value >= KiB) {
      const kib = value / KiB;

      return `${kib.toFixed(0)} KiB`;
    }

    return `${value} B`;
  }

  return `${value}`;
}
