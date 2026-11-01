/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./rbac-inspector.scss";

import React from "react";
import { observer } from "mobx-react";
import { observable, action, makeObservable, runInAction, reaction } from "mobx";
import type { IComputedValue } from "mobx";
import { Button } from "@openlens/button";
import { Icon } from "../../icon";
import { Spinner } from "../../spinner";
import { SiblingsInTabLayout } from "../../layout/siblings-in-tab-layout";
import { withInjectables } from "@ogre-tools/injectable-react";
import { observableHistoryInjectionToken } from "@openlens/routing";
import type { ObservableHistory } from "mobx-observable-history";

import type { RoleStore } from "../roles/store";
import type { ClusterRoleStore } from "../cluster-roles/store";
import type { RoleBindingStore } from "../role-bindings/store";
import type { ClusterRoleBindingStore } from "../cluster-role-bindings/store";
import type { ServiceAccountStore } from "../service-accounts/store";
import type { NamespaceStore } from "../../namespaces/store";
import type { Cluster } from "../../../../common/cluster/cluster";
import type { SubscribeStores } from "../../../kube-watch-api/kube-watch-api";

import roleStoreInjectable from "../roles/store.injectable";
import clusterRoleStoreInjectable from "../cluster-roles/store.injectable";
import roleBindingStoreInjectable from "../role-bindings/store.injectable";
import clusterRoleBindingStoreInjectable from "../cluster-role-bindings/store.injectable";
import serviceAccountStoreInjectable from "../service-accounts/store.injectable";
import namespaceStoreInjectable from "../../namespaces/store.injectable";
import subscribeStoresInjectable from "../../../kube-watch-api/subscribe-stores.injectable";
import isProductionClusterInjectable from "../../kube-object-menu/is-production-cluster.injectable";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import accessReviewClientInjectable from "./access-review-client.injectable";

import { evaluateLocalRbac } from "../../../../common/k8s-api/endpoints/rbac-evaluator";
import type {
  AccessReviewClient,
  AccessReviewQuery,
  AccessReviewResult,
  IdentityType,
  MatchingRuleEvidence,
} from "../../../../common/k8s-api/endpoints/rbac-evaluator";

const STANDARD_VERBS = ["get", "list", "watch", "create", "update", "patch", "delete", "deletecollection"];

interface Dependencies {
  roleStore: RoleStore;
  clusterRoleStore: ClusterRoleStore;
  roleBindingStore: RoleBindingStore;
  clusterRoleBindingStore: ClusterRoleBindingStore;
  serviceAccountStore: ServiceAccountStore;
  namespaceStore: NamespaceStore;
  subscribeStores: SubscribeStores;
  isProductionCluster: IComputedValue<boolean>;
  hostedCluster: Cluster | undefined;
  accessReviewClient: AccessReviewClient;
  observableHistory: ObservableHistory<unknown>;
}

@observer
export class NonInjectedRbacInspector extends React.Component<Dependencies> {
  @observable identityType: IdentityType = "current-user";
  @observable saNamespace = "default";
  @observable saName = "";
  @observable username = "";
  @observable userGroups = "system:authenticated";

  @observable isNonResource = false;
  @observable resourceNamespace = "default";
  @observable isClusterScopedResource = false;
  @observable apiGroup = "";
  @observable resource = "pods";
  @observable subresource = "";
  @observable resourceName = "";
  @observable singleVerb = "get";

  @observable nonResourcePath = "/healthz";
  @observable nonResourceVerb = "get";

  @observable loading = false;
  @observable singleResult: AccessReviewResult | null = null;
  @observable matrixResults: Map<string, AccessReviewResult> | null = null;
  @observable viewMode: "single" | "matrix" = "single";

  private currentRequestId = 0;
  private isUnmounted = false;
  private disposers: (() => void)[] = [];

  constructor(props: Dependencies) {
    super(props);
    makeObservable(this);
  }

