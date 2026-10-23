/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./drain-dialog.scss";

import React, { Component } from "react";
import type { IObservableValue, IComputedValue } from "mobx";
import { observable, makeObservable, runInAction, reaction } from "mobx";
import { observer, disposeOnUnmount } from "mobx-react";
import type { Node, Pod, PodDisruptionBudget } from "@openlens/kube-object";
import type { Cluster } from "../../../../common/cluster/cluster";
import { Dialog } from "../../dialog";
import { Wizard, WizardStep } from "../../wizard";
import { Checkbox } from "../../checkbox";
import { Input } from "../../input";
import { Icon } from "../../icon";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { NodeApi, PodApi } from "../../../../common/k8s-api/endpoints";
import nodeApiInjectable from "../../../../common/k8s-api/endpoints/node.api.injectable";
import podApiInjectable from "../../../../common/k8s-api/endpoints/pod.api.injectable";
import podDisruptionBudgetApiInjectable from "../../../../common/k8s-api/endpoints/pod-disruption-budget.api.injectable";
import type { PodDisruptionBudgetApi } from "../../../../common/k8s-api/endpoints/pod-disruption-budget.api";
import nodeStoreInjectable from "../store.injectable";
import type { NodeStore } from "../store";
import podStoreInjectable from "../../workloads-pods/store.injectable";
import type { PodStore } from "../../workloads-pods/store";
import podDisruptionBudgetStoreInjectable from "../../config-pod-disruption-budgets/store.injectable";
import type { PodDisruptionBudgetStore } from "../../config-pod-disruption-budgets/store";
import drainNodeDialogStateInjectable from "./state.injectable";
import isProductionClusterInjectable from "../../kube-object-menu/is-production-cluster.injectable";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import type { ShowCheckedErrorNotification } from "../../notifications/show-checked-error.injectable";
import showCheckedErrorNotificationInjectable from "../../notifications/show-checked-error.injectable";
import type { ShowNotification } from "../../notifications/notifications";
import showSuccessNotificationInjectable from "../../notifications/show-success-notification.injectable";
import type { SubscribeStores } from "../../../kube-watch-api/kube-watch-api";
import subscribeStoresInjectable from "../../../kube-watch-api/subscribe-stores.injectable";
import loadPodsFromAllNamespacesInjectable from "../../workloads-pods/load-pods-from-all-namespaces.injectable";
import loadPdbsFromAllNamespacesInjectable from "./load-pdbs-from-all-namespaces.injectable";
import { ClusterDataLoadError } from "../../../utils/cluster-data-load-error";

export interface DrainNodeDialogProps {
  pollIntervalMs?: number;
  evictionTimeoutMs?: number;
}

interface Dependencies {
  nodeApi: NodeApi;
  podApi: PodApi;
  nodeStore: NodeStore;
  podStore: PodStore;
  podDisruptionBudgetStore: PodDisruptionBudgetStore;
  podDisruptionBudgetApi?: PodDisruptionBudgetApi;
  state: IObservableValue<Node | undefined>;
  isProduction: IComputedValue<boolean>;
  cluster?: Cluster;
  showCheckedErrorNotification: ShowCheckedErrorNotification;
  showSuccessNotification: ShowNotification;
  subscribeStores?: SubscribeStores;
  loadPodsFromAllNamespaces?: () => Promise<any> | void;
  loadPdbsFromAllNamespaces?: () => Promise<any> | void;
}

export interface LabelSelectorRequirement {
  key: string;
  operator: "In" | "NotIn" | "Exists" | "DoesNotExist" | string;
  values?: string[];
}

export interface LabelSelector {
  matchLabels?: Record<string, string | undefined>;
  matchExpressions?: LabelSelectorRequirement[];
}

function getPodUid(pod: Pod): string {
  try {
    return pod.getId?.() || pod.metadata?.uid || pod.getName?.() || "";
  } catch {
    return "";
  }
}

