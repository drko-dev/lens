/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./pod-network-policies.scss";

import React from "react";
import { observer } from "mobx-react";
import { Link } from "react-router-dom";
import type { Pod } from "@openlens/kube-object";
import type { GetDetailsUrl } from "../../kube-detail-params/get-details-url.injectable";
import getDetailsUrlInjectable from "../../kube-detail-params/get-details-url.injectable";
import type { NetworkPolicyApi } from "../../../../common/k8s-api/endpoints/network-policy.api";
import networkPolicyApiInjectable from "../../../../common/k8s-api/endpoints/network-policy.api.injectable";
import type { NetworkPolicyStore } from "../../network-policies/store";
import networkPolicyStoreInjectable from "../../network-policies/store.injectable";
import type { PodStore } from "../store";
import podStoreInjectable from "../store.injectable";
import type { NamespaceStore } from "../../namespaces/store";
import namespaceStoreInjectable from "../../namespaces/store.injectable";
import type { ClusterObservableLike } from "../../network-policies/engine/data-state";
import { computeItemsSignature, DataFreshnessTracker, deriveEvaluationState, toClusterConnectionState } from "../../network-policies/engine/data-state";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import { DrawerItem, DrawerTitle } from "../../drawer";
import { Icon } from "../../icon";
import { withInjectables } from "@ogre-tools/injectable-react";
import { getPodIsolationStatus } from "../../network-policies/engine/engine";
import { NetworkPolicyMatrix } from "../../network-policies/matrix/network-policy-matrix";

export interface PodNetworkPoliciesProps {
  pod: Pod;
  networkPolicyStore?: NetworkPolicyStore;
  podStore?: PodStore;
  namespaceStore?: NamespaceStore;
  /**
   * Authentic cluster connection state (Cluster model).
   */
  cluster?: ClusterObservableLike;
}

interface Dependencies {
  getDetailsUrl: GetDetailsUrl;
  networkPolicyApi?: NetworkPolicyApi;
  networkPolicyStore?: NetworkPolicyStore;
  podStore?: PodStore;
  namespaceStore?: NamespaceStore;
  cluster?: ClusterObservableLike;
}

@observer
export class NonInjectedPodNetworkPolicies extends React.Component<PodNetworkPoliciesProps & Dependencies> {
  state = {
    showMatrix: false,
  };

  private readonly freshnessTracker = new DataFreshnessTracker();

