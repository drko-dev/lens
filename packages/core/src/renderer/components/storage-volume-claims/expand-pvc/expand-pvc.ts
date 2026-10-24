/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { PersistentVolumeClaim, StorageClass } from "@openlens/kube-object";
import type { JsonPatch } from "../../../../common/k8s-api/kube-object.store";

export interface ExpansionValidation {
  valid: boolean;
  error?: string;
}

export interface ExpansionSizeComparison {
  currentBytes: bigint;
  requestedBytes: bigint | undefined;
}

export type ExpansionPhase =
  | "requested"
  | "accepted"
  | "pending"
  | "capacityUpdated"
  | "error";

interface QuantityParseSuccess { valid: true; bytes: bigint }

interface QuantityParseFailure { valid: false; error: string }

export type QuantityParseResult = QuantityParseSuccess | QuantityParseFailure;

// No BigInt literals in this file: the project targets a TS level below ES2020 and
// BigInt(Number) loses precision past 2^53, so extreme values are built from strings.
const INT64_MAX = BigInt("9223372036854775807");

// Guards against oversized/bomb-like inputs: 64 characters is far more than the
// 19 digits int64 can hold plus any suffix/fraction that Kubernetes tolerates,
// and |exponent| > 20 can never round-trip to an int64 byte count, so 32 is a
// generous practical bound that keeps exponentiation cheap and bounded.
const MAX_QUANTITY_CHARS = 64;
const MAX_EXPONENT_ABS = 32;

const binarySuffixes: Record<string, bigint> = {
  Ei: BigInt(1024) ** BigInt(6),
  Pi: BigInt(1024) ** BigInt(5),
  Ti: BigInt(1024) ** BigInt(4),
  Gi: BigInt(1024) ** BigInt(3),
  Mi: BigInt(1024) ** BigInt(2),
  Ki: BigInt(1024),
};

const decimalSuffixes: Record<string, bigint> = {
  E: BigInt(1000) ** BigInt(6),
  P: BigInt(1000) ** BigInt(5),
  T: BigInt(1000) ** BigInt(4),
  G: BigInt(1000) ** BigInt(3),
  M: BigInt(1000) ** BigInt(2),
  k: BigInt(1000),
};

const plainNumberPattern = "^(?<num>[0-9]+(?:\\.[0-9]+)?)";
const siSuffixPattern = "(?<si>Ei|Pi|Ti|Gi|Mi|Ki|[EPTGMk])?$";
const exponentPattern = "^(?<num2>[0-9]+(?:\\.[0-9]+)?)[eE](?<exp>[+-]?[0-9]+)$";

const plainRegex = new RegExp(plainNumberPattern + siSuffixPattern);
const exponentRegex = new RegExp(exponentPattern);

const tenPow = (exp: number): bigint => BigInt(10) ** BigInt(exp);

const splitNumberPart = (num: string): { numerator: bigint; fractionDigits: number } => {
  const [intPart, fractionPart] = num.split(".");

  return {
    numerator: BigInt(`${intPart}${fractionPart ?? ""}`),
    fractionDigits: fractionPart?.length ?? 0,
  };
};

const exactIntegerBytes = (numerator: bigint, denominator: bigint): QuantityParseResult => {
  const remainder = numerator % denominator;

  if (remainder !== BigInt(0)) {
    return { valid: false, error: "Quantity is not an exact whole number of bytes." };
  }

  const bytes = numerator / denominator;

  if (bytes > INT64_MAX) {
    return { valid: false, error: "Quantity exceeds the Kubernetes int64 ceiling." };
  }

  return { valid: true, bytes };
};

/**
 * Parses a Kubernetes quantity into exactly representable bytes using BigInt
 * only — no parseFloat/Number conversions anywhere on the comparison path.
 */
export const parseQuantity = (value: string): QuantityParseResult => {
  const trimmed = value.trim();

  if (!trimmed) {
    return { valid: false, error: "Quantity is empty." };
  }

  if (trimmed.length > MAX_QUANTITY_CHARS) {
    return { valid: false, error: `Quantity is too long (maximum ${MAX_QUANTITY_CHARS} characters).` };
  }

  const plainMatch = trimmed.match(plainRegex);

  if (plainMatch?.groups) {
    const plainGroups = plainMatch.groups;
    const num = plainGroups?.num;
    const si = plainGroups?.si;

    if (typeof num !== "string") {
      return { valid: false, error: `Unable to parse "${trimmed}" as a Kubernetes quantity.` };
    }

    const { numerator: base, fractionDigits } = splitNumberPart(num);
    const magnitude = si
      ? binarySuffixes[si] ?? decimalSuffixes[si]
      : undefined;

    if (si && !magnitude) {
      return { valid: false, error: `Unsupported quantity suffix "${si}".` };
    }

    return exactIntegerBytes(base * (magnitude ?? BigInt(1)), tenPow(fractionDigits));
  }

  const exponentMatch = trimmed.match(exponentRegex);

  if (exponentMatch?.groups) {
    const groups = exponentMatch.groups;
    const num2 = groups?.num2;
    const exp = groups?.exp;

    if (typeof num2 !== "string" || typeof exp !== "string") {
      return { valid: false, error: `Unable to parse "${trimmed}" as a Kubernetes quantity.` };
    }

    const expValue = Number(exp);

    if (!Number.isFinite(expValue) || Math.abs(expValue) > MAX_EXPONENT_ABS) {
      return {
        valid: false,
        error: `Quantity exponent is out of the supported range (maximum absolute value ${MAX_EXPONENT_ABS}).`,
      };
    }

    const { numerator: base, fractionDigits } = splitNumberPart(num2);

    let numerator = base;
    let denominator = tenPow(fractionDigits);

    if (expValue >= 0) {
      numerator = base * tenPow(expValue);
    } else {
      denominator = denominator * tenPow(-expValue);
    }

    return exactIntegerBytes(numerator, denominator);
  }

  return { valid: false, error: `Unable to parse "${trimmed}" as a Kubernetes quantity.` };
};