  componentDidMount() {
    this.initFromSearchParams();
    this.disposers.push(this.props.subscribeStores([
      this.props.roleStore,
      this.props.clusterRoleStore,
      this.props.roleBindingStore,
      this.props.clusterRoleBindingStore,
    ]));

    // Invalidate results whenever query parameters or active cluster context change
    this.disposers.push(
      reaction(
        () => [
          this.identityType,
          this.saNamespace,
          this.saName,
          this.username,
          this.userGroups,
          this.isNonResource,
          this.resourceNamespace,
          this.isClusterScopedResource,
          this.apiGroup,
          this.resource,
          this.subresource,
          this.resourceName,
          this.singleVerb,
          this.nonResourcePath,
          this.nonResourceVerb,
          this.props.hostedCluster?.id,
          typeof (this.props.hostedCluster as any)?.disconnected?.get === "function"
            ? (this.props.hostedCluster as any).disconnected.get()
            : (this.props.hostedCluster as any)?.disconnected,
          typeof (this.props.hostedCluster as any)?.accessible?.get === "function"
            ? (this.props.hostedCluster as any).accessible.get()
            : (this.props.hostedCluster as any)?.accessible,
          typeof (this.props.hostedCluster as any)?.online?.get === "function"
            ? (this.props.hostedCluster as any).online.get()
            : (this.props.hostedCluster as any)?.online,
        ],
        () => {
          this.invalidateResults();
        },
      ),
    );
  }

  componentWillUnmount() {
    this.isUnmounted = true;
    this.currentRequestId++;
    this.disposers.forEach(dispose => dispose());
    this.disposers = [];
  }

  @action
  invalidateResults() {
    this.singleResult = null;
    this.matrixResults = null;
    this.loading = false;
    this.currentRequestId++;
  }

  @action
  private initFromSearchParams() {
    try {
      const search = this.props.observableHistory.searchParams || window.location.search;
      const params = new URLSearchParams(search);
      const sa = params.get("serviceAccount");
      const ns = params.get("namespace");
      const ident = params.get("identity");

      if (sa) {
        this.identityType = "service-account";
        this.saName = sa;

        if (ns) {
          this.saNamespace = ns;
          this.resourceNamespace = ns;
        }
        // Conscious operator action required: NEVER auto-run queries from URL parameters
      } else if (ident === "current-user") {
        this.identityType = "current-user";
      }
    } catch {
      // Ignored
    }
  }

  private buildBaseQuery(): AccessReviewQuery {
    const base: AccessReviewQuery = {
      identityType: this.identityType,
      clusterId: this.props.hostedCluster?.id,
    };

    if (this.identityType === "service-account") {
      base.serviceAccount = {
        name: this.saName.trim(),
        namespace: this.saNamespace.trim() || "default",
      };
    } else if (this.identityType === "user") {
      base.user = {
        username: this.username.trim(),
        groups: this.userGroups
          .split(",")
          .map(g => g.trim())
          .filter(Boolean),
      };
    }

    if (this.isNonResource) {
      base.nonResourceAttributes = {
        path: this.nonResourcePath.trim() || "/",
        verb: this.nonResourceVerb.trim() || "get",
      };
    } else {
      base.resourceAttributes = {
        namespace: this.isClusterScopedResource ? undefined : (this.resourceNamespace.trim() || undefined),
        group: this.apiGroup.trim(),
        resource: this.resource.trim() || "pods",
        subresource: this.subresource.trim() || undefined,
        name: this.resourceName.trim() || undefined,
        verb: this.singleVerb.trim() || "get",
      };
    }

    return base;
  }

  private getLocalEvaluation(query: AccessReviewQuery) {
    const { roleStore, clusterRoleStore, roleBindingStore, clusterRoleBindingStore } = this.props;

    const getStatus = (store: any) => ({
      isLoaded: Boolean(store?.isLoaded),
      failedLoading: Boolean(store?.failedLoading),
      error: store?.error,
    });

    return evaluateLocalRbac({
      roles: roleStore?.items || [],
      clusterRoles: clusterRoleStore?.items || [],
      roleBindings: roleBindingStore?.items || [],
      clusterRoleBindings: clusterRoleBindingStore?.items || [],
      query,
      storeStatuses: {
        roles: getStatus(roleStore),
        clusterRoles: getStatus(clusterRoleStore),
        roleBindings: getStatus(roleBindingStore),
        clusterRoleBindings: getStatus(clusterRoleBindingStore),
      },
    });
  }

