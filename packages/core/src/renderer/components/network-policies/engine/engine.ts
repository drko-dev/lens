/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { NetworkPolicy, Pod, Namespace, PolicyType } from "@openlens/kube-object";
import { matchesSelector } from "./selector";
import { matchesAnyPeer } from "./peer-evaluator";
import { matchesAnyPolicyPort } from "./port-resolver";
import type {
  DataEvaluationState,
  EvaluatedConnection,
  EvaluatedPeer,
  MatchedPolicyRef,
  MatrixBuildResult,
  PodIsolationStatus,
  PolicyEvaluationContext,
  PolicyVerdict,
  PortScope,
} from "./types";

/**
 * Returns effective policyTypes for a NetworkPolicy following Kubernetes semantics:
 * - If policyTypes is explicitly specified, use it.
 * - Otherwise: default to ["Ingress"], and add "Egress" if egress rules are present.
 */
export function getEffectivePolicyTypes(policy: NetworkPolicy): PolicyType[] {
  if (policy.spec.policyTypes && policy.spec.policyTypes.length > 0) {
    return policy.spec.policyTypes;
  }

  const types: PolicyType[] = ["Ingress"];

  // Kubernetes networking.k8s.io/v1 semantics:
  // Egress is only implicitly added if policyTypes is omitted AND spec.egress contains at least one rule.
  // An explicitly empty spec.egress: [] does NOT implicitly isolate egress unless policyTypes includes "Egress".
  if (policy.spec.egress !== undefined && policy.spec.egress.length > 0) {
    types.push("Egress");
  }

  return types;
}

/**
 * Checks if a Pod is selected by a given NetworkPolicy.
 * Both must belong to the same namespace, and the pod's labels must match policy's podSelector.
 */
export function isPodSelectedByPolicy(pod: Pod, policy: NetworkPolicy): boolean {
  if (pod.getNs() !== policy.getNs()) {
    return false;
  }

  const podLabels = (pod.metadata?.labels ?? {}) as Record<string, string | undefined>;

  return matchesSelector(podLabels, policy.spec.podSelector);
}

/**
 * Calculates isolation status for a single Pod against all NetworkPolicies.
 */
export function getPodIsolationStatus(
  pod: Pod,
  allPolicies: NetworkPolicy[],
  dataState: DataEvaluationState = "ready",
): PodIsolationStatus {
  const podNs = pod.getNs();
  const selectingPolicies: NetworkPolicy[] = [];
  const ingressPolicies: NetworkPolicy[] = [];
  const egressPolicies: NetworkPolicy[] = [];

  for (const policy of allPolicies) {
    if (policy.getNs() !== podNs) continue;

    if (isPodSelectedByPolicy(pod, policy)) {
      selectingPolicies.push(policy);

      const types = getEffectivePolicyTypes(policy);

      if (types.includes("Ingress")) {
        ingressPolicies.push(policy);
      }

      if (types.includes("Egress")) {
        egressPolicies.push(policy);
      }
    }
  }

  return {
    podName: pod.getName(),
    podNamespace: podNs,
    isIngressIsolated: ingressPolicies.length > 0,
    isEgressIsolated: egressPolicies.length > 0,
    selectingPolicies,
    ingressPolicies,
    egressPolicies,
    dataState,
  };
}

/**
 * getPodIsolationStatus with an optional per-call memoization cache.
 *
 * Batch evaluators (buildPolicyMatrix, matrix render loops) re-query isolation for the same pod
 * many times; each query recomputes matchesSelector against every policy. The cache is valid for
 * a single evaluation pass because callers create it over one fixed policy list.
 */
function getIsolationStatus(
  pod: Pod,
  allPolicies: NetworkPolicy[],
  isolationCache?: Map<string, PodIsolationStatus>,
): PodIsolationStatus {
  if (!isolationCache) {
    return getPodIsolationStatus(pod, allPolicies);
  }

  const cacheKey = pod.getId();
  const cached = isolationCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const status = getPodIsolationStatus(pod, allPolicies);

  isolationCache.set(cacheKey, status);

  return status;
}