export function matchesSelector(
  selector?: LabelSelector | Partial<Record<string, string | undefined>> | null,
  labels?: Record<string, string | undefined> | null,
): boolean {
  if (!selector) return true;

  const isStructured = "matchLabels" in selector || "matchExpressions" in selector;
  const matchLabels = isStructured
    ? (selector as LabelSelector).matchLabels
    : (selector as Record<string, string | undefined>);
  const matchExpressions = isStructured
    ? (selector as LabelSelector).matchExpressions
    : undefined;

  const hasLabels = Boolean(matchLabels && Object.keys(matchLabels).length > 0);
  const hasExprs = Boolean(matchExpressions && matchExpressions.length > 0);

  if (!hasLabels && !hasExprs) return true;
  if (!labels) return false;

  if (hasLabels && matchLabels) {
    for (const [key, value] of Object.entries(matchLabels)) {
      if (value === undefined || labels[key] !== value) {
        return false;
      }
    }
  }

  if (hasExprs && matchExpressions) {
    for (const expr of matchExpressions) {
      const { key, operator, values = [] } = expr;
      const labelVal = labels[key];
      const hasKey = labelVal !== undefined;

      switch (operator) {
        case "In":
          if (!hasKey || !values.includes(labelVal)) return false;
          break;
        case "NotIn":
          if (hasKey && values.includes(labelVal)) return false;
          break;
        case "Exists":
          if (!hasKey) return false;
          break;
        case "DoesNotExist":
          if (hasKey) return false;
          break;
        default:
          return false;
      }
    }
  }

  return true;
}

interface PdbSnapshot {
  name: string;
  namespace: string;
  resourceVersion?: string;
  disruptionsAllowed?: number;
  minAvailable?: any;
  maxUnavailable?: any;
  selectorJson: string;
  classification: "allowed" | "blocked" | "unknown";
}

@observer
class NonInjectedDrainNodeDialog extends Component<DrainNodeDialogProps & Dependencies> {
  @observable deleteEmptyDirData = false;
  @observable forceUnmanaged = false;
  @observable prodAcknowledged = false;
  @observable typedConfirm = "";
  @observable isDraining = false;
  @observable drainProgress = "";
  @observable drainError = "";
  @observable storeLoadError = "";
  @observable isPartialLoad = false;
  @observable storesLoaded = false;

  private initialClusterId?: string;
  private initialEmptyDirPodUids = new Set<string>();
  private initialUnmanagedPodUids = new Set<string>();
  private initialPdbSnapshots = new Map<string, PdbSnapshot>();
  private loadGeneration = 0;

  constructor(props: DrainNodeDialogProps & Dependencies) {
    super(props);
    this.storesLoaded = Boolean(
      props.podStore?.isLoaded &&
      props.podDisruptionBudgetStore?.isLoaded &&
      !props.podStore?.failedLoading &&
      !props.podDisruptionBudgetStore?.failedLoading,
    );
    makeObservable(this);
  }

  componentDidMount() {
    if (this.props.subscribeStores) {
      disposeOnUnmount(this, [
        this.props.subscribeStores([
          this.props.podStore,
          this.props.podDisruptionBudgetStore,
        ]),
        reaction(
          () => this.props.state.get(),
          (node) => {
            if (node) {
              this.loadStores();
            }
          },
        ),
      ]);
    }

    const initialNode = this.props.state.get();

    if (initialNode) {
      this.loadStores();
    } else {
      this.loadStores();
    }
  }

  private async loadStores() {
    // Ignore responses from an older load (e.g. the operator switched nodes while loading).
    const generation = ++this.loadGeneration;

    runInAction(() => {
      this.storeLoadError = "";
      this.isPartialLoad = false;
      this.storesLoaded = false;
    });

    try {
      await Promise.all([
        this.props.loadPodsFromAllNamespaces
          ? this.props.loadPodsFromAllNamespaces()
          : this.props.podStore?.loadAll(),
        this.props.loadPdbsFromAllNamespaces
          ? this.props.loadPdbsFromAllNamespaces()
          : this.props.podDisruptionBudgetStore?.loadAll(),
      ]);

      if (generation !== this.loadGeneration) {
        return;
      }

      const loadsAreIncomplete = Boolean(this.props.podStore?.failedLoading) || Boolean(this.props.podDisruptionBudgetStore?.failedLoading);

      if (loadsAreIncomplete) {
        runInAction(() => {
          this.isPartialLoad = true;
          this.storeLoadError = "Workload or PDB data incomplete (partial namespace load failure). Drain blocked for safety.";
          this.storesLoaded = false;
        });

        return;
      }

      // The preview snapshot must be taken from the *complete* dataset. Taking it before the
      // cluster-wide load finishes would make every pre-existing workload look "new" during
      // revalidation and would permanently block an otherwise safe drain.
      const node = this.props.state.get();

      if (node) {
        this.takePreFlightSnapshot(node.getName());
      }

      runInAction(() => {
        this.storesLoaded = true;
      });
    } catch (err: any) {
      if (generation !== this.loadGeneration) {
        return;
      }

      runInAction(() => {
        this.isPartialLoad = err instanceof ClusterDataLoadError && err.partial;
        const msg = err?.message || String(err);

        this.storeLoadError = this.isPartialLoad
          ? `Workload or PDB data incomplete (partial namespace load failure): ${msg}. Drain blocked for safety.`
          : `Failed to load cluster workloads or PDBs: ${msg}`;
        this.storesLoaded = false;
      });
    }
  }