  render() {
    const { pod, getDetailsUrl, networkPolicyApi, networkPolicyStore, podStore, namespaceStore, cluster } = this.props;

    if (!pod) {
      return null;
    }

    // The isolation badges depend exclusively on the NetworkPolicy listing: the Pod and
    // Namespace stores are only required by the traffic matrix, which derives its own state.
    const clusterState = toClusterConnectionState(cluster);

    const policies = networkPolicyStore?.items ?? [];
    const namespaces = namespaceStore?.items ?? [];
    const pods = podStore?.items ?? [];

    const evaluationState = deriveEvaluationState({
      cluster: clusterState,
      stores: [{ name: "NetworkPolicies", probe: networkPolicyStore }],
    });

    const evalState = evaluationState.state;

    // Resources held by the stores become stale when the connection is lost: they must not be
    // presented as definitive isolation verdicts until the store that owns them confirms a reload.
    // Freshness is tracked per store, so a change exclusive to another store cannot certify it.
    const connectionLost = evalState === "disconnected" || clusterState?.online === false;
    const clusterId = clusterState?.id;

    // Every tracker is updated on every render: a short circuit would leave the remaining stores
    // unaware of the connection loss and could certify stale resources.
    const podsStale = this.freshnessTracker.updateStore("pods", {
      signature: computeItemsSignature(pods),
      isLoading: Boolean(podStore?.isLoading),
      loadFailed: Boolean(podStore?.failedLoading || podStore?.lastError),
      clusterId,
      connectionLost,
    });
    const namespacesStale = this.freshnessTracker.updateStore("namespaces", {
      signature: computeItemsSignature(namespaces),
      isLoading: Boolean(namespaceStore?.isLoading),
      loadFailed: Boolean(namespaceStore?.failedLoading || namespaceStore?.lastError),
      clusterId,
      connectionLost,
    });
    const policiesStale = this.freshnessTracker.updateStore("networkPolicies", {
      signature: computeItemsSignature(policies, true),
      isLoading: Boolean(networkPolicyStore?.isLoading),
      loadFailed: Boolean(networkPolicyStore?.failedLoading || networkPolicyStore?.lastError),
      clusterId,
      connectionLost,
    });
    const isStaleData = podsStale || namespacesStale || policiesStale;
    const effectiveState = isStaleData && evalState === "ready" ? "unknown" : evalState;

    const isDisconnected = effectiveState === "disconnected";
    const isPermissionDenied = effectiveState === "permission-denied";
    const isLoading = effectiveState === "loading";
    const isUnknownState = effectiveState === "unknown";
    const isPartialData = effectiveState === "partial-data";
    const isConnecting = effectiveState === "loading" && clusterState?.online === false;

    const isolation = getPodIsolationStatus(pod, policies);
    const { isIngressIsolated, isEgressIsolated, selectingPolicies } = isolation;

    const renderIsolationBadge = (direction: "Ingress" | "Egress", isolated: boolean) => {
      if (isDisconnected) {
        return (
          <span className="isolation-status-badge indeterminate" title="Clúster desconectado">
            <Icon material="cloud_off" small />
            <span>Desconectado</span>
          </span>
        );
      }

      if (isPermissionDenied) {
        return (
          <span className="isolation-status-badge indeterminate" title="Permiso denegado para consultar NetworkPolicies">
            <Icon material="error" small />
            <span>
              {evaluationState.cause === "cluster-inaccessible"
                ? "Clúster inaccesible"
                : "Permiso denegado (RBAC 403)"}
            </span>
          </span>
        );
      }

      if (isConnecting) {
        return (
          <span className="isolation-status-badge loading" title="Conectando con el clúster">
            <Icon material="hourglass_empty" small />
            <span>Conectando con el clúster...</span>
          </span>
        );
      }

      if (isLoading) {
        return (
          <span className="isolation-status-badge loading" title="Cargando estado de NetworkPolicies">
            <Icon material="hourglass_empty" small />
            <span>Cargando políticas...</span>
          </span>
        );
      }

      if (isUnknownState) {
        return (
          <span
            className="isolation-status-badge indeterminate"
            title={isStaleData
              ? "Recursos previos a la pérdida de conexión con el clúster"
              : "Store de NetworkPolicies no disponible o no inicializado"}>
            <Icon material="help_outline" small />
            <span>Indeterminado</span>
          </span>
        );
      }

      if (isPartialData) {
        return (
          <span className="isolation-status-badge indeterminate" title="Listado de NetworkPolicies incompleto">
            <Icon material="warning" small />
            <span>Indeterminado (datos parciales)</span>
          </span>
        );
      }

      return (
        <span className={`isolation-status-badge ${isolated ? "isolated" : "not-isolated"}`}>
          <Icon material={isolated ? "security" : "lock_open"} small />
          <span>{isolated ? `Aislado (Default Deny ${direction})` : `No aislado (Default Allow ${direction})`}</span>
        </span>
      );
    };

    return (
      <div className="PodNetworkPolicies" data-testid="pod-network-policies">
        <DrawerTitle>Network Policies</DrawerTitle>

        <DrawerItem name="Aislamiento Ingress">
          {renderIsolationBadge("Ingress", isIngressIsolated)}
        </DrawerItem>

        <DrawerItem name="Aislamiento Egress">
          {renderIsolationBadge("Egress", isEgressIsolated)}
        </DrawerItem>

        <DrawerItem name="Políticas Aplicables">
          {isDisconnected ? (
            <span>Clúster desconectado</span>
          ) : isPermissionDenied ? (
            <span>
              {evaluationState.cause === "cluster-inaccessible"
                ? "Clúster inaccesible: no se puede listar NetworkPolicies"
                : "Permiso denegado para listar NetworkPolicies (RBAC 403)"}
            </span>
          ) : isConnecting ? (
            <span>Conectando con el clúster...</span>
          ) : isLoading ? (
            <span>Cargando políticas aplicables...</span>
          ) : isUnknownState ? (
            <span>
              {isStaleData
                ? "Recursos previos a la pérdida de conexión: no se afirma el conjunto aplicable"
                : "Estado de políticas no disponible (store no inicializado)"}
            </span>
          ) : isPartialData ? (
            <span>Listado de políticas incompleto: no se puede afirmar el conjunto aplicable</span>
          ) : selectingPolicies.length === 0 ? (
            <span>Ninguna política selecciona este Pod</span>
          ) : (
            <div className="policy-links-list">
              {selectingPolicies.map((policy) => {
                const url = networkPolicyApi
                  ? getDetailsUrl(networkPolicyApi.formatUrlForNotListing({
                    name: policy.getName(),
                    namespace: policy.getNs(),
                  }))
                  : `#`;

                return (
                  <Link
                    key={policy.getId()}
                    to={url}
                    className="policy-link-badge"
                    title={`Ver política ${policy.getName()}`}
                  >
                    <Icon material="policy" small />
                    <span>{policy.getName()}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </DrawerItem>

        <DrawerItem name="Matriz de Tráfico">
          <button
            type="button"
            className="matrix-toggle-button"
            onClick={() => this.setState({ showMatrix: !this.state.showMatrix })}
            aria-expanded={this.state.showMatrix}
          >
            <Icon material={this.state.showMatrix ? "expand_less" : "expand_more"} small />
            <span>{this.state.showMatrix ? "Ocultar matriz de tráfico" : "Inspeccionar matriz de tráfico del Pod"}</span>
          </button>
        </DrawerItem>

        {this.state.showMatrix && (
          <div className="pod-matrix-wrapper">
            <NetworkPolicyMatrix
              focusedPod={pod}
              podStore={podStore}
              namespaceStore={namespaceStore}
              networkPolicyStore={networkPolicyStore}
              cluster={clusterState}
            />
          </div>
        )}
      </div>
    );
  }
}

export const PodNetworkPolicies = withInjectables<Dependencies, PodNetworkPoliciesProps>(
  NonInjectedPodNetworkPolicies,
  {
    getProps: (di, props) => {
      let podStore: PodStore | undefined;
      let namespaceStore: NamespaceStore | undefined;
      let networkPolicyStore: NetworkPolicyStore | undefined;
      let cluster: ClusterObservableLike | undefined;

      try {
        podStore = di.inject(podStoreInjectable);
      } catch {
        // Not in cluster frame context
      }

      try {
        namespaceStore = di.inject(namespaceStoreInjectable);
      } catch {
        // Not in cluster frame context
      }

      try {
        networkPolicyStore = di.inject(networkPolicyStoreInjectable);
      } catch {
        // Not in cluster frame context
      }

      let networkPolicyApi: NetworkPolicyApi | undefined;

      try {
        networkPolicyApi = di.inject(networkPolicyApiInjectable);
      } catch {
        // Not in cluster frame context
      }

      try {
        cluster = di.inject(hostedClusterInjectable);
      } catch {
        // Not in cluster frame context
      }

      return {
        ...props,
        getDetailsUrl: di.inject(getDetailsUrlInjectable),
        networkPolicyApi,
        podStore: props.podStore ?? podStore,
        namespaceStore: props.namespaceStore ?? namespaceStore,
        networkPolicyStore: props.networkPolicyStore ?? networkPolicyStore,
        cluster: props.cluster ?? cluster,
      };
    },
  },
);