export const validatePvcExpansion = (
  pvc: PersistentVolumeClaim,
  requestedSize: string,
  storageClass?: StorageClass,
): ExpansionValidation => {
  const requested = requestedSize.trim();

  if (!requested) {
    return { valid: false, error: "Enter a new size." };
  }

  const parsedRequested = parseQuantity(requested);

  if (!parsedRequested.valid) {
    return { valid: false, error: `Unable to parse "${requested}" as a Kubernetes quantity: ${parsedRequested.error}` };
  }

  if (parsedRequested.bytes <= BigInt(0)) {
    return { valid: false, error: "Size must be greater than zero." };
  }

  const currentSize = pvc.spec.resources?.requests?.storage ?? "";
  const parsedCurrent = currentSize ? parseQuantity(currentSize) : { valid: true as const, bytes: BigInt(0) };

  if (!parsedCurrent.valid) {
    return { valid: false, error: `Unable to parse current size "${currentSize}": ${parsedCurrent.error}` };
  }

  if (parsedRequested.bytes <= parsedCurrent.bytes) {
    return { valid: false, error: `Requested size (${requested}) must be greater than current size (${currentSize || "0"}).` };
  }

  const storageClassName = pvc.spec.storageClassName;

  if (!storageClassName) {
    return { valid: false, error: "PVC has no storage class; expansion is not supported." };
  }

  if (!storageClass) {
    return { valid: false, error: `Storage class "${storageClassName}" not found.` };
  }

  if (!storageClass.allowVolumeExpansion) {
    return { valid: false, error: `Storage class "${storageClassName}" does not allow volume expansion.` };
  }

  return { valid: true };
};

export const getExpansionSizeComparison = (
  pvc: PersistentVolumeClaim,
  requestedSize: string,
): ExpansionSizeComparison => {
  const currentSize = pvc.spec.resources?.requests?.storage ?? "";
  const currentParsed = parseQuantity(currentSize);
  const requestedParsed = requestedSize.trim() ? parseQuantity(requestedSize.trim()) : undefined;

  return {
    currentBytes: currentParsed.valid ? currentParsed.bytes : BigInt(0),
    requestedBytes: requestedParsed?.valid ? requestedParsed.bytes : undefined,
  };
};

/**
 * Builds the preconditional JSON Patch. Both `uid` and `resourceVersion` are
 * mandatory: a patch without both test operations must never be produced.
 */
export const buildPvcExpansionPatch = (
  pvc: PersistentVolumeClaim,
  newSize: string,
): JsonPatch => {
  const uid = pvc.metadata.uid;
  const resourceVersion = pvc.metadata.resourceVersion;
  const size = newSize.trim();

  if (!uid || !resourceVersion) {
    throw new Error("PVC metadata is incomplete (missing uid/resourceVersion); refusing to build a preconditioned patch.");
  }

  const parsed = parseQuantity(size);

  if (!parsed.valid) {
    throw new Error(`Refusing to build patch for invalid quantity "${size}": ${parsed.error}`);
  }

  if (parsed.bytes <= BigInt(0)) {
    throw new Error(`Refusing to build patch for non-positive quantity "${size}".`);
  }

  return [
    { op: "test", path: "/metadata/uid", value: uid },
    { op: "test", path: "/metadata/resourceVersion", value: resourceVersion },
    { op: "replace", path: "/spec/resources/requests/storage", value: size },
  ];
};

interface PvcCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
}

const findCondition = (conditions: PvcCondition[] | undefined, type: string): PvcCondition | undefined =>
  conditions?.find(condition => condition.type === type);

export const classifyPvcExpansionPhase = (
  pvc: PersistentVolumeClaim,
  requestedSize: string,
): ExpansionPhase => {
  const parsedRequested = parseQuantity(requestedSize.trim());

  if (!parsedRequested.valid) {
    return "error";
  }

  const currentSpecSize = parseQuantity(pvc.spec.resources?.requests?.storage ?? "");

  if (!currentSpecSize.valid || currentSpecSize.bytes !== parsedRequested.bytes) {
    return "error";
  }

  const capacity = parseQuantity(pvc.status?.capacity?.storage ?? "");

  if (capacity.valid && capacity.bytes >= parsedRequested.bytes) {
    return "capacityUpdated";
  }

  const conditions = pvc.status?.conditions;

  if (findCondition(conditions, "ControllerResizeFailed")) {
    return "error";
  }

  if (
    findCondition(conditions, "Resizing")
    || findCondition(conditions, "FileSystemResizePending")
    || findCondition(conditions, "ControllerResizeInProgress")
  ) {
    return "pending";
  }

  return "pending";
};