  private takePreFlightSnapshot(nodeName: string) {
    this.initialClusterId = this.props.cluster?.id;
    this.initialEmptyDirPodUids.clear();
    this.initialUnmanagedPodUids.clear();
    this.initialPdbSnapshots.clear();

    const pods = this.props.podStore.getPodsByNode(nodeName);
    const pdbs = this.props.podDisruptionBudgetStore?.items || [];

    for (const pod of pods) {
      if (!this.isDaemonSet(pod)) {
        if (this.hasEmptyDir(pod)) {
          this.initialEmptyDirPodUids.add(getPodUid(pod));
        }

        if (this.isUnmanaged(pod)) {
          this.initialUnmanagedPodUids.add(getPodUid(pod));
        }

        const matching = this.getMatchingPdbs(pod, pdbs);

        for (const pdb of matching) {
          const key = `${pdb.getNs()}/${pdb.getName()}`;

          if (!this.initialPdbSnapshots.has(key)) {
            const classification = this.classifyPdbs(pod, [pdb]);

            this.initialPdbSnapshots.set(key, {
              name: pdb.getName(),
              namespace: pdb.getNs(),
              resourceVersion: pdb.metadata?.resourceVersion,
              disruptionsAllowed: pdb.status?.disruptionsAllowed,
              minAvailable: pdb.spec?.minAvailable,
              maxUnavailable: pdb.spec?.maxUnavailable,
              selectorJson: JSON.stringify(pdb.spec?.selector || {}),
              classification: classification.isBlocked ? "blocked" : classification.isAllowed ? "allowed" : "unknown",
            });
          }
        }
      }
    }
  }

  get dataStatus(): "loading" | "error" | "ready" {
    if (this.storeLoadError || this.isPartialLoad) {
      return "error";
    }

    if (Boolean(this.props.podStore?.failedLoading) || Boolean(this.props.podDisruptionBudgetStore?.failedLoading)) {
      return "error";
    }

    const podStoreLoading = Boolean(this.props.podStore?.isLoading) || this.props.podStore?.isLoaded === false;
    const pdbStoreLoading = Boolean(this.props.podDisruptionBudgetStore?.isLoading) || this.props.podDisruptionBudgetStore?.isLoaded === false;

    if (podStoreLoading || pdbStoreLoading || !this.storesLoaded) {
      return "loading";
    }

    return "ready";
  }

  close = () => {
    if (this.isDraining) return;
    this.reset();
    this.props.state.set(undefined);
  };

  private reset() {
    runInAction(() => {
      this.deleteEmptyDirData = false;
      this.forceUnmanaged = false;
      this.prodAcknowledged = false;
      this.typedConfirm = "";
      this.isDraining = false;
      this.drainProgress = "";
      this.drainError = "";
      this.storeLoadError = "";
      this.isPartialLoad = false;
      this.storesLoaded = false;
    });
    this.initialPdbSnapshots.clear();
    this.loadGeneration++;
  }

  private isDaemonSet(pod: Pod): boolean {
    return pod.getOwnerRefs().some(ref => ref.kind === "DaemonSet");
  }

  private isUnmanaged(pod: Pod): boolean {
    return pod.getOwnerRefs().length === 0;
  }

  private hasEmptyDir(pod: Pod): boolean {
    return Boolean(pod.spec?.volumes?.some(vol => Boolean(vol.emptyDir)));
  }

  private getMatchingPdbs(pod: Pod, pdbs: PodDisruptionBudget[]): PodDisruptionBudget[] {
    return pdbs.filter(pdb => {
      if (pdb.getNs() !== pod.getNs()) return false;

      return matchesSelector(pdb.spec?.selector as LabelSelector, pod.metadata?.labels);
    });
  }