  @action
  async runSingleCheck() {
    const requestId = ++this.currentRequestId;

    this.singleResult = null;
    this.matrixResults = null;
    this.loading = true;
    this.viewMode = "single";

    try {
      const query = this.buildBaseQuery();

      query.requestId = requestId;
      const localResult = this.getLocalEvaluation(query);
      const result = await this.props.accessReviewClient.reviewAccess(query, localResult);

      if (this.isUnmounted || requestId !== this.currentRequestId) {
        return;
      }

      // Context check: Ensure active cluster hasn't changed during execution
      const currentClusterId = this.props.hostedCluster?.id;

      if (query.clusterId && currentClusterId && query.clusterId !== currentClusterId) {
        runInAction(() => {
          this.loading = false;
        });

        return;
      }

      runInAction(() => {
        this.singleResult = result;
        this.loading = false;
      });
    } catch (err: any) {
      if (this.isUnmounted || requestId !== this.currentRequestId) {
        return;
      }
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  @action
  async runMatrixCheck() {
    const requestId = ++this.currentRequestId;

    this.singleResult = null;
    this.matrixResults = null;
    this.loading = true;
    this.viewMode = "matrix";

    try {
      const baseQuery = this.buildBaseQuery();

      baseQuery.requestId = requestId;
      const resultsMap = new Map<string, AccessReviewResult>();

      const verbsToCheck = this.isNonResource
        ? ["get", "post", "put", "delete", "head"]
        : STANDARD_VERBS;

      const promises = verbsToCheck.map(async verb => {
        const query: AccessReviewQuery = {
          ...baseQuery,
          resourceAttributes: baseQuery.resourceAttributes
            ? { ...baseQuery.resourceAttributes, verb }
            : undefined,
          nonResourceAttributes: baseQuery.nonResourceAttributes
            ? { ...baseQuery.nonResourceAttributes, verb }
            : undefined,
        };

        const localResult = this.getLocalEvaluation(query);
        const result = await this.props.accessReviewClient.reviewAccess(query, localResult);

        return [verb, result] as const;
      });

      const resolved = await Promise.all(promises);

      if (this.isUnmounted || requestId !== this.currentRequestId) {
        return;
      }

      // Context check: Ensure active cluster hasn't changed during execution
      const currentClusterId = this.props.hostedCluster?.id;

      if (baseQuery.clusterId && currentClusterId && baseQuery.clusterId !== currentClusterId) {
        runInAction(() => {
          this.loading = false;
        });

        return;
      }

      runInAction(() => {
        for (const [v, r] of resolved) {
          resultsMap.set(v, r);
        }
        this.matrixResults = resultsMap;
        this.loading = false;
      });
    } catch (err: any) {
      if (this.isUnmounted || requestId !== this.currentRequestId) {
        return;
      }
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  private renderVerdictBadge(verdict: string) {
    switch (verdict) {
      case "ALLOWED_API":
        return <span className="status-badge allowed-api" data-testid="verdict-allowed-api">ALLOWED (API Server)</span>;
      case "LOCAL_MATCH":
        return <span className="status-badge local-match" data-testid="verdict-local-match">COINCIDENCIA LOCAL — NO VERIFICADA</span>;
      case "DENIED_API":
        return <span className="status-badge denied-api" data-testid="verdict-denied-api">DENIED (API Server)</span>;
      case "INSUFFICIENT_DATA":
        return <span className="status-badge insufficient-data" data-testid="verdict-insufficient">INSUFFICIENT PERMISSIONS / 403</span>;
      case "INDETERMINATE":
      default:
        return <span className="status-badge indeterminate" data-testid="verdict-indeterminate">INDETERMINATE</span>;
    }
  }

  private renderEvidenceList(evidence: MatchingRuleEvidence[]) {
    if (!evidence || evidence.length === 0) {
      return (
        <div style={{ fontSize: 13, color: "#90a4ae", fontStyle: "italic", marginTop: 8 }}>
          No matching local Roles or RoleBindings found in cache.
        </div>
      );
    }

    return evidence.map((item, idx) => (
      <div
        key={idx}
        className="evidence-card"
        data-testid="matching-evidence-item">
        <div className="evidence-title">
          <Icon material="security" small />
          <span>
            {item.bindingKind}
            :
            {" "}
            <strong>{item.bindingName}</strong>
          </span>
          {item.bindingNamespace && (
            <span style={{ color: "#78909c" }}>
              (ns:
              {item.bindingNamespace}
              )
            </span>
          )}
          <span>
            →
            {item.roleRefKind}
            :
            <strong>{item.roleRefName}</strong>
          </span>
        </div>
        <div className="evidence-details">
          <div>
            <strong>Scope:</strong>
            {" "}
            {item.scopeDescription}
          </div>
          {item.matchedSubject && (
            <div>
              <strong>Matched Subject:</strong>
              {" "}
              {item.matchedSubject.kind}
              {" "}
              <code>{item.matchedSubject.name}</code>
              {item.matchedSubject.namespace && ` (${item.matchedSubject.namespace})`}
            </div>
          )}
          <div>
            <strong>Rule Verbs:</strong>
            {" "}
            <code>{item.matchedRule.verbs.join(", ")}</code>
            {" "}
            |
            {" "}
            {item.matchedRule.resources && (
              <>
                <strong>Resources:</strong>
                {" "}
                <code>{item.matchedRule.resources.join(", ")}</code>
                {" "}
                |
                {" "}
              </>
            )}
            {item.matchedRule.apiGroups && (
              <>
                <strong>API Groups:</strong>
                {" "}
                <code>{item.matchedRule.apiGroups.map(g => g === "" ? `"" (core)` : g).join(", ")}</code>
              </>
            )}
            {item.matchedRule.resourceNames && item.matchedRule.resourceNames.length > 0 && (
              <>
                {" "}
                |
                <strong>Resource Names:</strong>
                {" "}
                <code>{item.matchedRule.resourceNames.join(", ")}</code>
              </>
            )}
            {item.matchedRule.nonResourceURLs && item.matchedRule.nonResourceURLs.length > 0 && (
              <>
                {" "}
                |
                <strong>Non-Resource URLs:</strong>
                {" "}
                <code>{item.matchedRule.nonResourceURLs.join(", ")}</code>
              </>
            )}
          </div>
        </div>
      </div>
    ));
  }

  render() {
    const {
      isProductionCluster,
      hostedCluster,
      namespaceStore,
      serviceAccountStore,
      roleStore,
      clusterRoleStore,
      roleBindingStore,
      clusterRoleBindingStore,
    } = this.props;

    const isProd = isProductionCluster.get();
    const cluster = hostedCluster;
    const namespaces = namespaceStore.items.map(n => n.getName());

    const allStoresLoaded =
      roleStore?.isLoaded &&
      clusterRoleStore?.isLoaded &&
      roleBindingStore?.isLoaded &&
      clusterRoleBindingStore?.isLoaded;

    const anyStoreFailed =
      roleStore?.failedLoading ||
      clusterRoleStore?.failedLoading ||
      roleBindingStore?.failedLoading ||
      clusterRoleBindingStore?.failedLoading;

    const isDisconnected = typeof (cluster as any)?.disconnected?.get === "function"
      ? (cluster as any).disconnected.get()
      : Boolean((cluster as any)?.disconnected);
    const isAccessible = typeof (cluster as any)?.accessible?.get === "function"
      ? (cluster as any).accessible.get()
      : ((cluster as any)?.accessible !== undefined ? Boolean((cluster as any)?.accessible) : true);
    const isOnline = typeof (cluster as any)?.online?.get === "function"
      ? (cluster as any).online.get()
      : ((cluster as any)?.online !== undefined ? Boolean((cluster as any)?.online) : true);
    const isClusterUnavailable = Boolean(cluster && (isDisconnected || !isAccessible || !isOnline));

    return (
      <SiblingsInTabLayout scrollable>
        <div className="RbacInspector" data-testid="rbac-inspector-container">
          <div className="header-section">
            <div className="title-area">
              <h2>
                <Icon material="policy" style={{ color: "#0288d1" }} />
                RBAC Permission Inspector (
                <code>auth can-i</code>
                )
              </h2>
              <p>
                Local-first authorization debugger: simulates rules against local RBAC cache and validates with Kubernetes API server AccessReviews.
                {cluster?.name && (
                  <span style={{ marginLeft: 8, color: "#90a4ae" }}>
                    Active Cluster:
                    <strong>{cluster.name.get()}</strong>
                  </span>
                )}
              </p>
            </div>
            {isProd && (
              <div className="prod-warning-badge" data-testid="prod-warning-badge">
                <Icon material="warning" small />
                PRODUCTION CLUSTER — Read-only AccessReviews only
              </div>
            )}
          </div>

          {isClusterUnavailable && (
            <div
              className="cluster-offline-banner"
              data-testid="cluster-offline-banner"
              style={{
                background: "rgba(244, 67, 54, 0.15)",
                border: "1px solid #f44336",
                borderRadius: "4px",
                padding: "8px 12px",
                marginBottom: "16px",
                color: "#ef5350",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}>
              <Icon material="cloud_off" small />
              <span>
                <strong>Clúster no disponible:</strong>
                {" "}
                El clúster se encuentra desconectado, inaccesible o fuera de línea.
                Las verificaciones del API server no se ejecutarán. Solo se mostrarán coincidencias de reglas locales en caché no verificadas.
              </span>
            </div>
          )}

          {(!allStoresLoaded || anyStoreFailed) && (
            <div
              className="store-warning-banner"
              data-testid="store-warning-banner"
              style={{
                background: "rgba(255, 152, 0, 0.15)",
                border: "1px solid #242424",
                borderRadius: "4px",
                padding: "8px 12px",
                marginBottom: "16px",
                color: "#242424",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}>
              <Icon material="warning" small />
              <span>
                <strong>Atención al operador:</strong>
                {" "}
                Almacén de definiciones RBAC incompleto o con errores de carga (RBAC 403 / cargando).
                La evaluación local no puede garantizar cobertura total.
              </span>
            </div>
          )}

          <div className="query-card">
            <div className="section-label">1. Identity to Inspect</div>
            <div className="form-row">
              <div className="form-group" style={{ maxWidth: 260 }}>
                <label>Subject Type</label>
                <select
                  value={this.identityType}
                  onChange={action((e: any) => { this.identityType = e.target.value; })}
                  data-testid="identity-type-select"
                >
                  <option value="current-user">Current User (SelfSubjectAccessReview)</option>
                  <option value="service-account">ServiceAccount (SubjectAccessReview)</option>
                  <option value="user">User / Group (SubjectAccessReview)</option>
                </select>
              </div>

              {this.identityType === "service-account" && (
                <>
                  <div className="form-group">
                    <label>ServiceAccount Namespace</label>
                    <input
                      list="ns-datalist"
                      value={this.saNamespace}
                      onChange={action((e: any) => { this.saNamespace = e.target.value; })}
                      placeholder="default"
                      data-testid="sa-namespace-input"
                    />
                    <datalist id="ns-datalist">
                      {namespaces.map(ns => <option key={ns} value={ns} />)}
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label>ServiceAccount Name</label>
                    <input
                      list="sa-datalist"
                      value={this.saName}
                      onChange={action((e: any) => { this.saName = e.target.value; })}
                      placeholder="e.g. default, deployer"
                      data-testid="sa-name-input"
                    />
                    <datalist id="sa-datalist">
                      {serviceAccountStore.items
                        .filter(sa => !this.saNamespace || sa.getNs() === this.saNamespace)
                        .map(sa => <option key={sa.getId()} value={sa.getName()} />)}
                    </datalist>
                  </div>
                </>
              )}

              {this.identityType === "user" && (
                <>
                  <div className="form-group">
                    <label>Username</label>
                    <input
                      value={this.username}
                      onChange={action((e: any) => { this.username = e.target.value; })}
                      placeholder="e.g. alice@example.com"
                      data-testid="username-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Groups (comma-separated)</label>
                    <input
                      value={this.userGroups}
                      onChange={action((e: any) => { this.userGroups = e.target.value; })}
                      placeholder="system:authenticated, dev-team"
                      data-testid="user-groups-input"
                    />
                  </div>
                </>
              )}
            </div>

            {this.identityType === "service-account" && this.saName && (
              <div className="identity-hint">
                K8s Identity:
                {" "}
                <code>
                  system:serviceaccount:
                  {this.saNamespace || "default"}
                  :
                  {this.saName}
                </code>
              </div>
            )}

            <div className="section-label" style={{ marginTop: 18 }}>2. Action & Target</div>
            <div className="form-row" style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="targetMode"
                    checked={!this.isNonResource}
                    onChange={action(() => { this.isNonResource = false; })}
                  />
                  Resource Request
                </label>
                <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="targetMode"
                    checked={this.isNonResource}
                    onChange={action(() => { this.isNonResource = true; })}
                  />
                  Non-Resource URL Request
                </label>
              </div>
            </div>

            {!this.isNonResource ? (
              <>
                <div className="form-row">
                  <div className="form-group" style={{ maxWidth: 200 }}>
                    <label>Namespace</label>
                    <input
                      list="ns-datalist-target"
                      disabled={this.isClusterScopedResource}
                      value={this.resourceNamespace}
                      onChange={action((e: any) => { this.resourceNamespace = e.target.value; })}
                      placeholder="default"
                      data-testid="target-namespace-input"
                    />
                    <datalist id="ns-datalist-target">
                      {namespaces.map(ns => <option key={ns} value={ns} />)}
                    </datalist>
                  </div>
                  <div className="form-group" style={{ maxWidth: 160, justifyContent: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginTop: 18 }}>
                      <input
                        type="checkbox"
                        checked={this.isClusterScopedResource}
                        onChange={action((e: any) => { this.isClusterScopedResource = e.target.checked; })}
                      />
                      Cluster-scoped
                    </label>
                  </div>
                  <div className="form-group">
                    <label>Resource</label>
                    <input
                      value={this.resource}
                      onChange={action((e: any) => { this.resource = e.target.value; })}
                      placeholder="pods, secrets, deployments, *"
                      data-testid="target-resource-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>API Group</label>
                    <input
                      value={this.apiGroup}
                      onChange={action((e: any) => { this.apiGroup = e.target.value; })}
                      placeholder='"" (core), apps, batch, *'
                      data-testid="target-group-input"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Subresource (optional)</label>
                    <input
                      value={this.subresource}
                      onChange={action((e: any) => { this.subresource = e.target.value; })}
                      placeholder="exec, log, status, scale, portforward"
                      data-testid="target-subresource-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Resource Name (optional)</label>
                    <input
                      value={this.resourceName}
                      onChange={action((e: any) => { this.resourceName = e.target.value; })}
                      placeholder="e.g. my-app-secret-1"
                      data-testid="target-name-input"
                    />
                  </div>
                  <div className="form-group" style={{ maxWidth: 180 }}>
                    <label>Verb</label>
                    <select
                      value={this.singleVerb}
                      onChange={action((e: any) => { this.singleVerb = e.target.value; })}
                      data-testid="target-verb-select"
                    >
                      {STANDARD_VERBS.map(v => <option key={v} value={v}>{v}</option>)}
                      <option value="*">* (all verbs)</option>
                    </select>
                  </div>
                </div>
              </>
            ) : (
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Non-Resource URL Path</label>
                  <input
                    value={this.nonResourcePath}
                    onChange={action((e: any) => { this.nonResourcePath = e.target.value; })}
                    placeholder="/healthz, /livez, /metrics, /version, *"
                    data-testid="non-resource-path-input"
                  />
                </div>
                <div className="form-group" style={{ maxWidth: 180 }}>
                  <label>HTTP Verb</label>
                  <select
                    value={this.nonResourceVerb}
                    onChange={action((e: any) => { this.nonResourceVerb = e.target.value; })}
                    data-testid="non-resource-verb-select"
                  >
                    <option value="get">get</option>
                    <option value="post">post</option>
                    <option value="put">put</option>
                    <option value="delete">delete</option>
                    <option value="head">head</option>
                    <option value="*">*</option>
                  </select>
                </div>
              </div>
            )}

            <div className="actions-row">
              <Button
                primary
                waiting={this.loading}
                disabled={this.loading}
                onClick={() => this.runSingleCheck()}
                data-testid="check-permission-button"
              >
                <Icon
                  material="play_arrow"
                  small
                  style={{ marginRight: 6 }} />
                Check Permission
              </Button>
              <Button
                outlined
                waiting={this.loading}
                disabled={this.loading}
                onClick={() => this.runMatrixCheck()}
                data-testid="check-matrix-button"
              >
                <Icon
                  material="grid_on"
                  small
                  style={{ marginRight: 6 }} />
                Check All Verbs Matrix
              </Button>
              {this.loading && <Spinner singleColor style={{ marginLeft: 8 }} />}
            </div>
          </div>

          {/* Results section */}
          {this.viewMode === "single" && this.singleResult && (
            <div className="single-verdict-box" data-testid="single-result-box">
              <div className="verdict-header">
                <span style={{ fontSize: 13, fontWeight: 600 }}>Verdict:</span>
                {this.renderVerdictBadge(this.singleResult.verdict)}
                <span style={{ fontSize: 11, color: "#90a4ae" }}>
                  (Origin:
                  {" "}
                  <code>{this.singleResult.origin}</code>
                  {" "}
                  | Timestamp:
                  {" "}
                  {new Date(this.singleResult.timestamp).toLocaleTimeString()}
                  )
                </span>
              </div>
              {this.singleResult.reason && (
                <div className="verdict-reason">
                  <strong>Reason:</strong>
                  {" "}
                  {this.singleResult.reason}
                </div>
              )}
              {this.singleResult.warnings && this.singleResult.warnings.length > 0 && (
                <div className="verdict-warning">
                  <Icon
                    material="info"
                    small
                    style={{ marginRight: 6 }} />
                  {this.singleResult.warnings.join(" | ")}
                </div>
              )}
            </div>
          )}

          {this.viewMode === "matrix" && this.matrixResults && (
            <div className="matrix-section" data-testid="matrix-results-box">
              <h3>All Standard Verbs Permission Matrix</h3>
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th>Verb</th>
                    <th>Verdict</th>
                    <th>Origin</th>
                    <th>Reason / Details</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(this.matrixResults.entries()).map(([verb, res]) => (
                    <tr key={verb} data-testid={`matrix-row-${verb}`}>
                      <td><code><strong>{verb}</strong></code></td>
                      <td>{this.renderVerdictBadge(res.verdict)}</td>
                      <td><code>{res.origin}</code></td>
                      <td style={{ color: "#b0bec5" }}>
                        {res.reason || (res.allowed ? "Allowed" : "Not Allowed")}
                        {res.warnings && res.warnings.length > 0 && (
                          <div style={{ color: "#242424", fontSize: 11 }}>{res.warnings.join(", ")}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Matching Evidence Section */}
          <div className="evidence-section" data-testid="evidence-section">
            <h3>Matching Local Roles & RoleBindings Evidence</h3>
            <div className="evidence-disclaimer">
              Discovered from currently loaded cluster Roles, ClusterRoles, RoleBindings, and ClusterRoleBindings.
              Note: Kubernetes API server authorization may evaluate external webhooks or Node authorizers in addition to local RBAC rules.
            </div>
            {this.renderEvidenceList(
              (this.viewMode === "single" ? this.singleResult?.matchingEvidence : undefined) ||
              (this.viewMode === "matrix" ? Array.from(this.matrixResults?.values() || [])[0]?.matchingEvidence : undefined) ||
              [],
            )}
          </div>
        </div>
      </SiblingsInTabLayout>
    );
  }
}

export const RbacInspector = withInjectables<Dependencies>(NonInjectedRbacInspector, {
  getProps: (di, props) => ({
    ...props,
    roleStore: di.inject(roleStoreInjectable),
    clusterRoleStore: di.inject(clusterRoleStoreInjectable),
    roleBindingStore: di.inject(roleBindingStoreInjectable),
    clusterRoleBindingStore: di.inject(clusterRoleBindingStoreInjectable),
    serviceAccountStore: di.inject(serviceAccountStoreInjectable),
    namespaceStore: di.inject(namespaceStoreInjectable),
    subscribeStores: di.inject(subscribeStoresInjectable),
    isProductionCluster: di.inject(isProductionClusterInjectable),
    hostedCluster: di.inject(hostedClusterInjectable),
    accessReviewClient: di.inject(accessReviewClientInjectable),
    observableHistory: di.inject(observableHistoryInjectionToken),
  }),
});