export interface DirectionEvaluationResult {
  verdict: PolicyVerdict;
  matchedPolicies: MatchedPolicyRef[];
  explanation: string;
  reason?: string;
  /**
   * How an "allowed" verdict was reached. Critical for partial-data states:
   * - "matched-rule": at least one rule of a listed policy explicitly matched. Missing policies
   *   can only ADD permissions, never remove existing ones, so this verdict stays valid.
   * - "default-allow": the pod appeared non-isolated because no listed policy selects it for this
   *   direction. With an incomplete policy list, a missing policy could select the pod and deny,
   *   so this verdict is NOT certifiable and must surface as indeterminate.
   * - "not-applicable": the direction does not apply to this peer type (external/IP peer); the
   *   statement is semantic, not data-dependent.
   */
  allowedVia?: "matched-rule" | "default-allow" | "not-applicable";
}

/**
 * An "allowed" direction verdict is certifiable under partial data only when it stems from an
 * explicitly matched rule contained in the fetched data, or from semantics not dependent on data
 * (external peers). "Default Allow" verdicts depend on the completeness of the policy list.
 */
function certifiableAllow(result: DirectionEvaluationResult): boolean {
  return result.verdict === "allowed"
    && (result.allowedVia === "matched-rule" || result.allowedVia === "not-applicable");
}

/**
 * Evaluates Ingress traffic to a destination Pod from a source peer.
 */
export function evaluateIngress(
  destinationPod: Pod,
  sourcePeer: EvaluatedPeer,
  port: number | string | undefined,
  protocol = "TCP",
  context: PolicyEvaluationContext,
  namespaceMap: Map<string, Namespace>,
  isolationCache?: Map<string, PodIsolationStatus>,
): DirectionEvaluationResult {
  const isolation = getIsolationStatus(destinationPod, context.policies, isolationCache);

  if (!isolation.isIngressIsolated) {
    return {
      verdict: "allowed",
      matchedPolicies: [],
      explanation: "Permitido: Pod destino no está aislado para Ingress (Default Allow)",
      allowedVia: "default-allow",
    };
  }

  const matchedPolicies: MatchedPolicyRef[] = [];
  let indeterminateReason: string | undefined;

  for (const policy of isolation.ingressPolicies) {
    const ingressRules = policy.spec.ingress;

    // Ingress is isolated, but no ingress rules defined -> default deny for this policy
    if (!ingressRules || ingressRules.length === 0) {
      continue;
    }

    for (let ruleIndex = 0; ruleIndex < ingressRules.length; ruleIndex++) {
      const rule = ingressRules[ruleIndex];

      const peerMatch = matchesAnyPeer(rule.from, sourcePeer, policy.getNs(), namespaceMap);

      if (peerMatch.matches === "indeterminate") {
        indeterminateReason = peerMatch.reason;
        continue;
      }

      if (peerMatch.matches === false) {
        continue;
      }

      const portMatch = matchesAnyPolicyPort(rule.ports, port, protocol, destinationPod);

      if (portMatch.matched === "indeterminate") {
        indeterminateReason = portMatch.reason;
        continue;
      }

      if (portMatch.matched === true) {
        matchedPolicies.push({
          name: policy.getName(),
          namespace: policy.getNs(),
          ruleIndex,
          description: `Regla ingress #${ruleIndex + 1} en '${policy.getName()}'`,
        });
      }
    }
  }

  if (matchedPolicies.length > 0) {
    const names = matchedPolicies.map(p => `'${p.name}'`).join(", ");

    return {
      verdict: "allowed",
      matchedPolicies,
      explanation: `Permitido por política(s) de Ingress: ${names}`,
      allowedVia: "matched-rule",
    };
  }

  if (indeterminateReason) {
    return {
      verdict: "indeterminate",
      matchedPolicies: [],
      explanation: `Indeterminado para Ingress: ${indeterminateReason}`,
      reason: indeterminateReason,
    };
  }

  return {
    verdict: "denied",
    matchedPolicies: [],
    explanation: `Bloqueado: Pod destino está aislado para Ingress y ninguna regla permite el origen '${sourcePeer.name}'`,
  };
}

/**
 * Evaluates Egress traffic from a source Pod to a destination peer.
 */
