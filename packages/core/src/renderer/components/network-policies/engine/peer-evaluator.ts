/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { NetworkPolicyPeer, Namespace } from "@openlens/kube-object";
import { matchesSelector } from "./selector";
import { matchesIpBlock } from "./cidr";
import type { EvaluatedPeer } from "./types";

export type PeerMatchResult =
  | { matches: true }
  | { matches: false }
  | { matches: "indeterminate"; reason: string };

/**
 * Evaluates whether a peer (Pod or IP) matches a single NetworkPolicyPeer rule.
 *
 * Semantic rules (networking.k8s.io/v1):
 * - If ipBlock is set: matches against peer IP CIDR. If peer has no IP, returns indeterminate.
 * - If podSelector without namespaceSelector: selects pods in policy's own namespace.
 * - If namespaceSelector without podSelector: selects all pods in matching namespaces.
 * - If both namespaceSelector and podSelector: intersection (matching namespace AND matching pod labels).
 * - Empty NetworkPolicyPeer `{}`: invalid per the networking.k8s.io/v1 schema (a valid peer must
 *   specify at least one of podSelector, namespaceSelector, or ipBlock). Because the rule cannot be
 *   trusted, the match is reported as indeterminate instead of a definitive value.
 * - Namespace labels MUST be validated against real Namespace objects. If missing from store, result is indeterminate.
 */
export function matchesPeer(
  peerRule: NetworkPolicyPeer,
  targetPeer: EvaluatedPeer,
  policyNamespace: string,
  namespaceMap: Map<string, Namespace>,
): PeerMatchResult {
  // Case 1: IP Block
  if (peerRule.ipBlock) {
    if (!targetPeer.ip) {
      return {
        matches: "indeterminate",
        reason: `Rule requires ipBlock ${peerRule.ipBlock.cidr}, but peer '${targetPeer.name}' has no IP available to evaluate`,
      };
    }

    const matched = matchesIpBlock(targetPeer.ip, peerRule.ipBlock);

    return { matches: matched };
  }

  // Case 2: Pod / Namespace Selectors (only applies to Pod peers)
  if (targetPeer.type !== "pod" || !targetPeer.pod) {
    return { matches: false };
  }

  const pod = targetPeer.pod;
  const podNs = pod.getNs();

  // If namespaceSelector is present
  if (peerRule.namespaceSelector !== undefined) {
    const nsObj = namespaceMap.get(podNs);

    if (!nsObj) {
      return {
        matches: "indeterminate",
        reason: `Namespace '${podNs}' object is not available in store to evaluate namespaceSelector labels`,
      };
    }

    // NamespaceStore materializes placeholder namespaces (no uid, no labels) when the cluster
    // restricts access to an explicit namespace list. Those placeholders carry no label
    // information, so a namespaceSelector cannot be evaluated against them.
    if (!nsObj.getId()) {
      return {
        matches: "indeterminate",
        reason: `Namespace '${podNs}' is a placeholder without label metadata, so namespaceSelector cannot be evaluated`,
      };
    }

    const nsLabels = nsObj.metadata?.labels ?? {};
    const nsMatches = matchesSelector(nsLabels, peerRule.namespaceSelector);

    if (!nsMatches) {
      return { matches: false };
    }

    // If podSelector is ALSO present: intersection (logical AND)
    if (peerRule.podSelector !== undefined) {
      const podLabels = pod.metadata?.labels ?? {};

      return matchesSelector(podLabels, peerRule.podSelector) ? { matches: true } : { matches: false };
    }

    // namespaceSelector alone: matches all pods in the matching namespace
    return { matches: true };
  }

  // If podSelector is present WITHOUT namespaceSelector:
  // Peer must be in the policy's own namespace!
  if (peerRule.podSelector !== undefined) {
    if (podNs !== policyNamespace) {
      return { matches: false };
    }

    const podLabels = pod.metadata?.labels ?? {};

    return matchesSelector(podLabels, peerRule.podSelector) ? { matches: true } : { matches: false };
  }

  // An empty NetworkPolicyPeer `{}` (neither podSelector, namespaceSelector, nor ipBlock specified):
  // The networking.k8s.io/v1 schema requires at least one of those fields, so the peer is invalid
  // and cannot drive a definitive verdict. Report indeterminate (fail-open to uncertainty, not to
  // a false "allowed" or a false "denied").
  return {
    matches: "indeterminate",
    reason: `NetworkPolicyPeer vacío {} en la regla: el esquema networking.k8s.io/v1 exige al menos uno de podSelector / namespaceSelector / ipBlock, por lo que no es posible decidir si la regla aplica a '${targetPeer.name}'`,
  };
}

/**
 * Evaluates whether a peer matches an array of NetworkPolicyPeers (OR logic / alternatives).
 *
 * Kubernetes networking.k8s.io/v1 semantics:
 * - If `from` or `to` is omitted (`undefined`) OR explicitly empty (`[]`):
 *   The rule does not restrict sources/destinations, therefore matching ALL peers!
 * - If `from` or `to` contains at least one item:
 *   The items represent alternatives (logical OR). Matches if ANY peer rule matches.
 */
export function matchesAnyPeer(
  peers: NetworkPolicyPeer[] | undefined,
  targetPeer: EvaluatedPeer,
  policyNamespace: string,
  namespaceMap: Map<string, Namespace>,
): PeerMatchResult {
  // If `from` or `to` field is omitted or an empty list `[]`, traffic is not restricted by peer
  if (!peers || peers.length === 0) {
    return { matches: true };
  }

  let hasIndeterminate: { matches: "indeterminate"; reason: string } | null = null;

  for (const peerRule of peers) {
    const res = matchesPeer(peerRule, targetPeer, policyNamespace, namespaceMap);

    if (res.matches === true) {
      return { matches: true };
    }

    if (res.matches === "indeterminate") {
      hasIndeterminate = res;
    }
  }

  if (hasIndeterminate) {
    return hasIndeterminate;
  }

  return { matches: false };
}
