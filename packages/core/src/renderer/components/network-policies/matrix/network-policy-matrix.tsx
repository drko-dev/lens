/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./network-policy-matrix.scss";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { observer } from "mobx-react";
import type { NetworkPolicy, Pod, Namespace } from "@openlens/kube-object";
import type { PodStore } from "../../workloads-pods/store";
import type { NamespaceStore } from "../../namespaces/store";
import type { NetworkPolicyStore } from "../store";
import type { DataEvaluationState, EvaluatedConnection, PodIsolationStatus, PolicyEvaluationContext, PolicyVerdict, PortScope } from "../engine/types";
import type { ClusterObservableLike } from "../engine/data-state";
import { computeItemsSignature, DataFreshnessTracker, deriveEvaluationState, toClusterConnectionState } from "../engine/data-state";
import { buildPolicyMatrix, evaluateConnection, getEffectivePolicyTypes } from "../engine/engine";
import { Icon } from "../../icon";
import { Spinner } from "../../spinner";

export interface NetworkPolicyMatrixProps {
  policy?: NetworkPolicy;
  focusedPod?: Pod;
  podStore?: Partial<PodStore> & { items?: Pod[] };
  namespaceStore?: Partial<NamespaceStore> & { items?: Namespace[] };
  networkPolicyStore?: Partial<NetworkPolicyStore> & { items?: NetworkPolicy[] };
  /**
   * Authentic cluster connection state (Cluster model). Connectivity is a property of the
   * cluster, never of a resource store.
   */
  cluster?: ClusterObservableLike;
  /**
   * Explicit evaluation budget for a single policy matrix build. Connections beyond the budget
   * are not evaluated and the omission is disclosed in the UI.
   */
  maxConnections?: number;
}

interface MatrixPort {
  port: number;
  protocol: string;
  scope: PortScope;
}

function getPodContainerPorts(pod: Pod): MatrixPort[] {
  const ports: MatrixPort[] = [];
  const seen = new Set<string>();

  for (const container of pod.spec?.containers ?? []) {
    for (const p of container.ports ?? []) {
      const proto = (p.protocol ?? "TCP").toUpperCase();
      const key = `${p.containerPort}/${proto}`;

      if (!seen.has(key)) {
        seen.add(key);
        ports.push({ port: p.containerPort, protocol: proto, scope: "declared" });
      }
    }
  }

  return ports;
}

/**
 * Ports evaluated for a peer.
 *
 * Container declared ports are only the ports KNOWN to be exposed: a pod can always be reached on
 * any other port, so the matrix also evaluates the "other ports" dimension. That row is never
 * reported as allowed when the policy only allows a subset of ports (the engine returns
 * indeterminate in that case).
 */
function getEvaluatedPorts(pod: Pod): MatrixPort[] {
  const declared = getPodContainerPorts(pod);

  if (declared.length === 0) {
    return [{ port: undefined as unknown as number, protocol: "TCP", scope: "all" }];
  }

  return [...declared, { port: undefined as unknown as number, protocol: "TCP", scope: "other" }];
}

function formatPortLabel(connection: EvaluatedConnection): string {
  if (connection.portScope === "other") {
    return "otros puertos";
  }

  if (connection.port === undefined) {
    return "<cualquiera>";
  }

  return String(connection.port);
}