export function evaluateEgress(
  sourcePod: Pod,
  destinationPeer: EvaluatedPeer,
  port: number | string | undefined,
  protocol = "TCP",
  context: PolicyEvaluationContext,
  namespaceMap: Map<string, Namespace>,
  isolationCache?: Map<string, PodIsolationStatus>,
): DirectionEvaluationResult {
  const isolation = getIsolationStatus(sourcePod, context.policies, isolationCache);

  if (!isolation.isEgressIsolated) {
    return {
      verdict: "allowed",
      matchedPolicies: [],
      explanation: "Permitido: Pod origen no está aislado para Egress (Default Allow)",
      allowedVia: "default-allow",
    };
  }

  const matchedPolicies: MatchedPolicyRef[] = [];
  let indeterminateReason: string | undefined;

  for (const policy of isolation.egressPolicies) {
    const egressRules = policy.spec.egress;

    if (!egressRules || egressRules.length === 0) {
      continue;
    }

    for (let ruleIndex = 0; ruleIndex < egressRules.length; ruleIndex++) {
      const rule = egressRules[ruleIndex];

      const peerMatch = matchesAnyPeer(rule.to, destinationPeer, policy.getNs(), namespaceMap);

      if (peerMatch.matches === "indeterminate") {
        indeterminateReason = peerMatch.reason;
        continue;
      }

      if (peerMatch.matches === false) {
        continue;
      }

      const portMatch = matchesAnyPolicyPort(rule.ports, port, protocol, destinationPeer.pod);

      if (portMatch.matched === "indeterminate") {
        indeterminateReason = portMatch.reason;
        continue;
      }

      if (portMatch.matched === true) {
        matchedPolicies.push({
          name: policy.getName(),
          namespace: policy.getNs(),
          ruleIndex,
          description: `Regla egress #${ruleIndex + 1} en '${policy.getName()}'`,
        });
      }
    }
  }

  if (matchedPolicies.length > 0) {
    const names = matchedPolicies.map(p => `'${p.name}'`).join(", ");

    return {
      verdict: "allowed",
      matchedPolicies,
      explanation: `Permitido por política(s) de Egress: ${names}`,
      allowedVia: "matched-rule",
    };
  }

  if (indeterminateReason) {
    return {
      verdict: "indeterminate",
      matchedPolicies: [],
      explanation: `Indeterminado para Egress: ${indeterminateReason}`,
      reason: indeterminateReason,
    };
  }

  return {
    verdict: "denied",
    matchedPolicies: [],
    explanation: `Bloqueado: Pod origen está aislado para Egress y ninguna regla permite el destino '${destinationPeer.name}'`,
  };
}

/**
 * Evaluates bidirectional communication between two peers.
 * Egress of source + Ingress of destination must BOTH permit traffic.
 */
