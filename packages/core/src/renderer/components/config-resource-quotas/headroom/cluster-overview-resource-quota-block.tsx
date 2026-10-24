/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { observer } from "mobx-react";
import type { ResourceQuotaStore } from "../store";
import resourceQuotaStoreInjectable from "../store.injectable";
import type { SubscribeStores } from "../../../kube-watch-api/kube-watch-api";
import subscribeStoresInjectable from "../../../kube-watch-api/subscribe-stores.injectable";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { ResourceQuota } from "@openlens/kube-object";
import { Spinner } from "../../spinner";
import { ResourceQuotaHeadroom } from "./resource-quota-headroom";

interface Dependencies {
  resourceQuotaStore: ResourceQuotaStore;
  subscribeStores: SubscribeStores;
}

@observer
class NonInjectedClusterOverviewResourceQuotaBlock extends React.Component<Dependencies> {
  private unsubscribe?: () => void;

  componentDidMount() {
    this.unsubscribe = this.props.subscribeStores([
      this.props.resourceQuotaStore,
    ]);
  }

  componentWillUnmount() {
    this.unsubscribe?.();
  }

  render() {
    const { resourceQuotaStore } = this.props;

    if (!resourceQuotaStore.isLoaded && resourceQuotaStore.isLoading) {
      return (
        <div className="flex center" style={{ padding: 20 }}>
          <Spinner />
        </div>
      );
    }

    const allQuotas = resourceQuotaStore.items;

    if (!allQuotas || allQuotas.length === 0) {
      return (
        <div
          className="quota-headroom-overview-block"
          style={{ margin: "16px 0" }}
          data-testid="cluster-quotas-empty">
          <div
            style={{
              background: "var(--layoutTabsBackground, #161b22)",
              border: "1px solid var(--borderFocusColor, #30363d)",
              borderRadius: 6,
              padding: "16px 20px",
              color: "var(--textColorSecondary, #8b949e)",
              fontSize: 13,
            }}>
            <h3 style={{ margin: "0 0 8px", color: "var(--textColorPrimary, #e6edf3)", fontSize: 14 }}>
              ResourceQuota Headroom
            </h3>
            <p style={{ margin: 0 }}>No ResourceQuotas defined in this cluster.</p>
          </div>
        </div>
      );
    }

    // Group quotas strictly by namespace to prevent invalid cross-namespace aggregations
    const quotasByNs = new Map<string, ResourceQuota[]>();

    for (const quota of allQuotas) {
      const ns = quota.getNs();
      const list = quotasByNs.get(ns) ?? [];

      list.push(quota);
      quotasByNs.set(ns, list);
    }

    return (
      <div
        className="quota-headroom-overview-block"
        style={{ margin: "16px 0" }}
        data-testid="cluster-quotas-headroom">
        <div
          style={{
            background: "var(--layoutTabsBackground, #161b22)",
            border: "1px solid var(--borderFocusColor, #30363d)",
            borderRadius: 6,
            padding: "16px 20px",
          }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, color: "var(--textColorPrimary, #e6edf3)", fontSize: 14, fontWeight: 600 }}>
              ResourceQuota Headroom (by Namespace)
            </h3>
            <span style={{ fontSize: 11, color: "var(--textColorSecondary, #8b949e)" }}>
              {quotasByNs.size}
              {" "}
              {quotasByNs.size === 1 ? "namespace" : "namespaces"}
              {" "}
              with active quotas
            </span>
          </div>

          {Array.from(quotasByNs.entries()).map(([ns, quotas]) => (
            <div key={ns} style={{ marginBottom: 16 }}>
              <div
                data-testid={`quota-namespace-group-${ns}`}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--textColorPrimary, #58a6ff)",
                  marginBottom: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}>
                <span>Namespace:</span>
                {" "}
                <span>{ns}</span>
              </div>
              <ResourceQuotaHeadroom quotas={quotas} />
            </div>
          ))}
        </div>
      </div>
    );
  }
}

export const ClusterOverviewResourceQuotaBlock = withInjectables<Dependencies>(
  NonInjectedClusterOverviewResourceQuotaBlock,
  {
    getProps: (di) => ({
      resourceQuotaStore: di.inject(resourceQuotaStoreInjectable),
      subscribeStores: di.inject(subscribeStoresInjectable),
    }),
  },
);
