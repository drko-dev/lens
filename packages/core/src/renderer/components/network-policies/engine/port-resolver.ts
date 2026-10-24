/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { NetworkPolicyPort, Pod } from "@openlens/kube-object";

export type PortMatchResult =
  | { matched: true }
  | { matched: false }
  | { matched: "indeterminate"; reason: string };

/**
 * Resolves a named port on a destination Pod.
 * Returns the numerical containerPort if found, or null if not found.
 */
export function resolveNamedPortOnPod(
  pod: Pod | undefined,
  portName: string,
  protocol = "TCP",
): number | null {
  if (!pod || !pod.spec?.containers) {
    return null;
  }

  const normalizedProto = protocol.toUpperCase();

  for (const container of pod.spec.containers) {
    if (!container.ports) continue;

    for (const port of container.ports) {
      const containerProto = (port.protocol ?? "TCP").toUpperCase();

      if (port.name === portName && containerProto === normalizedProto) {
        return port.containerPort;
      }
    }
  }

  return null;
}

/**
 * Matches a specific target port and protocol against a single NetworkPolicyPort rule.
 *
 * Semantic rules:
 * - If rulePort has no port defined: matches ALL ports on that protocol.
 * - If targetPort is undefined, but rulePort specifies a port/range:
 *   An unspecified target port query cannot be assumed to match. It is strictly indeterminate.
 * - If rulePort is a named port (string): resolved against destination pod containers.
 * - If rulePort is a number or endPort range: targetPort must match within range.
 */
export function matchesPolicyPort(
  rulePort: NetworkPolicyPort,
  targetPort: number | string | undefined,
  targetProtocol = "TCP",
  destinationPod?: Pod,
): PortMatchResult {
  const ruleProtocol = (rulePort.protocol ?? "TCP").toUpperCase();
  const actualProtocol = targetProtocol.toUpperCase();

  if (ruleProtocol !== actualProtocol) {
    return { matched: false };
  }

  // If rule has no port defined, it matches all ports on this protocol
  if (rulePort.port === undefined || rulePort.port === null) {
    return { matched: true };
  }

  // If target port is not specified, but rule requires a specific port or range:
  // An unspecified target port cannot be claimed as universally allowed.
  // It is indeterminate (under-specified query).
  if (targetPort === undefined || targetPort === null) {
    const rangeStr = rulePort.endPort ? `-${rulePort.endPort}` : "";

    return {
      matched: "indeterminate",
      reason: `Rule restricts traffic to port ${rulePort.port}${rangeStr}/${ruleProtocol}; connection query does not specify a target port`,
    };
  }

  // Case 1: rule port is a string (named port)
  if (typeof rulePort.port === "string") {
    if (!destinationPod) {
      return {
        matched: "indeterminate",
        reason: `Cannot resolve named port '${rulePort.port}': destination pod metadata is unavailable`,
      };
    }

    const resolved = resolveNamedPortOnPod(destinationPod, rulePort.port, ruleProtocol);

    if (resolved === null) {
      return {
        matched: "indeterminate",
        reason: `Named port '${rulePort.port}' could not be resolved on destination pod '${destinationPod.getName()}'`,
      };
    }

    const targetPortNum = typeof targetPort === "number"
      ? targetPort
      : resolveNamedPortOnPod(destinationPod, targetPort, ruleProtocol);

    if (targetPortNum === null) {
      return {
        matched: "indeterminate",
        reason: `Queried target port '${targetPort}' cannot be resolved to a port number on destination pod`,
      };
    }

    return targetPortNum === resolved ? { matched: true } : { matched: false };
  }

  // Case 2: rule port is a number
  const rulePortNum = Number(rulePort.port);

  let targetPortNum: number;

  if (typeof targetPort === "number") {
    targetPortNum = targetPort;
  } else {
    // targetPort is a named port string, try resolving on destination pod
    if (destinationPod) {
      const resolved = resolveNamedPortOnPod(destinationPod, targetPort, ruleProtocol);

      if (resolved === null) {
        return {
          matched: "indeterminate",
          reason: `Target named port '${targetPort}' could not be resolved on destination pod '${destinationPod.getName()}'`,
        };
      }

      targetPortNum = resolved;
    } else {
      return {
        matched: "indeterminate",
        reason: `Target named port '${targetPort}' requires destination pod to resolve`,
      };
    }
  }

  // Check endPort range if defined
  if (typeof rulePort.endPort === "number" && rulePort.endPort >= rulePortNum) {
    return targetPortNum >= rulePortNum && targetPortNum <= rulePort.endPort
      ? { matched: true }
      : { matched: false };
  }

  return targetPortNum === rulePortNum ? { matched: true } : { matched: false };
}

/**
 * Matches target port and protocol against a list of rule ports (OR logic).
 * An empty or undefined list matches ANY port and ANY protocol.
 */
export function matchesAnyPolicyPort(
  rulePorts: NetworkPolicyPort[] | undefined,
  targetPort: number | string | undefined,
  targetProtocol = "TCP",
  destinationPod?: Pod,
): PortMatchResult {
  if (!rulePorts || rulePorts.length === 0) {
    return { matched: true };
  }

  let hasIndeterminate: { matched: "indeterminate"; reason: string } | null = null;

  for (const rulePort of rulePorts) {
    const result = matchesPolicyPort(rulePort, targetPort, targetProtocol, destinationPod);

    if (result.matched === true) {
      return { matched: true };
    }

    if (result.matched === "indeterminate") {
      hasIndeterminate = result;
    }
  }

  if (hasIndeterminate) {
    return hasIndeterminate;
  }

  return { matched: false };
}