export function evaluateConnection(
  source: EvaluatedPeer,
  destination: EvaluatedPeer,
  port: number | string | undefined,
  protocol = "TCP",
  context: PolicyEvaluationContext,
  namespaceMap: Map<string, Namespace>,
  isolationCache?: Map<string, PodIsolationStatus>,
): EvaluatedConnection {
  const id = `${source.namespace ?? ""}/${source.name}->${destination.namespace ?? ""}/${destination.name}:${port ?? "all"}/${protocol}`;

  // Fail-closed state checks
  if (context.state === "loading") {
    return {
      id,
      source,
      destination,
      port,
      protocol,
      verdict: "indeterminate",
      egressVerdict: "indeterminate",
      ingressVerdict: "indeterminate",
      egressExplanation: "Cargando recursos del clúster...",
      ingressExplanation: "Cargando recursos del clúster...",
      matchedEgressPolicies: [],
      matchedIngressPolicies: [],
      indeterminateReason: "Loading cluster resources",
    };
  }

  if (context.state === "permission-denied") {
    return {
      id,
      source,
      destination,
      port,
      protocol,
      verdict: "indeterminate",
      egressVerdict: "indeterminate",
      ingressVerdict: "indeterminate",
      egressExplanation: "Permisos RBAC insuficientes para listar recursos",
      ingressExplanation: "Permisos RBAC insuficientes para listar recursos",
      matchedEgressPolicies: [],
      matchedIngressPolicies: [],
      indeterminateReason: "RBAC 403 Forbidden",
    };
  }

  if (context.state === "disconnected") {
    return {
      id,
      source,
      destination,
      port,
      protocol,
      verdict: "indeterminate",
      egressVerdict: "indeterminate",
      ingressVerdict: "indeterminate",
      egressExplanation: "Clúster desconectado",
      ingressExplanation: "Clúster desconectado",
      matchedEgressPolicies: [],
      matchedIngressPolicies: [],
      indeterminateReason: "Cluster disconnected",
    };
  }

  if (context.state === "unknown") {
    return {
      id,
      source,
      destination,
      port,
      protocol,
      verdict: "indeterminate",
      egressVerdict: "indeterminate",
      ingressVerdict: "indeterminate",
      egressExplanation: "Estado de recursos desconocido o no inicializado",
      ingressExplanation: "Estado de recursos desconocido o no inicializado",
      matchedEgressPolicies: [],
      matchedIngressPolicies: [],
      indeterminateReason: "Unknown cluster data state",
    };
  }

  // Evaluate Egress from source
  let egressRes: DirectionEvaluationResult;

  if (source.type === "pod" && source.pod) {
    egressRes = evaluateEgress(source.pod, destination, port, protocol, context, namespaceMap, isolationCache);
  } else {
    egressRes = {
      verdict: "allowed",
      matchedPolicies: [],
      explanation: "Origen externo / IP (no sujeto a Egress local del pod)",
      allowedVia: "not-applicable",
    };
  }

  // Evaluate Ingress to destination
  let ingressRes: DirectionEvaluationResult;

  if (destination.type === "pod" && destination.pod) {
    ingressRes = evaluateIngress(destination.pod, source, port, protocol, context, namespaceMap, isolationCache);
  } else {
    ingressRes = {
      verdict: "allowed",
      matchedPolicies: [],
      explanation: "Destino externo / IP (no sujeto a Ingress local del pod)",
      allowedVia: "not-applicable",
    };
  }

  // Combined verdict
  let finalVerdict: PolicyVerdict;
  let indeterminateReason: string | undefined;

  // If cluster data is partial, fail-closed against false negatives (do not certify definitive block)
  if (context.state === "partial-data") {
    if (egressRes.verdict === "indeterminate" || ingressRes.verdict === "indeterminate") {
      finalVerdict = "indeterminate";
      indeterminateReason = egressRes.reason || ingressRes.reason || "Datos de clúster parciales";
    } else if (egressRes.verdict === "denied" || ingressRes.verdict === "denied") {
      finalVerdict = "indeterminate";
      indeterminateReason = "Datos parciales en clúster: no es posible certificar bloqueo definitivo sin la totalidad de recursos";
    } else if (certifiableAllow(egressRes) && certifiableAllow(ingressRes)) {
      // Both directions allow via explicitly matched rules (or semantic non-applicability).
      // Missing policies can only add permissions, never erase them: the verdict holds.
      finalVerdict = "allowed";
    } else {
      // At least one direction allowed via "Default Allow" over an incomplete policy list:
      // a missing policy could select the pod and deny, so the permission is not certifiable.
      finalVerdict = "indeterminate";
      indeterminateReason = "Datos parciales en clúster: el permiso depende de un Default Allow que no es certifiable sin el listado completo de NetworkPolicies";
    }
  } else {
    // Complete data (state === "ready")
    if (egressRes.verdict === "denied" || ingressRes.verdict === "denied") {
      finalVerdict = "denied";

      if (egressRes.verdict === "denied" && ingressRes.verdict === "indeterminate") {
        indeterminateReason = `Egress bloqueado en origen; Ingress en destino resultó indeterminado (${ingressRes.reason ?? "consulta sin puerto concreto"}) pero el tráfico no puede cursar debido a la denegación de Egress`;
      } else if (ingressRes.verdict === "denied" && egressRes.verdict === "indeterminate") {
        indeterminateReason = `Ingress bloqueado en destino; Egress en origen resultó indeterminado (${egressRes.reason ?? "consulta sin puerto concreto"}) pero el tráfico no puede cursar debido a la denegación de Ingress`;
      }
    } else if (egressRes.verdict === "indeterminate" || ingressRes.verdict === "indeterminate") {
      finalVerdict = "indeterminate";
      indeterminateReason = egressRes.reason || ingressRes.reason;
    } else {
      finalVerdict = "allowed";
    }
  }

  return {
    id,
    source,
    destination,
    port,
    protocol,
    verdict: finalVerdict,
    egressVerdict: egressRes.verdict,
    ingressVerdict: ingressRes.verdict,
    egressExplanation: egressRes.explanation,
    ingressExplanation: ingressRes.explanation,
    matchedEgressPolicies: egressRes.matchedPolicies,
    matchedIngressPolicies: ingressRes.matchedPolicies,
    indeterminateReason,
  };
}

