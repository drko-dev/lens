/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { parseK8sQuantity, formatQuantity } from "./quantity-parser";
import type { ResourceQuota } from "@openlens/kube-object";

export type HeadroomStatus = "normal" | "warning" | "critical" | "N/A";

export interface HeadroomMetric {
  resourceName: string;
  usedRaw: string;
  hardRaw: string;
  usedNum?: number;
  hardNum?: number;
  usedFormatted: string;
  hardFormatted: string;
  percentage?: number;
  status: HeadroomStatus;
}

export interface ResourceQuotaHeadroomReport {
  quotaName: string;
  namespace: string;
  scopes?: string[];
  metrics: HeadroomMetric[];
  highestStatus: HeadroomStatus;
}

/**
 * Calculates headroom metric for a single resource in a ResourceQuota.
 *
 * Strict Semantics (Hallazgo B):
 * - If usedRaw is missing (undefined, null, or empty string): utilization is unknown -> status: "N/A", percentage: undefined.
 * - If usedRaw is explicitly "0" (or "0m", "0Ki"): utilization is 0% -> status: "normal", percentage: 0 (if valid hard limit exists).
 * - If hard limit is missing, zero, or unparsable: status: "N/A", percentage: undefined.
 */
export function calculateMetricHeadroom(resourceName: string, usedRaw?: string, hardRaw?: string): HeadroomMetric {
  const safeHardRaw = hardRaw ?? "";
  const hardNum = parseK8sQuantity(resourceName, safeHardRaw);

  // 1. Check for absent / unknown utilization
  if (usedRaw === undefined || usedRaw === null || usedRaw.trim() === "") {
    return {
      resourceName,
      usedRaw: "",
      hardRaw: safeHardRaw,
      usedNum: undefined,
      hardNum,
      usedFormatted: "N/A",
      hardFormatted: hardNum !== undefined && hardNum > 0 ? formatQuantity(resourceName, hardNum) : safeHardRaw || "N/A",
      percentage: undefined,
      status: "N/A",
    };
  }

  const usedNum = parseK8sQuantity(resourceName, usedRaw);

  // 2. If hard limit is missing, zero, or unparsable, or usedNum is unparsable: status is N/A
  if (hardNum === undefined || hardNum <= 0 || usedNum === undefined) {
    return {
      resourceName,
      usedRaw,
      hardRaw: safeHardRaw,
      usedNum,
      hardNum,
      usedFormatted: usedNum !== undefined ? formatQuantity(resourceName, usedNum) : usedRaw || "N/A",
      hardFormatted: hardNum !== undefined && hardNum > 0 ? formatQuantity(resourceName, hardNum) : safeHardRaw || "N/A",
      percentage: undefined,
      status: "N/A",
    };
  }

  // 3. Both usedNum and hardNum are valid numbers with hardNum > 0
  const percentage = (usedNum / hardNum) * 100;

  let status: HeadroomStatus = "normal";

  if (percentage >= 90) {
    status = "critical";
  } else if (percentage >= 80) {
    status = "warning";
  }

  return {
    resourceName,
    usedRaw,
    hardRaw: safeHardRaw,
    usedNum,
    hardNum,
    usedFormatted: formatQuantity(resourceName, usedNum),
    hardFormatted: formatQuantity(resourceName, hardNum),
    percentage,
    status,
  };
}

/**
 * Determines overall highest severity status from a list of statuses
 */
export function getHighestStatus(statuses: HeadroomStatus[]): HeadroomStatus {
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("warning")) return "warning";
  if (statuses.includes("normal")) return "normal";

  return "N/A";
}

/**
 * Calculates complete headroom report for a ResourceQuota
 */
export function calculateQuotaHeadroom(quota: ResourceQuota): ResourceQuotaHeadroomReport {
  const quotaName = quota.getName?.() ?? quota.metadata?.name ?? "unknown";
  const namespace = quota.getNs?.() ?? quota.metadata?.namespace ?? "default";
  const scopes = (quota.spec as any)?.scopes;

  // Extract hard limits from status.hard, falling back to spec.hard if status is missing
  const hard = quota.status?.hard ?? quota.spec?.hard ?? {};
  // Extract used resources strictly from status.used. If status or status.used is missing, used is undefined!
  const used = quota.status?.used;

  // Standard ordered resource keys for consistent UI
  const priorityKeys = [
    "requests.cpu",
    "limits.cpu",
    "cpu",
    "requests.memory",
    "limits.memory",
    "memory",
    "pods",
    "requests.storage",
    "persistentvolumeclaims",
    "services",
    "secrets",
    "configmaps",
  ];

  const presentKeys = Object.keys(hard);
  const orderedKeys = [
    ...priorityKeys.filter(k => presentKeys.includes(k)),
    ...presentKeys.filter(k => !priorityKeys.includes(k)),
  ];

  const metrics = orderedKeys.map(key => {
    const usedVal = used ? used[key] : undefined;
    const hardVal = hard[key];

    return calculateMetricHeadroom(key, usedVal, hardVal);
  });
  const highestStatus = getHighestStatus(metrics.map(m => m.status));

  return {
    quotaName,
    namespace,
    scopes,
    metrics,
    highestStatus,
  };
}
