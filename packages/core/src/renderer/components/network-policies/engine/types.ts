/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { NetworkPolicy, Pod, Namespace } from "@openlens/kube-object";

export type PolicyVerdict = "allowed" | "denied" | "indeterminate";

export type DataEvaluationState =
  | "ready"
  | "partial-data"
  | "permission-denied"
  | "loading"
  | "unknown"
  | "disconnected";

export interface PolicyEvaluationContext {
  pods: Pod[];
  namespaces: Namespace[];
  policies: NetworkPolicy[];
  state: DataEvaluationState;
  stateMessage?: string;
  clusterId?: string;
}

export interface MatchedPolicyRef {
  name: string;
  namespace: string;
  ruleIndex?: number;
  description?: string;
}

export interface EvaluatedPeer {
  type: "pod" | "ip" | "external";
  name: string;
  namespace?: string;
  ip?: string;
  pod?: Pod;
}

export interface EvaluatedConnection {
  id: string;
  source: EvaluatedPeer;
  destination: EvaluatedPeer;
  port?: number | string;
  /**
   * Scope of the port evaluated in this row:
   * - "declared": a concrete port declared by the policy rule or by a container.
   * - "all": the rule does not restrict ports, so every port is covered by this row.
   * - "other": every port NOT explicitly declared elsewhere (potentially accessible ports that
   *   the policy does not enumerate). This row must never be reported as "allowed" when the
   *   policy only allows a subset of ports.
   */
  portScope?: PortScope;
  protocol: string;
  verdict: PolicyVerdict;
  egressVerdict: PolicyVerdict;
  ingressVerdict: PolicyVerdict;
  egressExplanation: string;
  ingressExplanation: string;
  matchedEgressPolicies: MatchedPolicyRef[];
  matchedIngressPolicies: MatchedPolicyRef[];
  indeterminateReason?: string;
}

export type PortScope = "declared" | "all" | "other";

export interface PodIsolationStatus {
  podName: string;
  podNamespace: string;
  isIngressIsolated: boolean;
  isEgressIsolated: boolean;
  selectingPolicies: NetworkPolicy[];
  ingressPolicies: NetworkPolicy[];
  egressPolicies: NetworkPolicy[];
  dataState?: DataEvaluationState;
  stateReason?: string;
}

export interface MatrixBuildResult {
  connections: EvaluatedConnection[];
  totalEvaluated: number;
  isPartial: boolean;
  totalCandidatePairs: number;
  /**
   * Why the result is partial. Always populated when isPartial is true so the UI can disclose
   * the omission instead of silently truncating the matrix.
   */
  partialReason?: string;
  /** Number of pods selected by the evaluated policy. */
  selectedPodCount: number;
  /** Number of candidate peer pods considered. */
  candidatePodCount: number;
  /** Explicit evaluation budget (max connections) applied to this build. */
  maxConnections: number;
  /** Total number of connections that would be produced without the budget. */
  totalPossibleConnections: number;
}