  private classifyPdbs(pod: Pod, pdbs: PodDisruptionBudget[]): {
    isBlocked: boolean;
    isUnknown: boolean;
    isAllowed: boolean;
  } {
    const matching = this.getMatchingPdbs(pod, pdbs);

    if (matching.length === 0) {
      return { isBlocked: false, isUnknown: false, isAllowed: true };
    }

    let hasBlocked = false;
    let hasUnknown = false;

    for (const pdb of matching) {
      const allowed = pdb.status?.disruptionsAllowed;

      if (typeof allowed !== "number") {
        hasUnknown = true;
      } else if (allowed <= 0) {
        hasBlocked = true;
      }
    }

    if (hasBlocked) {
      return { isBlocked: true, isUnknown: false, isAllowed: false };
    }

    if (hasUnknown) {
      return { isBlocked: false, isUnknown: true, isAllowed: false };
    }

    return { isBlocked: false, isUnknown: false, isAllowed: true };
  }

  private async revalidatePreFlight(nodeName: string): Promise<Pod[]> {
    // 1. Verify cluster context
    const currentClusterId = this.props.cluster?.id;

    if (this.initialClusterId && currentClusterId && currentClusterId !== this.initialClusterId) {
      throw new Error(`Cluster context changed (from ${this.initialClusterId} to ${currentClusterId}). Maintenance cancelled for safety.`);
    }

    // 2. Verify target node exists and is reachable
    const freshNode = this.props.nodeApi.get ? await this.props.nodeApi.get({ name: nodeName }) : true;

    if (!freshNode) {
      throw new Error(`Target node "${nodeName}" no longer exists in cluster. Operation cancelled.`);
    }

    // 3. Re-query pods assigned to the node - do NOT swallow query errors
    let freshPods: Pod[] = [];

    if (this.props.podApi.list) {
      try {
        const res = await this.props.podApi.list({}, { fieldSelector: `spec.nodeName=${nodeName}` });

        freshPods = (res || []).filter(Boolean);
      } catch (err: any) {
        // Never fall back to the captured preview or to another (possibly partial) source.
        throw new Error(`Failed to query fresh pod workloads on node "${nodeName}": ${err?.message || String(err)}. Aborting drain before cordon.`);
      }
    } else {
      if (this.props.podStore.failedLoading) {
        throw new Error(`Pod store is in error state. Aborting drain before cordon.`);
      }

      freshPods = this.props.podStore.getPodsByNode(nodeName);
    }

    // 4. Validate no new unconsented workloads appeared
    const targetPods = freshPods.filter(p => !this.isDaemonSet(p));

    const freshEmptyDir = targetPods.filter(p => this.hasEmptyDir(p));

    if (freshEmptyDir.length > 0 && !this.deleteEmptyDirData) {
      throw new Error(`Pod(s) with emptyDir storage detected on node (${freshEmptyDir.length} pod(s)). Explicit deletion consent required.`);
    }

    const newEmptyDir = freshEmptyDir.filter(p => !this.initialEmptyDirPodUids.has(getPodUid(p)));

    if (newEmptyDir.length > 0) {
      throw new Error(`${newEmptyDir.length} new pod(s) with emptyDir storage scheduled since pre-flight. Re-confirmation required.`);
    }

    const freshUnmanaged = targetPods.filter(p => this.isUnmanaged(p));

    if (freshUnmanaged.length > 0 && !this.forceUnmanaged) {
      throw new Error(`Unmanaged (orphan) pod(s) detected on node (${freshUnmanaged.length} pod(s)). Explicit deletion acknowledgement required.`);
    }

    const newUnmanaged = freshUnmanaged.filter(p => !this.initialUnmanagedPodUids.has(getPodUid(p)));

    if (newUnmanaged.length > 0) {
      throw new Error(`${newUnmanaged.length} new unmanaged pod(s) scheduled since pre-flight. Re-confirmation required.`);
    }

    // 5. Re-query applicable PDBs and verify relevant changes before cordon
    let freshPdbs: PodDisruptionBudget[] = [];

    if (this.props.podDisruptionBudgetApi?.list) {
      try {
        freshPdbs = (await this.props.podDisruptionBudgetApi.list() || []).filter(Boolean);
      } catch (err: any) {
        throw new Error(`Failed to revalidate PodDisruptionBudgets from API server: ${err?.message || String(err)}. Maintenance cancelled before cordon.`);
      }
    } else {
      if (this.props.podDisruptionBudgetStore.failedLoading) {
        throw new Error(`PodDisruptionBudget store is in error state. Aborting drain before cordon.`);
      }

      freshPdbs = this.props.podDisruptionBudgetStore.items;
    }

    const freshPdbsByKey = new Map<string, PodDisruptionBudget>();

    for (const pdb of freshPdbs) {
      freshPdbsByKey.set(`${pdb.getNs()}/${pdb.getName()}`, pdb);
    }

    // Every PDB that constrained this node during the preview must still exist and keep the same
    // rules. This also catches a selector edit that made the PDB stop matching the target pods.
    for (const [key, snapshot] of this.initialPdbSnapshots) {
      const current = freshPdbsByKey.get(key);

      if (!current) {
        throw new Error(`PodDisruptionBudget "${snapshot.name}" in namespace "${snapshot.namespace}" no longer exists. Drain cancelled before cordon. Re-confirmation required.`);
      }

      const currentSelectorJson = JSON.stringify(current.spec?.selector || {});

      if (
        snapshot.selectorJson !== currentSelectorJson ||
        JSON.stringify(snapshot.minAvailable) !== JSON.stringify(current.spec?.minAvailable) ||
        JSON.stringify(snapshot.maxUnavailable) !== JSON.stringify(current.spec?.maxUnavailable)
      ) {
        throw new Error(`PodDisruptionBudget "${snapshot.name}" rules or selectors modified since pre-flight. Drain cancelled before cordon. Re-confirmation required.`);
      }

      if (
        snapshot.disruptionsAllowed !== undefined
        && current.status?.disruptionsAllowed !== undefined
        && current.status.disruptionsAllowed < snapshot.disruptionsAllowed
      ) {
        throw new Error(`PodDisruptionBudget "${snapshot.name}" disruptionsAllowed decreased from ${snapshot.disruptionsAllowed} to ${current.status.disruptionsAllowed}. Drain cancelled before cordon. Re-confirmation required.`);
      }
    }

    for (const pod of targetPods) {
      const matching = this.getMatchingPdbs(pod, freshPdbs);

      for (const pdb of matching) {
        const key = `${pdb.getNs()}/${pdb.getName()}`;
        const snapshot = this.initialPdbSnapshots.get(key);
        const classification = this.classifyPdbs(pod, [pdb]);
        const currentStatus = classification.isBlocked ? "blocked" : classification.isAllowed ? "allowed" : "unknown";

        if (!snapshot) {
          throw new Error(`New PodDisruptionBudget "${pdb.getName()}" in namespace "${pdb.getNs()}" now applies to pod "${pod.getName()}". Drain cancelled before cordon. Re-confirmation required.`);
        }

        if (snapshot.classification !== currentStatus) {
          throw new Error(`PodDisruptionBudget "${pdb.getName()}" changed status from ${snapshot.classification} to ${currentStatus} (disruptionsAllowed=${pdb.status?.disruptionsAllowed ?? "unknown"}). Drain cancelled before cordon. Re-confirmation required.`);
        }
      }
    }

    return targetPods;
  }