/**
 * Default explicit evaluation budget for a single policy matrix build.
 * Connections beyond the budget are not evaluated and the result is reported as partial.
 */
export const DEFAULT_MAX_MATRIX_CONNECTIONS = 2000;

export interface BuildPolicyMatrixOptions {
  /** Restrict the matrix to a single namespace (explicit user driven scope). */
  scopeNamespace?: string;
  /**
   * Explicit evaluation budget. Connections beyond this limit are NOT evaluated; the returned
   * result is flagged as partial and reports how many connections were omitted.
   */
  maxConnections?: number;
}

interface MatrixPort {
  port: number | string | undefined;
  protocol: "TCP" | "UDP" | "SCTP";
  scope: PortScope;
}

/**
 * Builds the evaluation matrix for a specific NetworkPolicy.
 *
 * Identifies the pods selected by the policy and evaluates every candidate peer against it,
 * honouring the additive combination of ALL NetworkPolicies that apply to the involved pods
 * (see evaluateIngress / evaluateEgress).
 *
 * The build never truncates the candidate set silently: when the explicit evaluation budget is
 * reached the result is flagged as partial and the exact number of omitted connections is
 * reported, so the UI can disclose the omission.
 */
export function buildPolicyMatrix(
  policy: NetworkPolicy,
  context: PolicyEvaluationContext,
  options?: BuildPolicyMatrixOptions,
): MatrixBuildResult {
  const namespaceMap = new Map<string, Namespace>();

  for (const ns of context.namespaces) {
    namespaceMap.set(ns.getName(), ns);
  }

  // Find pods selected by this policy
  const selectedPods = context.pods.filter(pod => isPodSelectedByPolicy(pod, policy));

  const maxConnections = options?.maxConnections ?? DEFAULT_MAX_MATRIX_CONNECTIONS;
  const types = getEffectivePolicyTypes(policy);

  if (selectedPods.length === 0) {
    return {
      connections: [],
      totalEvaluated: 0,
      isPartial: false,
      totalCandidatePairs: 0,
      selectedPodCount: 0,
      candidatePodCount: 0,
      maxConnections,
      totalPossibleConnections: 0,
    };
  }

  // Ports evaluated per direction.
  // - "declared": ports explicitly enumerated by the policy rules.
  // - "all": the policy does not restrict ports for this direction.
  // - "other": every port NOT enumerated by the policy rules (potentially accessible ports).
  //   This row must never be reported as allowed when the policy only allows a subset of ports.
  const ingressPorts: MatrixPort[] = [];

  for (const rule of policy.spec?.ingress ?? []) {
    if (rule.ports && rule.ports.length > 0) {
      for (const p of rule.ports) {
        ingressPorts.push({ port: p.port, protocol: (p.protocol as any) ?? "TCP", scope: "declared" });
      }
    }
  }

  if (ingressPorts.length === 0) {
    ingressPorts.push({ port: undefined, protocol: "TCP", scope: "all" });
  } else {
    ingressPorts.push({ port: undefined, protocol: "TCP", scope: "other" });
  }

  const egressPorts: MatrixPort[] = [];

  for (const rule of policy.spec?.egress ?? []) {
    if (rule.ports && rule.ports.length > 0) {
      for (const p of rule.ports) {
        egressPorts.push({ port: p.port, protocol: (p.protocol as any) ?? "TCP", scope: "declared" });
      }
    }
  }

  if (egressPorts.length === 0) {
    egressPorts.push({ port: undefined, protocol: "TCP", scope: "all" });
  } else {
    egressPorts.push({ port: undefined, protocol: "TCP", scope: "other" });
  }

  // Isolation memoization per evaluation pass (single fixed policy list, see getIsolationStatus)
  const isolationCache = new Map<string, PodIsolationStatus>();

  // Candidate peers: every pod visible in the evaluation context. Peers of other namespaces are
  // NOT dropped: a policy with namespace scoped rules still denies traffic coming from other
  // namespaces, and hiding those rows would misrepresent the effective policy.
  const policyNs = policy.getNs();
  const candidatePods: Pod[] = [];
  let scopeFilteredPods = 0;

  for (const pod of context.pods) {
    if (options?.scopeNamespace && pod.getNs() !== options.scopeNamespace && pod.getNs() !== policyNs) {
      scopeFilteredPods++;

      continue;
    }

    candidatePods.push(pod);
  }

  // Exact number of connections the build would produce without the evaluation budget.
  let totalPossibleConnections = 0;
  let totalCandidatePairs = 0;

  for (const selectedPod of selectedPods) {
    const peers = candidatePods.filter(candidate => candidate.getId() !== selectedPod.getId()).length;

    totalCandidatePairs += peers;

    if (types.includes("Ingress")) {
      totalPossibleConnections += peers * ingressPorts.length;
    }

    if (types.includes("Egress")) {
      totalPossibleConnections += peers * egressPorts.length;
    }
  }

  const results: EvaluatedConnection[] = [];
  let truncated = false;

  for (const selectedPod of selectedPods) {
    if (truncated) {
      break;
    }

    const selectedPeer: EvaluatedPeer = {
      type: "pod",
      name: selectedPod.getName(),
      namespace: selectedPod.getNs(),
      ip: selectedPod.status?.podIP,
      pod: selectedPod,
    };

    for (const otherPod of candidatePods) {
      if (truncated) {
        break;
      }

      if (otherPod.getId() === selectedPod.getId()) {
        continue;
      }

      const otherPeer: EvaluatedPeer = {
        type: "pod",
        name: otherPod.getName(),
        namespace: otherPod.getNs(),
        ip: otherPod.status?.podIP,
        pod: otherPod,
      };

      // Ingress evaluation to selectedPod from otherPod
      if (types.includes("Ingress")) {
        for (const p of ingressPorts) {
          if (results.length >= maxConnections) {
            truncated = true;

            break;
          }

          const conn = evaluateConnection(otherPeer, selectedPeer, p.port, p.protocol, context, namespaceMap, isolationCache);

          results.push({ ...conn, id: `${conn.id}/${p.scope}`, portScope: p.scope });
        }
      }

      // Egress evaluation from selectedPod to otherPod
      if (types.includes("Egress")) {
        for (const p of egressPorts) {
          if (results.length >= maxConnections) {
            truncated = true;

            break;
          }

          const conn = evaluateConnection(selectedPeer, otherPeer, p.port, p.protocol, context, namespaceMap, isolationCache);

          results.push({ ...conn, id: `${conn.id}/${p.scope}`, portScope: p.scope });
        }
      }
    }
  }

  const partialReasons: string[] = [];

  if (truncated) {
    partialReasons.push(
      `Se evaluaron ${results.length} de ${totalPossibleConnections} conexiones posibles `
      + `(presupuesto explícito de ${maxConnections} conexiones por construcción de matriz). `
      + `Las ${totalPossibleConnections - results.length} conexiones restantes NO fueron evaluadas.`,
    );
  }

  if (scopeFilteredPods > 0) {
    partialReasons.push(
      `El alcance está acotado al namespace '${options?.scopeNamespace}' de forma explícita: `
      + `${scopeFilteredPods} Pods de otros namespaces quedaron fuera de la matriz.`,
    );
  }

  return {
    connections: results,
    totalEvaluated: results.length,
    isPartial: partialReasons.length > 0,
    totalCandidatePairs,
    partialReason: partialReasons.length > 0 ? partialReasons.join(" ") : undefined,
    selectedPodCount: selectedPods.length,
    candidatePodCount: candidatePods.length,
    maxConnections,
    totalPossibleConnections,
  };
}
