/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { LabelSelector, LabelMatchExpression } from "@openlens/kube-object";

/**
 * Evaluates whether a set of resource labels matches a Kubernetes LabelSelector.
 * Follows networking.k8s.io/v1 semantics:
 * - Empty selector `{}` matches all resources.
 * - `matchLabels`: every key-value pair must match.
 * - `matchExpressions`: supports In, NotIn, Exists, DoesNotExist.
 */
export function matchesSelector(
  labels: Record<string, string | undefined> | undefined,
  selector?: LabelSelector | null,
): boolean {
  if (!selector) {
    // An omitted selector in context where selector was optional means match all
    return true;
  }

  const { matchLabels, matchExpressions } = selector;

  const actualLabels = labels || {};

  // Check matchLabels
  if (matchLabels && Object.keys(matchLabels).length > 0) {
    for (const [key, value] of Object.entries(matchLabels)) {
      if (value === undefined) continue;

      if (!Object.prototype.hasOwnProperty.call(actualLabels, key)) {
        return false;
      }

      if (actualLabels[key] !== value) {
        return false;
      }
    }
  }

  // Check matchExpressions
  if (matchExpressions && matchExpressions.length > 0) {
    for (const expr of matchExpressions) {
      if (!matchesExpression(actualLabels, expr)) {
        return false;
      }
    }
  }

  return true;
}

function matchesExpression(
  labels: Record<string, string | undefined>,
  expr: LabelMatchExpression,
): boolean {
  const { key, operator, values = [] } = expr;
  const hasKey = Object.prototype.hasOwnProperty.call(labels, key) && labels[key] !== undefined;
  const val = labels[key];

  switch (operator) {
    case "In":
      return hasKey && values.includes(val as string);

    case "NotIn":
      return !hasKey || !values.includes(val as string);

    case "Exists":
      return hasKey;

    case "DoesNotExist":
      return !hasKey;

    default:
      return false;
  }
}