export const NetworkPolicyMatrix = observer(({
  policy,
  focusedPod,
  podStore,
  namespaceStore,
  networkPolicyStore,
  cluster,
  maxConnections,
}: NetworkPolicyMatrixProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [namespaceFilter, setNamespaceFilter] = useState<string>("all");
  const [directionFilter, setDirectionFilter] = useState<"all" | "ingress" | "egress">("all");
  const [verdictFilter, setVerdictFilter] = useState<"all" | PolicyVerdict>("all");
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 50;

  const isLoading = Boolean(podStore?.isLoading || namespaceStore?.isLoading || networkPolicyStore?.isLoading);

  // Reactive reads: the component is an `observer`, so every MobX observable read below is
  // tracked and the view re-renders when the underlying values change, even when the store
  // instance and its collection keep the same identity.
  const clusterState = toClusterConnectionState(cluster);
  const pods = podStore?.items ?? [];
  const namespaces = namespaceStore?.items ?? [];
  const policies = networkPolicyStore?.items ?? [];

  const evaluationState = deriveEvaluationState({
    cluster: clusterState,
    stores: [
      { name: "Pods", probe: podStore },
      { name: "Namespaces", probe: namespaceStore },
      { name: "NetworkPolicies", probe: networkPolicyStore },
    ],
  });

  const evalState: DataEvaluationState = evaluationState.state;

  // Content signatures: they change only when the data really changed (membership, re-delivered
  // instances, labels or spec), and are used to memoize the expensive evaluation.
  const podsSignature = computeItemsSignature(pods);
  const namespacesSignature = computeItemsSignature(namespaces);
  const policiesSignature = computeItemsSignature(policies, true);

  const clusterId = clusterState?.id;

  // Freshness is tracked per store: the NetworkPolicies are only certified as fresh by a delivery
  // of the NetworkPolicies themselves or by a confirmed reload of the NetworkPolicyStore. A change
  // exclusive to the Pod or Namespace stores can never certify them.
  const freshnessTracker = useRef(new DataFreshnessTracker());
  const connectionLost = evalState === "disconnected" || clusterState?.online === false;
  // Every tracker is updated on every render: a short circuit would leave the remaining stores
  // unaware of the connection loss and could certify stale resources.
  const podsStale = freshnessTracker.current.updateStore("pods", {
    signature: podsSignature,
    isLoading: Boolean(podStore?.isLoading),
    loadFailed: Boolean(podStore?.failedLoading || podStore?.lastError),
    clusterId,
    connectionLost,
  });
  const namespacesStale = freshnessTracker.current.updateStore("namespaces", {
    signature: namespacesSignature,
    isLoading: Boolean(namespaceStore?.isLoading),
    loadFailed: Boolean(namespaceStore?.failedLoading || namespaceStore?.lastError),
    clusterId,
    connectionLost,
  });
  const policiesStale = freshnessTracker.current.updateStore("networkPolicies", {
    signature: policiesSignature,
    isLoading: Boolean(networkPolicyStore?.isLoading),
    loadFailed: Boolean(networkPolicyStore?.failedLoading || networkPolicyStore?.lastError),
    clusterId,
    connectionLost,
  });
  const isStaleData = podsStale || namespacesStale || policiesStale;
  const effectiveState: DataEvaluationState = isStaleData && evalState === "ready" ? "unknown" : evalState;

  const isDisconnected = effectiveState === "disconnected";
  const isPermissionDenied = effectiveState === "permission-denied";
  const isPartialData = effectiveState === "partial-data";
  const isUnknownState = effectiveState === "unknown";
  const isConnecting = effectiveState === "loading";

  // Invalidate any result computed for a previous cluster: filters, pagination and cached
  // evaluations must not survive a cluster switch.
  const previousClusterId = useRef<string | undefined>(clusterId);

  useEffect(() => {
    if (previousClusterId.current !== clusterId) {
      previousClusterId.current = clusterId;
      setSearchQuery("");
      setNamespaceFilter("all");
      setDirectionFilter("all");
      setVerdictFilter("all");
      setCurrentPage(0);
    }
  }, [clusterId]);

  // Compute connections based on scope.
  //
  // The memo is keyed by the CONTENT signature of the three collections (and by the derived
  // state), not by the identity of the stores or of their collections: replacing the items of a
  // store keeps the same array instance, so an identity based key would keep serving stale rows.
  const { allConnections, matrixPartialReason } = useMemo<{
    allConnections: EvaluatedConnection[];
    matrixPartialReason?: string;
  }>(() => {
    const context: PolicyEvaluationContext = {
      pods: [...pods],
      namespaces: [...namespaces],
      policies: [...policies],
      state: effectiveState,
      clusterId,
    };

    const namespaceMap = new Map<string, Namespace>();

    for (const ns of namespaces) {
      namespaceMap.set(ns.getName(), ns);
    }

    if (policy) {
      const result = buildPolicyMatrix(policy, context, {
        maxConnections,
        scopeNamespace: namespaceFilter !== "all" ? namespaceFilter : undefined,
      });

      return { allConnections: result.connections, matrixPartialReason: result.partialReason };
    }

    if (focusedPod) {
      const results: EvaluatedConnection[] = [];
      const isolationCache = new Map<string, PodIsolationStatus>();
      const focusedPeer = {
        type: "pod" as const,
        name: focusedPod.getName(),
        namespace: focusedPod.getNs(),
        ip: focusedPod.status?.podIP,
        pod: focusedPod,
      };

      const focusedPorts = getEvaluatedPorts(focusedPod);

      for (const otherPod of pods) {
        if (otherPod.getId() === focusedPod.getId()) continue;

        const otherPeer = {
          type: "pod" as const,
          name: otherPod.getName(),
          namespace: otherPod.getNs(),
          ip: otherPod.status?.podIP,
          pod: otherPod,
        };

        const otherPorts = getEvaluatedPorts(otherPod);

        // Ingress to focusedPod: the port matters on the destination (focused pod)
        for (const p of focusedPorts) {
          const conn = evaluateConnection(otherPeer, focusedPeer, p.port, p.protocol, context, namespaceMap, isolationCache);

          results.push({ ...conn, id: `${conn.id}/${p.scope}`, portScope: p.scope });
        }

        // Egress from focusedPod: the port matters on the destination (other pod)
        for (const p of otherPorts) {
          const conn = evaluateConnection(focusedPeer, otherPeer, p.port, p.protocol, context, namespaceMap, isolationCache);

          results.push({ ...conn, id: `${conn.id}/${p.scope}`, portScope: p.scope });
        }
      }

      return { allConnections: results };
    }

    // Cluster-wide matrix (explicitly capped: the cartesian product of every pod pair is not
    // meaningful for an operator, so the cap is applied and disclosed to the user)
    const results: EvaluatedConnection[] = [];
    const isolationCache = new Map<string, PodIsolationStatus>();
    const maxClusterPods = Math.min(pods.length, 30);

    for (let i = 0; i < maxClusterPods; i++) {
      for (let j = 0; j < maxClusterPods; j++) {
        if (i === j) continue;

        const pA = pods[i];
        const pB = pods[j];
        const peerA = { type: "pod" as const, name: pA.getName(), namespace: pA.getNs(), ip: pA.status?.podIP, pod: pA };
        const peerB = { type: "pod" as const, name: pB.getName(), namespace: pB.getNs(), ip: pB.status?.podIP, pod: pB };

        const conn = evaluateConnection(peerA, peerB, undefined, "TCP", context, namespaceMap, isolationCache);

        results.push({ ...conn, portScope: "all" });
      }
    }

    const partialReason = pods.length > maxClusterPods
      ? `Vista de clúster acotada a los primeros ${maxClusterPods} Pods de ${pods.length} `
        + `(el producto cartesiano completo no es operable). Usá el filtro por namespace para acotar el alcance.`
      : undefined;

    return { allConnections: results, matrixPartialReason: partialReason };
  }, [
    policy,
    focusedPod,
    maxConnections,
    namespaceFilter,
    podsSignature,
    namespacesSignature,
    policiesSignature,
    effectiveState,
    clusterId,
  ]);

  // Filter connections
  const filteredConnections = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return allConnections.filter(conn => {
      // Verdict filter
      if (verdictFilter !== "all" && conn.verdict !== verdictFilter) {
        return false;
      }

      // Direction filter using effective policy types
      if (directionFilter === "ingress") {
        if (focusedPod && conn.destination.name !== focusedPod.getName()) {
          return false;
        }

        if (policy && !getEffectivePolicyTypes(policy).includes("Ingress")) {
          return false;
        }
      }

      if (directionFilter === "egress") {
        if (focusedPod && conn.source.name !== focusedPod.getName()) {
          return false;
        }

        if (policy && !getEffectivePolicyTypes(policy).includes("Egress")) {
          return false;
        }
      }

      // Namespace filter
      if (namespaceFilter !== "all") {
        const matchesNs = conn.source.namespace === namespaceFilter || conn.destination.namespace === namespaceFilter;

        if (!matchesNs) return false;
      }

      // Text search
      if (query) {
        const text = `${conn.source.name} ${conn.source.namespace ?? ""} ${conn.destination.name} ${conn.destination.namespace ?? ""} ${conn.port ?? ""} ${conn.protocol} ${conn.verdict} ${conn.egressExplanation} ${conn.ingressExplanation}`.toLowerCase();

        if (!text.includes(query)) return false;
      }

      return true;
    });
  }, [allConnections, searchQuery, namespaceFilter, directionFilter, verdictFilter, focusedPod, policy]);

  // Unique namespaces for filter dropdown
  const uniqueNamespaces = useMemo(() => {
    const nsSet = new Set<string>();

    for (const ns of namespaces) {
      nsSet.add(ns.getName());
    }

    return Array.from(nsSet).sort();
  }, [namespaces]);

  const totalItems = filteredConnections.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const effectivePage = Math.min(currentPage, totalPages - 1);
  const startIdx = effectivePage * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalItems);
  const visibleConnections = filteredConnections.slice(startIdx, endIdx);

  return (
    <div
      className="NetworkPolicyMatrix"
      data-testid="network-policy-matrix"
      role="region"
      aria-label="Network Policy Traffic Matrix">
      <div className="matrix-header">
        <div className="matrix-title">
          <Icon material="hub" />
          <span>Matriz de Conectividad de NetworkPolicies</span>
        </div>
      </div>

      <div className="matrix-disclaimer" role="note">
        <Icon material="info" className="disclaimer-icon" />
        <span>
          <strong>Aviso de limitaciones:</strong>
          {" "}
          &quot;Permitido por políticas&quot; refleja únicamente las reglas declaradas en las NetworkPolicies de Kubernetes y no equivale a conectividad física real garantizada (los plugins CNI, enrutamiento de Services, firewalls de host o Service Mesh pueden aplicar restricciones adicionales).
        </span>
      </div>

      {isDisconnected && (
        <div className="matrix-state-banner disconnected" role="alert">
          <Icon material="cloud_off" />
          <span>
            <strong>Clúster desconectado:</strong>
            {" "}
            No hay comunicación activa con el clúster. La evaluación de conectividad se encuentra suspendida.
          </span>
        </div>
      )}

      {isConnecting && (
        <div className="matrix-state-banner partial-data" role="status">
          <Icon material="hourglass_empty" />
          <span>
            <strong>Conectando con el clúster:</strong>
            {" "}
            {evaluationState.reason ?? "La conexión con el clúster todavía no está establecida."}
            {" "}
            No se afirma ningún permiso mientras la conexión no esté establecida.
          </span>
        </div>
      )}

      {isPermissionDenied && (
        <div className="matrix-state-banner permission-denied" role="alert">
          <Icon material="error" />
          <span>
            <strong>
              {evaluationState.cause === "cluster-inaccessible"
                ? "Clúster inaccesible:"
                : "Acceso restringido (RBAC 403):"}
            </strong>
            {" "}
            {evaluationState.reason ?? "Permisos insuficientes para listar los recursos necesarios."}
            {" "}
            La evaluación se presenta como indeterminada.
          </span>
        </div>
      )}

      {isPartialData && (
        <div className="matrix-state-banner partial-data" role="status">
          <Icon material="warning" />
          <span>
            <strong>Datos parciales:</strong>
            {" "}
            {evaluationState.reason ?? "El listado de recursos del clúster está incompleto."}
            {" "}
            Las reglas que dependen de datos faltantes se evaluarán como indeterminadas.
          </span>
        </div>
      )}

      {isUnknownState && (
        <div className="matrix-state-banner partial-data" role="status">
          <Icon material="help_outline" />
          <span>
            <strong>Estado de datos desconocido:</strong>
            {" "}
            {isStaleData
              ? "Los recursos disponibles son previos a la pérdida de conexión con el clúster: no se afirma permiso ni bloqueo hasta recibir recursos frescos."
              : evaluationState.reason ?? "Los stores de Kubernetes no están inicializados."}
            {" "}
            La evaluación se presenta como indeterminada: no se afirma permiso ni bloqueo.
          </span>
        </div>
      )}

      {matrixPartialReason && (
        <div className="matrix-state-banner partial-data" role="status">
          <Icon material="warning" />
          <span>
            <strong>Análisis parcial:</strong>
            {" "}
            {matrixPartialReason}
          </span>
        </div>
      )}

      <div className="matrix-filters">
        <input
          type="text"
          className="filter-input"
          placeholder="Buscar Pod o IP..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(0);
          }}
          aria-label="Filtrar conexiones"
        />

        <select
          className="filter-select"
          value={namespaceFilter}
          onChange={(e) => {
            setNamespaceFilter(e.target.value);
            setCurrentPage(0);
          }}
          aria-label="Filtrar por namespace"
        >
          <option value="all">Todos los namespaces</option>
          {uniqueNamespaces.map((ns) => (
            <option key={ns} value={ns}>{ns}</option>
          ))}
        </select>

        <select
          className="filter-select"
          value={directionFilter}
          onChange={(e) => {
            setDirectionFilter(e.target.value as "all" | "ingress" | "egress");
            setCurrentPage(0);
          }}
          aria-label="Filtrar por dirección"
        >
          <option value="all">Todas las direcciones</option>
          <option value="ingress">Solo Ingress</option>
          <option value="egress">Solo Egress</option>
        </select>

        <select
          className="filter-select"
          value={verdictFilter}
          onChange={(e) => {
            setVerdictFilter(e.target.value as "all" | PolicyVerdict);
            setCurrentPage(0);
          }}
          aria-label="Filtrar por evaluación"
        >
          <option value="all">Todas las evaluaciones</option>
          <option value="allowed">Permitido por políticas</option>
          <option value="denied">Bloqueado por política</option>
          <option value="indeterminate">Indeterminado</option>
        </select>
      </div>

      {isLoading && (
        <div style={{ padding: "20px", display: "flex", justifyContent: "center" }}>
          <Spinner />
        </div>
      )}

      <div className="matrix-table-container">
        <table
          className="matrix-table"
          role="table"
          aria-label="Tabla de reglas de conectividad">
          <thead>
            <tr role="row">
              <th role="columnheader">Origen</th>
              <th role="columnheader">Destino</th>
              <th role="columnheader">Puerto</th>
              <th role="columnheader">Protocolo</th>
              <th role="columnheader">Evaluación</th>
              <th role="columnheader">Detalles de Evaluación</th>
            </tr>
          </thead>
          <tbody>
            {filteredConnections.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-results">
                  {isLoading ? "Cargando matriz..." : "No se encontraron conexiones evaluables con los filtros seleccionados."}
                </td>
              </tr>
            ) : (
              visibleConnections.map((conn) => (
                <tr
                  key={conn.id}
                  role="row"
                  tabIndex={0}>
                  <td role="cell">
                    <span className="peer-name">
                      {conn.source.name}
                      {conn.source.namespace && <span className="ns-tag">{conn.source.namespace}</span>}
                    </span>
                  </td>
                  <td role="cell">
                    <span className="peer-name">
                      {conn.destination.name}
                      {conn.destination.namespace && <span className="ns-tag">{conn.destination.namespace}</span>}
                    </span>
                  </td>
                  <td role="cell">{formatPortLabel(conn)}</td>
                  <td role="cell">{conn.protocol}</td>
                  <td role="cell">
                    {conn.verdict === "allowed" && (
                      <span className="verdict-badge allowed">
                        <Icon material="check_circle" small />
                        <span>Permitido por políticas</span>
                      </span>
                    )}
                    {conn.verdict === "denied" && (
                      <span className="verdict-badge denied">
                        <Icon material="block" small />
                        <span>Bloqueado por política</span>
                      </span>
                    )}
                    {conn.verdict === "indeterminate" && (
                      <span className="verdict-badge indeterminate">
                        <Icon material="help_outline" small />
                        <span>Indeterminado</span>
                      </span>
                    )}
                  </td>
                  <td
                    role="cell"
                    className="explanation-cell"
                    title={`${conn.egressExplanation} | ${conn.ingressExplanation}`}>
                    {conn.verdict === "allowed"
                      ? (conn.matchedIngressPolicies[0]?.description || conn.matchedEgressPolicies[0]?.description || "Reglas aditivas conformes")
                      : conn.verdict === "denied"
                        ? (conn.ingressVerdict === "denied" ? conn.ingressExplanation : conn.egressExplanation)
                        : (conn.indeterminateReason || "Datos incompletos")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filteredConnections.length > 0 && (
        <div
          className="matrix-pagination"
          role="navigation"
          aria-label="Paginación de matriz">
          <span className="pagination-info">
            {`Mostrando ${startIdx + 1}–${endIdx} de ${totalItems} conexiones evaluadas${
              allConnections.length !== totalItems ? ` (filtradas de ${allConnections.length} totales)` : ""
            } (Página ${effectivePage + 1} de ${totalPages})`}
          </span>
          <div className="pagination-controls">
            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
              disabled={effectivePage === 0}
              aria-label="Página anterior"
            >
              <Icon material="chevron_left" small />
              <span>Anterior</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
              disabled={effectivePage >= totalPages - 1}
              aria-label="Página siguiente"
            >
              <span>Siguiente</span>
              <Icon material="chevron_right" small />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