  private async drainNode(node: Node) {
    console.log("DEBUG: drainNode CALLED for node", node.getName());
    this.isDraining = true;
    this.drainError = "";
    const nodeName = node.getName();
    let nodeCordoned = false;

    try {
      // Immediate pre-execution revalidation
      this.drainProgress = `Performing immediate pre-flight safety revalidation on ${nodeName}...`;
      const freshTargetPods = await this.revalidatePreFlight(nodeName);
      // Strictly fresh query result; never fall back to stale pre-flight pods
      const podsToEvict = freshTargetPods;

      // Step 1: Cordon node
      this.drainProgress = `Cordoning node ${nodeName}...`;
      await this.props.nodeApi.cordon({ name: nodeName });
      nodeCordoned = true;

      // Zero pods to evict: complete drain cleanly without unnecessary eviction loops
      if (podsToEvict.length === 0) {
        this.props.showSuccessNotification(`Node ${nodeName} cordoned and drained: no evictable workloads present.`);
        this.isDraining = false;
        this.close();

        return;
      }

      // Step 2: Post eviction requests
      for (let i = 0; i < podsToEvict.length; i++) {
        const pod = podsToEvict[i];

        this.drainProgress = `Evicting pod ${pod.getName()} in ${pod.getNs()} (${i + 1}/${podsToEvict.length})...`;
        await this.props.podApi.evict({
          name: pod.getName(),
          namespace: pod.getNs(),
        });
      }

      // Step 3: Eviction verification loop (polling until pods terminate/leave node)
      this.drainProgress = `Eviction requests accepted. Verifying pod termination on ${nodeName}...`;

      const pollIntervalMs = this.props.pollIntervalMs ?? 1000;
      const evictionTimeoutMs = this.props.evictionTimeoutMs ?? 60000;
      const startTime = Date.now();
      let remainingCount = podsToEvict.length;

      while (Date.now() - startTime < evictionTimeoutMs) {
        let currentPods: Pod[] = [];

        if (this.props.podApi.list) {
          try {
            const res = await this.props.podApi.list({}, { fieldSelector: `spec.nodeName=${nodeName}` });

            currentPods = (res || []).filter(Boolean);
          } catch (err: any) {
            throw new Error(`Failed to verify pod termination on node "${nodeName}": ${err?.message || String(err)}. Node remains cordoned.`);
          }
        } else {
          // If podApi.list is not supplied, check podStore
          currentPods = this.props.podStore.getPodsByNode(nodeName);
        }

        const remainingEvictable = currentPods.filter(p => !this.isDaemonSet(p));

        remainingCount = remainingEvictable.length;

        if (remainingCount === 0) {
          this.props.showSuccessNotification(`Node ${nodeName} drained and verified: all workloads terminated/rescheduled.`);
          this.isDraining = false;
          this.close();

          return;
        }

        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);

        this.drainProgress = `Waiting for ${remainingCount} pod(s) to terminate... (${elapsedSec}s elapsed)`;

        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }

      // Timeout reached
      if (remainingCount < podsToEvict.length) {
        throw new Error(`Drain partially completed: ${remainingCount} of ${podsToEvict.length} pod(s) did not terminate within timeout (${evictionTimeoutMs / 1000}s). Node remains cordoned.`);
      } else {
        throw new Error(`Drain timed out waiting for pods to terminate on ${nodeName}. Node remains cordoned.`);
      }
    } catch (err: any) {
      runInAction(() => {
        this.isDraining = false;
        const msg = typeof err === "string" ? err : err?.message || JSON.stringify(err);

        if (nodeCordoned) {
          this.drainError = `Drain interrupted: ${msg}. WARNING: Node ${nodeName} remains cordoned (unschedulable) to protect cluster stability. Do not uncordon automatically.`;
        } else {
          this.drainError = `Drain aborted before execution: ${msg}`;
        }
        this.typedConfirm = "";
      });
      this.props.showCheckedErrorNotification(err, nodeCordoned ? "Drain interrupted (Node remains cordoned)" : "Drain pre-flight cancelled");
    }
  }

  render() {
    const node = this.props.state.get();

    if (!node) {
      return null;
    }

    const nodeName = node.getName();
    const isProd = this.props.isProduction.get();
    const allNodes = this.props.nodeStore.items;
    const isSingleNode = allNodes.length <= 1;

    const allPodsOnNode = this.props.podStore.getPodsByNode(nodeName);
    const daemonSetPods = allPodsOnNode.filter(p => this.isDaemonSet(p));
    // DaemonSets are permanently excluded from targetPods in R7-01
    const targetPods = allPodsOnNode.filter(p => !this.isDaemonSet(p));
    const emptyDirPods = targetPods.filter(p => this.hasEmptyDir(p));
    const unmanagedPods = targetPods.filter(p => this.isUnmanaged(p));

    const activePdbs = this.props.podDisruptionBudgetStore.items;
    const pdbBlockedPods = targetPods.filter(pod => this.classifyPdbs(pod, activePdbs).isBlocked);
    const pdbUnknownPods = targetPods.filter(pod => this.classifyPdbs(pod, activePdbs).isUnknown);

    const isDataReady = this.dataStatus === "ready";
    const hasTypedGateMatch = this.typedConfirm.trim() === nodeName;
    const hasEmptyDirConsent = emptyDirPods.length === 0 || this.deleteEmptyDirData;
    const hasUnmanagedConsent = unmanagedPods.length === 0 || this.forceUnmanaged;
    const hasProdConsent = !isProd || this.prodAcknowledged;

    const canSubmit =
      isDataReady &&
      hasTypedGateMatch &&
      hasEmptyDirConsent &&
      hasUnmanagedConsent &&
      hasProdConsent &&
      !this.isDraining;

    return (
      <Dialog
        isOpen={Boolean(node)}
        className="DrainDialog"
        close={this.close}
        data-testid="drain-node-dialog"
      >
        <Wizard
          header={(
            <h5>
              {"Drain Node: "}
              <b style={{ color: "var(--colorAccentBlue, #7196D2)" }}>{nodeName}</b>
            </h5>
          )}
          done={this.close}
        >
          <WizardStep
            contentClass="flex gaps column"
            next={() => this.drainNode(node)}
            nextLabel={this.isDraining ? "Draining..." : "Drain Node"}
            disabledNext={!canSubmit}
            testIdForNext="drain-node-confirm-btn"
          >
            {this.dataStatus === "loading" && (
              <div className="drain-status-banner loading" data-testid="drain-loading-banner">
                <Icon
                  material="autorenew"
                  className="rotating"
                  style={{ marginRight: 8 }} />
                <span>Loading cluster workloads and PodDisruptionBudgets across all namespaces...</span>
              </div>
            )}

            {this.dataStatus === "error" && (
              <div className="drain-hazard-banner" data-testid="drain-error-banner">
                <Icon material="error" className="hazard-icon" />
                <div>
                  <strong>INCOMPLETE DATA SAFEGUARD: DRAIN BLOCKED</strong>
                  <div>
                    {this.storeLoadError || "Failed to load complete workload or PDB data (RBAC 403 Forbidden, timeout, or store failure). Drain is strictly blocked to prevent unmonitored disruption."}
                  </div>
                </div>
              </div>
            )}

            {this.dataStatus === "ready" && (
              <div className="drain-status-badge ready" data-testid="drain-ready-badge">
                <Icon material="check_circle" style={{ marginRight: 6, color: "var(--colorTurquoise, #4FAFB0)" }} />
                <span>Workload and PDB pre-flight verified across all namespaces.</span>
              </div>
            )}

            {isProd && (
              <div className="drain-hazard-banner" data-testid="drain-prod-hazard-banner">
                <Icon material="warning" className="hazard-icon" />
                <div>
                  <strong>PRODUCTION CLUSTER SAFEGUARD:</strong>
                  <div>
                    Draining this node will evict all active workloads in a live production environment.
                    Verify that replica capacity exists on alternate nodes.
                  </div>
                </div>
              </div>
            )}

            {isSingleNode && (
              <div className="drain-hazard-banner" data-testid="drain-single-node-warning">
                <Icon material="error" className="hazard-icon" />
                <div>
                  <strong>TOTAL OUTAGE WARNING: SINGLE-NODE CLUSTER DETECTED</strong>
                  <div>
                    There are no other schedulable nodes in this cluster. Draining this node will evict workloads
                    with nowhere else to schedule, causing complete cluster downtime!
                  </div>
                </div>
              </div>
            )}

            <div className="drain-summary-box">
              <div className="summary-grid">
                <div className="summary-item">
                  <span className="label">Total Pods on Node:</span>
                  <span className="value">{allPodsOnNode.length}</span>
                </div>
                <div className="summary-item">
                  <span className="label">Workloads to Evict:</span>
                  <span className="value">{targetPods.length}</span>
                </div>
                <div className="summary-item">
                  <span className="label">DaemonSet Pods (Skip):</span>
                  <span className="value" data-testid="summary-daemonset-count">{daemonSetPods.length}</span>
                </div>
                <div className="summary-item">
                  <span className="label">Pods with emptyDir Storage:</span>
                  <span className="value" style={{ color: emptyDirPods.length > 0 ? "#f59e0b" : undefined }}>
                    {emptyDirPods.length}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="label">Unmanaged (Orphan) Pods:</span>
                  <span className="value" style={{ color: unmanagedPods.length > 0 ? "#f59e0b" : undefined }}>
                    {unmanagedPods.length}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="label">PDB 0-Allowed Pods:</span>
                  <span className="value" style={{ color: pdbBlockedPods.length > 0 ? "#ef4444" : undefined }}>
                    {pdbBlockedPods.length}
                  </span>
                </div>
                {pdbUnknownPods.length > 0 && (
                  <div className="summary-item">
                    <span className="label">PDB Unknown / Pending:</span>
                    <span className="value" style={{ color: "#f59e0b" }}>
                      {pdbUnknownPods.length}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {pdbBlockedPods.length > 0 && (
              <div className="drain-warning-box" data-testid="drain-pdb-blocked-alert">
                <Icon material="info" style={{ marginRight: 6, verticalAlign: "middle" }} />
                <span>
                  <strong>PDB Disruption Alert:</strong> 
                  {" "}
                  {pdbBlockedPods.length}
                  {" "}
                  pod(s) on this node currently have 0 disruptions allowed by their PodDisruptionBudget. Standard eviction will be rejected with HTTP 429 until healthy budget is restored.
                </span>
              </div>
            )}

            {pdbUnknownPods.length > 0 && (
              <div className="drain-warning-box" data-testid="drain-pdb-unknown-alert">
                <Icon material="help_outline" style={{ marginRight: 6, verticalAlign: "middle" }} />
                <span>
                  <strong>PDB Status Alert:</strong> 
                  {" "}
                  {pdbUnknownPods.length}
                  {" "}
                  pod(s) match PodDisruptionBudgets with pending or uncalculated status. Feasibility will be determined at eviction time by the Kubernetes Eviction API.
                </span>
              </div>
            )}

            <div className="drain-options">
              {emptyDirPods.length > 0 && (
                <Checkbox
                  label={`Allow deletion of ${emptyDirPods.length} pod(s) with local emptyDir storage (data will be deleted)`}
                  value={this.deleteEmptyDirData}
                  onChange={value => (this.deleteEmptyDirData = value)}
                  data-testid="drain-emptydir-checkbox"
                  disabled={this.isDraining}
                />
              )}

              {unmanagedPods.length > 0 && (
                <Checkbox
                  label={`Acknowledge deletion of ${unmanagedPods.length} unmanaged/orphan pod(s) (will not be rescheduled)`}
                  value={this.forceUnmanaged}
                  onChange={value => (this.forceUnmanaged = value)}
                  data-testid="drain-unmanaged-checkbox"
                  disabled={this.isDraining}
                />
              )}

              {isProd && (
                <Checkbox
                  label="I explicitly acknowledge the production impact and confirm node drain"
                  value={this.prodAcknowledged}
                  onChange={value => (this.prodAcknowledged = value)}
                  data-testid="drain-prod-ack-checkbox"
                  disabled={this.isDraining}
                />
              )}
            </div>

            <div className="drain-typing-gate">
              <label htmlFor="drain-confirm-input">
                To confirm this operation, type the node name 
                {" "}
                <b>{nodeName}</b>
                :
              </label>
              <Input
                id="drain-confirm-input"
                theme="round-black"
                placeholder={nodeName}
                value={this.typedConfirm}
                onChange={value => (this.typedConfirm = value)}
                disabled={this.isDraining}
                data-testid="drain-node-typing-gate-input"
              />
            </div>

            {this.isDraining && (
              <div className="drain-progress-status">
                <Icon
                  material="autorenew"
                  className="rotating"
                  style={{ marginRight: 8 }} />
                <span>{this.drainProgress}</span>
              </div>
            )}

            {this.drainError && (
              <div className="drain-error-status">
                <Icon material="error" style={{ marginRight: 8 }} />
                <span>{this.drainError}</span>
              </div>
            )}
          </WizardStep>
        </Wizard>
      </Dialog>
    );
  }
}

export const DrainNodeDialog = withInjectables<Dependencies, DrainNodeDialogProps>(NonInjectedDrainNodeDialog, {
  getProps: (di, props) => ({
    ...props,
    nodeApi: di.inject(nodeApiInjectable),
    podApi: di.inject(podApiInjectable),
    nodeStore: di.inject(nodeStoreInjectable),
    podStore: di.inject(podStoreInjectable),
    podDisruptionBudgetStore: di.inject(podDisruptionBudgetStoreInjectable),
    podDisruptionBudgetApi: di.inject(podDisruptionBudgetApiInjectable),
    state: di.inject(drainNodeDialogStateInjectable),
    isProduction: di.inject(isProductionClusterInjectable),
    cluster: di.inject(hostedClusterInjectable),
    showCheckedErrorNotification: di.inject(showCheckedErrorNotificationInjectable),
    showSuccessNotification: di.inject(showSuccessNotificationInjectable),
    subscribeStores: di.inject(subscribeStoresInjectable),
    loadPodsFromAllNamespaces: di.inject(loadPodsFromAllNamespacesInjectable),
    loadPdbsFromAllNamespaces: di.inject(loadPdbsFromAllNamespacesInjectable),
  }),
});
