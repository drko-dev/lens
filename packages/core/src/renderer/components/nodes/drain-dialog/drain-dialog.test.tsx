/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent, act, waitFor } from "@testing-library/react";
import { computed, observable } from "mobx";
import type { Node, Pod, PodDisruptionBudget } from "@openlens/kube-object";
import type { DiContainer } from "@ogre-tools/injectable";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";
import nodeApiInjectable from "../../../../common/k8s-api/endpoints/node.api.injectable";
import podApiInjectable from "../../../../common/k8s-api/endpoints/pod.api.injectable";
import nodeStoreInjectable from "../store.injectable";
import podStoreInjectable from "../../workloads-pods/store.injectable";
import podDisruptionBudgetStoreInjectable from "../../config-pod-disruption-budgets/store.injectable";
import podDisruptionBudgetApiInjectable from "../../../../common/k8s-api/endpoints/pod-disruption-budget.api.injectable";
import drainNodeDialogStateInjectable from "./state.injectable";
import isProductionClusterInjectable from "../../kube-object-menu/is-production-cluster.injectable";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import showCheckedErrorNotificationInjectable from "../../notifications/show-checked-error.injectable";
import showSuccessNotificationInjectable from "../../notifications/show-success-notification.injectable";
import subscribeStoresInjectable from "../../../kube-watch-api/subscribe-stores.injectable";
import loadPodsFromAllNamespacesInjectable from "../../workloads-pods/load-pods-from-all-namespaces.injectable";
import loadPdbsFromAllNamespacesInjectable from "./load-pdbs-from-all-namespaces.injectable";
import { DrainNodeDialog, matchesSelector } from "./drain-dialog";
import { ClusterDataLoadError } from "../../../utils/cluster-data-load-error";

describe("DrainNodeDialog Hardening", () => {
  let di: DiContainer;
  let mockNodeApi: { cordon: jest.Mock; uncordon: jest.Mock; get: jest.Mock };
  let mockPodApi: { evict: jest.Mock; list: jest.Mock };
  let mockPdbApi: { list: jest.Mock };
  let mockShowSuccess: jest.Mock;
  let mockShowCheckedError: jest.Mock;
  let isProdValue: boolean;
  let nodesList: Node[];
  let podsList: Pod[];
  let pdbsList: PodDisruptionBudget[];
  let dialogState: ReturnType<typeof drainNodeDialogStateInjectable.instantiate>;
  let hostedClusterRef: { id: string };
  let podStoreState: { isLoaded: boolean; isLoading: boolean; failedLoading: boolean };
  let pdbStoreState: { isLoaded: boolean; isLoading: boolean; failedLoading: boolean };

  const createMockNode = (name: string) =>
    ({
      kind: "Node",
      apiVersion: "v1",
      getName: () => name,
      isUnschedulable: () => false,
    } as unknown as Node);

  const createMockPod = (
    name: string,
    namespace = "default",
    isDaemonSet = false,
    hasEmptyDir = false,
    isUnmanaged = false,
    labels: Record<string, string> = { app: "web" },
    nodeName = "node-1",
  ) =>
    ({
      kind: "Pod",
      apiVersion: "v1",
      getName: () => name,
      getNs: () => namespace,
      getId: () => `uid-${name}`,
      metadata: { uid: `uid-${name}`, labels },
      getNodeName: () => nodeName,
      getOwnerRefs: () =>
        isUnmanaged
          ? []
          : isDaemonSet
            ? [{ kind: "DaemonSet", name: "fluentd", apiVersion: "apps/v1", uid: "ds-1" }]
            : [{ kind: "ReplicaSet", name: "web-rs", apiVersion: "apps/v1", uid: "rs-1" }],
      spec: {
        nodeName,
        volumes: hasEmptyDir ? [{ name: "cache", emptyDir: {}}] : [],
      },
    } as unknown as Pod);

  const createMockPdb = (
    name: string,
    namespace: string,
    selector: any,
    disruptionsAllowed?: number,
  ) =>
    ({
      kind: "PodDisruptionBudget",
      apiVersion: "policy/v1",
      getName: () => name,
      getNs: () => namespace,
      spec: {
        selector,
      },
      status: disruptionsAllowed !== undefined ? { disruptionsAllowed } : undefined,
    } as unknown as PodDisruptionBudget);

  beforeEach(() => {
    isProdValue = false;
    nodesList = [createMockNode("node-1"), createMockNode("node-2")];
    podsList = [];
    pdbsList = [];
    hostedClusterRef = { id: "test-cluster" };
    podStoreState = { isLoaded: true, isLoading: false, failedLoading: false };
    pdbStoreState = { isLoaded: true, isLoading: false, failedLoading: false };

    mockNodeApi = {
      cordon: jest.fn().mockResolvedValue({}),
      uncordon: jest.fn().mockResolvedValue({}),
      get: jest.fn().mockImplementation(async ({ name }) => nodesList.find(n => n.getName() === name) || null),
    };

    mockPodApi = {
      evict: jest.fn().mockResolvedValue("evicted"),
      // Honour the server-side node field selector so "pod moved to another node" is realistic.
      list: jest.fn().mockImplementation(async (_query?: unknown, options?: { fieldSelector?: string }) => {
        const match = /^spec\.nodeName=(.+)$/.exec(options?.fieldSelector ?? "");

        if (!match) {
          return podsList;
        }

        return podsList.filter(pod => {
          try {
            return pod.getNodeName?.() === match[1] || pod.spec?.nodeName === match[1];
          } catch {
            return false;
          }
        });
      }),
    };

    mockPdbApi = {
      list: jest.fn().mockImplementation(async () => pdbsList),
    };

    mockShowSuccess = jest.fn();
    mockShowCheckedError = jest.fn();

    dialogState = observable.box<Node | undefined>(undefined);

    di = getDiForUnitTesting();

    di.override(nodeApiInjectable, () => mockNodeApi as any);
    di.override(podApiInjectable, () => mockPodApi as any);
    di.override(podDisruptionBudgetApiInjectable, () => mockPdbApi as any);
    di.override(drainNodeDialogStateInjectable, () => dialogState);
    di.override(isProductionClusterInjectable, () => computed(() => isProdValue));
    di.override(hostedClusterInjectable, () => hostedClusterRef as any);
    di.override(showSuccessNotificationInjectable, () => mockShowSuccess);
    di.override(showCheckedErrorNotificationInjectable, () => mockShowCheckedError);

    di.override(nodeStoreInjectable, () => ({
      items: nodesList,
    } as any));

    di.override(podStoreInjectable, () => ({
      get items() { return podsList; },
      get isLoaded() { return podStoreState.isLoaded; },
      get isLoading() { return podStoreState.isLoading; },
      get failedLoading() { return podStoreState.failedLoading; },
      getPodsByNode: () => podsList,
      loadAll: jest.fn().mockResolvedValue([]),
    } as any));

    di.override(podDisruptionBudgetStoreInjectable, () => ({
      get items() { return pdbsList; },
      get isLoaded() { return pdbStoreState.isLoaded; },
      get isLoading() { return pdbStoreState.isLoading; },
      get failedLoading() { return pdbStoreState.failedLoading; },
      loadAll: jest.fn().mockResolvedValue([]),
    } as any));

    di.override(subscribeStoresInjectable, () => () => () => {});
    di.override(loadPodsFromAllNamespacesInjectable, () => jest.fn());
    di.override(loadPdbsFromAllNamespacesInjectable, () => jest.fn());
  });

  const renderComponent = (props: { pollIntervalMs?: number; evictionTimeoutMs?: number } = {}) => {
    return renderFor(di)(<DrainNodeDialog pollIntervalMs={props.pollIntervalMs ?? 5} evictionTimeoutMs={props.evictionTimeoutMs ?? 50} />);
  };

  const waitForReady = async (getByTestId: (id: string) => HTMLElement) => {
    await waitFor(() => {
      expect(getByTestId("drain-ready-badge")).toBeInTheDocument();
    });
  };

  describe("Selector Matching: matchLabels and matchExpressions", () => {
    it("matches label when selector has matchLabels", () => {
      expect(matchesSelector({ matchLabels: { app: "web" }}, { app: "web", env: "prod" })).toBe(true);
      expect(matchesSelector({ matchLabels: { app: "web" }}, { app: "api" })).toBe(false);
    });

    it("evaluates matchExpressions operator 'In'", () => {
      const selector = {
        matchExpressions: [{ key: "tier", operator: "In", values: ["frontend", "ui"] }],
      };

      expect(matchesSelector(selector, { tier: "frontend" })).toBe(true);
      expect(matchesSelector(selector, { tier: "backend" })).toBe(false);
      expect(matchesSelector(selector, {})).toBe(false);
    });

    it("evaluates matchExpressions operator 'NotIn'", () => {
      const selector = {
        matchExpressions: [{ key: "env", operator: "NotIn", values: ["test", "dev"] }],
      };

      expect(matchesSelector(selector, { env: "prod" })).toBe(true);
      expect(matchesSelector(selector, { env: "test" })).toBe(false);
      expect(matchesSelector(selector, {})).toBe(true);
    });

    it("evaluates matchExpressions operator 'Exists'", () => {
      const selector = {
        matchExpressions: [{ key: "critical", operator: "Exists" }],
      };

      expect(matchesSelector(selector, { critical: "true" })).toBe(true);
      expect(matchesSelector(selector, { other: "val" })).toBe(false);
    });

    it("evaluates matchExpressions operator 'DoesNotExist'", () => {
      const selector = {
        matchExpressions: [{ key: "deprecated", operator: "DoesNotExist" }],
      };

      expect(matchesSelector(selector, { app: "web" })).toBe(true);
      expect(matchesSelector(selector, { deprecated: "true" })).toBe(false);
    });
  });

  describe("Incomplete Data Safeguards", () => {
    it("blocks drain and displays loading banner when podStore is not loaded", () => {
      podStoreState.isLoaded = false;
      podStoreState.isLoading = true;

      act(() => {
        dialogState.set(nodesList[0]);
      });

      const { getByTestId } = renderComponent();

      expect(getByTestId("drain-loading-banner")).toBeInTheDocument();
      expect(getByTestId("drain-node-confirm-btn")).toBeDisabled();

      // Even typing name does not enable submit
      const input = getByTestId("drain-node-typing-gate-input");

      fireEvent.change(input, { target: { value: "node-1" }});
      expect(getByTestId("drain-node-confirm-btn")).toBeDisabled();
    });

    it("blocks drain and displays error banner when podStore fails loading (RBAC 403 Forbidden)", () => {
      podStoreState.failedLoading = true;

      act(() => {
        dialogState.set(nodesList[0]);
      });

      const { getByTestId } = renderComponent();

      expect(getByTestId("drain-error-banner")).toBeInTheDocument();
      expect(getByTestId("drain-node-confirm-btn")).toBeDisabled();
    });

    it("blocks drain and displays error banner when PDB store fails loading", () => {
      pdbStoreState.failedLoading = true;

      act(() => {
        dialogState.set(nodesList[0]);
      });

      const { getByTestId } = renderComponent();

      expect(getByTestId("drain-error-banner")).toBeInTheDocument();
      expect(getByTestId("drain-node-confirm-btn")).toBeDisabled();
    });
  });

  describe("DaemonSets Absolute Exclusion", () => {
    it("permanently skips DaemonSets and does not offer an opt-in deletion checkbox", () => {
      const targetNode = nodesList[0];

      podsList = [
        createMockPod("pod-app-1"),
        createMockPod("pod-ds-1", "kube-system", true),
      ];

      act(() => {
        dialogState.set(targetNode);
      });

      const { getByTestId, queryByTestId, getByText } = renderComponent();

      expect(getByTestId("summary-daemonset-count").textContent).toBe("1");
      expect(getByText("Workloads to Evict:").nextSibling?.textContent).toBe("1");
      // The old toggle to include DaemonSets must be completely gone
      expect(queryByTestId("drain-ignore-daemonsets-checkbox")).toBeNull();
    });
  });

  describe("PodDisruptionBudget Disruption States", () => {
    it("flags PDB-blocked pods when disruptionsAllowed is 0", () => {
      const targetNode = nodesList[0];

      podsList = [createMockPod("api-pod-1", "default", false, false, false, { tier: "api" })];
      pdbsList = [createMockPdb("api-pdb", "default", { matchLabels: { tier: "api" }}, 0)];

      act(() => {
        dialogState.set(targetNode);
      });

      const { getByTestId } = renderComponent();

      expect(getByTestId("drain-pdb-blocked-alert")).toBeInTheDocument();
    });

    it("distinguishes unknown/pending PDB status without assuming allowed", () => {
      const targetNode = nodesList[0];

      podsList = [createMockPod("db-pod-1", "default", false, false, false, { tier: "db" })];
      // PDB with no disruptionsAllowed reported yet
      pdbsList = [createMockPdb("db-pdb", "default", { matchLabels: { tier: "db" }}, undefined)];

      act(() => {
        dialogState.set(targetNode);
      });

      const { getByTestId } = renderComponent();

      expect(getByTestId("drain-pdb-unknown-alert")).toBeInTheDocument();
    });
  });

  describe("Pre-flight Revalidation & Execution Hardening", () => {
    it("aborts drain if cluster context changed between dialog open and execution", async () => {
      const targetNode = nodesList[0];

      podsList = [createMockPod("pod-1")];

      act(() => {
        dialogState.set(targetNode);
      });

      const { getByTestId, getByText } = renderComponent();
      const input = getByTestId("drain-node-typing-gate-input");
      const confirmBtn = getByTestId("drain-node-confirm-btn");

      await waitForReady(getByTestId);
      fireEvent.change(input, { target: { value: "node-1" }});

      // Simulate switching cluster
      hostedClusterRef.id = "other-cluster";

      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockNodeApi.cordon).not.toHaveBeenCalled();
        expect(mockPodApi.evict).not.toHaveBeenCalled();
        expect(getByText(/Cluster context changed/)).toBeInTheDocument();
      });
    });

    it("aborts drain if target node no longer exists in cluster", async () => {
      const targetNode = nodesList[0];

      podsList = [createMockPod("pod-1")];
      mockNodeApi.get.mockResolvedValueOnce(null); // Node deleted

      act(() => {
        dialogState.set(targetNode);
      });

      const { getByTestId, getByText } = renderComponent();
      const input = getByTestId("drain-node-typing-gate-input");
      const confirmBtn = getByTestId("drain-node-confirm-btn");

      await waitForReady(getByTestId);
      fireEvent.change(input, { target: { value: "node-1" }});
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockNodeApi.cordon).not.toHaveBeenCalled();
        expect(mockPodApi.evict).not.toHaveBeenCalled();
        expect(getByText(/no longer exists in cluster/)).toBeInTheDocument();
      });
    });

    it("aborts drain if new unconsented workload with emptyDir appeared right before execution", async () => {
      const targetNode = nodesList[0];

      podsList = [createMockPod("pod-initial")];

      act(() => {
        dialogState.set(targetNode);
      });

      const { getByTestId, getByText } = renderComponent();
      const input = getByTestId("drain-node-typing-gate-input");
      const confirmBtn = getByTestId("drain-node-confirm-btn");

      await waitForReady(getByTestId);
      fireEvent.change(input, { target: { value: "node-1" }});

      // Simulate new pod with emptyDir appearing on node
      mockPodApi.list.mockResolvedValueOnce([
        createMockPod("pod-initial"),
        createMockPod("pod-surprise-empty-dir", "default", false, true, false),
      ]);

      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockNodeApi.cordon).not.toHaveBeenCalled();
        expect(getByText(/Explicit deletion consent required|scheduled since pre-flight/)).toBeInTheDocument();
      });
    });

    it("executes safe drain with polling until pod leaves node, verifying completion", async () => {
      const targetNode = nodesList[0];
      const normalPod = createMockPod("web-pod-1");
      const dsPod = createMockPod("fluentd-ds", "kube-system", true);

      podsList = [normalPod, dsPod];

      act(() => {
        dialogState.set(targetNode);
      });

      const { getByTestId } = renderComponent({ pollIntervalMs: 5, evictionTimeoutMs: 100 });
      const input = getByTestId("drain-node-typing-gate-input");
      const confirmBtn = getByTestId("drain-node-confirm-btn");

      await waitForReady(getByTestId);
      fireEvent.change(input, { target: { value: "node-1" }});

      // When evict is called, simulate workload terminating and leaving node
      mockPodApi.evict.mockImplementation(async () => {
        podsList = [dsPod]; // Only dsPod remains on node
      });

      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockNodeApi.cordon).toHaveBeenCalledWith({ name: "node-1" });
        expect(mockPodApi.evict).toHaveBeenCalledTimes(1);
        expect(mockPodApi.evict).toHaveBeenCalledWith({
          name: "web-pod-1",
          namespace: "default",
        });
        expect(mockShowSuccess).toHaveBeenCalledWith(
          expect.stringContaining("drained and verified: all workloads terminated/rescheduled"),
        );
      });
    });

    it("marks node remaining cordoned when eviction fails without force deleting or auto-uncordoning", async () => {
      const targetNode = nodesList[0];

      podsList = [createMockPod("pod-fail-1")];
      mockPodApi.evict.mockRejectedValueOnce("Cannot evict pod: 429 Too Many Requests");

      act(() => {
        dialogState.set(targetNode);
      });

      const { getByTestId, getByText } = renderComponent();
      const input = getByTestId("drain-node-typing-gate-input");
      const confirmBtn = getByTestId("drain-node-confirm-btn");

      await waitForReady(getByTestId);
      fireEvent.change(input, { target: { value: "node-1" }});
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockNodeApi.cordon).toHaveBeenCalledWith({ name: "node-1" });
        expect(mockPodApi.evict).toHaveBeenCalledWith({ name: "pod-fail-1", namespace: "default" });
        expect(mockNodeApi.uncordon).not.toHaveBeenCalled(); // NEVER auto-uncordon
        expect(getByText(/Drain interrupted: Cannot evict pod: 429 Too Many Requests/)).toBeInTheDocument();
        expect(getByText(/Node node-1 remains cordoned/)).toBeInTheDocument();
      });
    });

    it("reports timeout if evictable pod does not terminate within timeout window", async () => {
      const targetNode = nodesList[0];

      podsList = [createMockPod("stubborn-pod-1")];

      act(() => {
        dialogState.set(targetNode);
      });

      const { getByTestId, getByText } = renderComponent({ pollIntervalMs: 5, evictionTimeoutMs: 25 });
      const input = getByTestId("drain-node-typing-gate-input");
      const confirmBtn = getByTestId("drain-node-confirm-btn");

      await waitForReady(getByTestId);
      fireEvent.change(input, { target: { value: "node-1" }});

      // Pod never leaves node
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockNodeApi.cordon).toHaveBeenCalledWith({ name: "node-1" });
        expect(mockPodApi.evict).toHaveBeenCalled();
        expect(mockNodeApi.uncordon).not.toHaveBeenCalled();
        expect(getByText(/Drain timed out waiting for pods to terminate/)).toBeInTheDocument();
        expect(getByText(/remains cordoned/)).toBeInTheDocument();
      });
    });

    it("reports partial drain if some pods terminate but others remain on timeout", async () => {
      const targetNode = nodesList[0];
      const pod1 = createMockPod("fast-pod");
      const pod2 = createMockPod("slow-pod");

      podsList = [pod1, pod2];

      act(() => {
        dialogState.set(targetNode);
      });

      const { getByTestId, getByText } = renderComponent({ pollIntervalMs: 5, evictionTimeoutMs: 30 });
      const input = getByTestId("drain-node-typing-gate-input");
      const confirmBtn = getByTestId("drain-node-confirm-btn");

      await waitForReady(getByTestId);
      fireEvent.change(input, { target: { value: "node-1" }});

      // Simulate only pod1 leaving
      mockPodApi.evict.mockImplementation(async ({ name }) => {
        if (name === "fast-pod") {
          podsList = [pod2];
        }
      });

      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockNodeApi.cordon).toHaveBeenCalledWith({ name: "node-1" });
        expect(mockNodeApi.uncordon).not.toHaveBeenCalled();
        expect(getByText(/Drain partially completed: 1 of 2 pod\(s\) did not terminate/)).toBeInTheDocument();
        expect(getByText(/remains cordoned/)).toBeInTheDocument();
      });
    });
  });

  describe("Cluster-wide load completeness", () => {
    it("does not enable Drain until every required query has reported completion", async () => {
      let resolvePods: (value?: Pod[] | undefined) => void = () => {};
      const podsLoad = new Promise<Pod[] | undefined>(resolve => {
        resolvePods = resolve;
      });

      di.override(loadPodsFromAllNamespacesInjectable, () => jest.fn(() => podsLoad));
      di.override(loadPdbsFromAllNamespacesInjectable, () => jest.fn().mockResolvedValue([]));

      act(() => {
        dialogState.set(nodesList[0]);
      });

      const { getByTestId } = renderComponent();

      expect(getByTestId("drain-loading-banner")).toBeInTheDocument();
      expect(getByTestId("drain-node-confirm-btn")).toBeDisabled();

      await act(async () => {
        resolvePods(undefined);
      });

      await waitForReady(getByTestId);
    });

    it("blocks Drain when a required loader reports a partial namespace failure", async () => {
      di.override(loadPodsFromAllNamespacesInjectable, () => jest.fn().mockRejectedValue(
        new ClusterDataLoadError("Pods", { partial: true, errors: ["namespace finance: 403"] }),
      ));
      di.override(loadPdbsFromAllNamespacesInjectable, () => jest.fn().mockResolvedValue([]));

      act(() => {
        dialogState.set(nodesList[0]);
      });

      const { getByTestId, getByText } = renderComponent();

      await waitFor(() => {
        expect(getByTestId("drain-error-banner")).toBeInTheDocument();
      });

      expect(getByText(/partial namespace load failure/i)).toBeInTheDocument();
      expect(getByTestId("drain-node-confirm-btn")).toBeDisabled();
    });

    it("blocks Drain when a required loader rejects without a complete dataset", async () => {
      di.override(loadPdbsFromAllNamespacesInjectable, () => jest.fn().mockRejectedValue(
        new ClusterDataLoadError("PodDisruptionBudgets", { partial: false, errors: ["429"] }),
      ));

      act(() => {
        dialogState.set(nodesList[0]);
      });

      const { getByTestId } = renderComponent();

      await waitFor(() => {
        expect(getByTestId("drain-error-banner")).toBeInTheDocument();
      });

      expect(getByTestId("drain-node-confirm-btn")).toBeDisabled();
    });
  });

  describe("Fresh pod query ownership (no stale fallback)", () => {
    it("cordinates a node with a fresh empty pod list and does not fall back to stale pre-flight pods", async () => {
      podsList = [];

      act(() => {
        dialogState.set(nodesList[0]);
      });

      const { getByTestId } = renderComponent();
      const input = getByTestId("drain-node-typing-gate-input");
      const confirmBtn = getByTestId("drain-node-confirm-btn");

      await waitForReady(getByTestId);
      fireEvent.change(input, { target: { value: "node-1" }});
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockNodeApi.cordon).toHaveBeenCalledWith({ name: "node-1" });
        expect(mockPodApi.evict).not.toHaveBeenCalled();
        expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining("no evictable workloads present"));
      });
    });

    it("never evicts a pod that was deleted between preview and execution", async () => {
      const pod = createMockPod("deleted-pod");

      podsList = [pod];

      act(() => {
        dialogState.set(nodesList[0]);
      });

      const { getByTestId } = renderComponent();
      const input = getByTestId("drain-node-typing-gate-input");
      const confirmBtn = getByTestId("drain-node-confirm-btn");

      await waitForReady(getByTestId);

      // The fresh query (not the captured preview) shows the pod is gone.
      podsList = [];
      fireEvent.change(input, { target: { value: "node-1" }});
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockNodeApi.cordon).toHaveBeenCalledWith({ name: "node-1" });
        expect(mockPodApi.evict).not.toHaveBeenCalledWith({ name: "deleted-pod", namespace: "default" });
      });
    });

    it("never evicts a pod that migrated to another node between preview and execution", async () => {
      podsList = [createMockPod("migrated-pod", "default", false, false, false, { app: "web" }, "node-1")];

      act(() => {
        dialogState.set(nodesList[0]);
      });

      const { getByTestId } = renderComponent();
      const input = getByTestId("drain-node-typing-gate-input");
      const confirmBtn = getByTestId("drain-node-confirm-btn");

      await waitForReady(getByTestId);

      // The pod still exists, but now runs on node-2. The fresh fieldSelector for node-1 omits it.
      podsList = [createMockPod("migrated-pod", "default", false, false, false, { app: "web" }, "node-2")];
      fireEvent.change(input, { target: { value: "node-1" }});
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockNodeApi.cordon).toHaveBeenCalledWith({ name: "node-1" });
        expect(mockPodApi.evict).not.toHaveBeenCalled();
        expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining("no evictable workloads present"));
      });
    });

    it("aborts before Cordon when the fresh pod query fails", async () => {
      podsList = [createMockPod("existing-pod")];

      act(() => {
        dialogState.set(nodesList[0]);
      });

      const { getByTestId, getByText } = renderComponent();
      const input = getByTestId("drain-node-typing-gate-input");
      const confirmBtn = getByTestId("drain-node-confirm-btn");

      await waitForReady(getByTestId);

      mockPodApi.list.mockRejectedValue(new Error("403 Forbidden listing pods"));
      fireEvent.change(input, { target: { value: "node-1" }});
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockNodeApi.cordon).not.toHaveBeenCalled();
        expect(mockPodApi.evict).not.toHaveBeenCalled();
        expect(getByText(/Failed to query fresh pod workloads/)).toBeInTheDocument();
      });
    });
  });

  describe("PDB revalidation before Cordon", () => {
    const pdbPod = () => createMockPod("pdb-pod", "default", false, false, false, { app: "web" });

    it("aborts before Cordon when the PDB revalidation query fails", async () => {
      podsList = [pdbPod()];
      pdbsList = [createMockPdb("frontend-pdb", "default", { matchLabels: { app: "web" }}, 1)];

      act(() => {
        dialogState.set(nodesList[0]);
      });

      const { getByTestId, getByText } = renderComponent();
      const input = getByTestId("drain-node-typing-gate-input");
      const confirmBtn = getByTestId("drain-node-confirm-btn");

      await waitForReady(getByTestId);

      mockPdbApi.list.mockRejectedValue(new Error("403 Forbidden listing PDBs"));
      fireEvent.change(input, { target: { value: "node-1" }});
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockNodeApi.cordon).not.toHaveBeenCalled();
        expect(getByText(/Failed to revalidate PodDisruptionBudgets/)).toBeInTheDocument();
      });
    });

    it("aborts before Cordon when an applicable PDB status budget decreases", async () => {
      podsList = [pdbPod()];
      pdbsList = [createMockPdb("frontend-pdb", "default", { matchLabels: { app: "web" }}, 1)];

      act(() => {
        dialogState.set(nodesList[0]);
      });

      const { getByTestId, getByText } = renderComponent();
      const input = getByTestId("drain-node-typing-gate-input");
      const confirmBtn = getByTestId("drain-node-confirm-btn");

      await waitForReady(getByTestId);

      pdbsList = [createMockPdb("frontend-pdb", "default", { matchLabels: { app: "web" }}, 0)];
      fireEvent.change(input, { target: { value: "node-1" }});
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockNodeApi.cordon).not.toHaveBeenCalled();
        expect(getByText(/disruptionsAllowed decreased from 1 to 0/)).toBeInTheDocument();
        expect(getByText(/Re-confirmation required/)).toBeInTheDocument();
      });
    });

    it("aborts before Cordon when the applicable PDB classification changed since the preview", async () => {
      podsList = [pdbPod()];
      // Unknown at preview (controller has not computed a budget yet).
      pdbsList = [createMockPdb("frontend-pdb", "default", { matchLabels: { app: "web" }})];

      act(() => {
        dialogState.set(nodesList[0]);
      });

      const { getByTestId, getByText } = renderComponent();
      const input = getByTestId("drain-node-typing-gate-input");
      const confirmBtn = getByTestId("drain-node-confirm-btn");

      await waitForReady(getByTestId);

      // It is now reported as allowed: the state the operator saw is no longer current.
      pdbsList = [createMockPdb("frontend-pdb", "default", { matchLabels: { app: "web" }}, 1)];
      fireEvent.change(input, { target: { value: "node-1" }});
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockNodeApi.cordon).not.toHaveBeenCalled();
        expect(getByText(/changed status from unknown to allowed/)).toBeInTheDocument();
      });
    });

    it("aborts before Cordon when PDB rules changed since the preview", async () => {
      podsList = [pdbPod()];
      pdbsList = [createMockPdb("frontend-pdb", "default", { matchLabels: { app: "web" }}, 1)];

      act(() => {
        dialogState.set(nodesList[0]);
      });

      const { getByTestId, getByText } = renderComponent();
      const input = getByTestId("drain-node-typing-gate-input");
      const confirmBtn = getByTestId("drain-node-confirm-btn");

      await waitForReady(getByTestId);

      pdbsList = [{
        ...createMockPdb("frontend-pdb", "default", { matchLabels: { app: "web" }}, 1),
        spec: { minAvailable: 2, selector: { matchLabels: { app: "web" }}},
      } as unknown as PodDisruptionBudget];

      fireEvent.change(input, { target: { value: "node-1" }});
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockNodeApi.cordon).not.toHaveBeenCalled();
        expect(getByText(/rules or selectors modified since pre-flight/)).toBeInTheDocument();
      });
    });

    it("aborts before Cordon when a new PDB now applies to a target pod", async () => {
      podsList = [pdbPod()];
      pdbsList = [];

      act(() => {
        dialogState.set(nodesList[0]);
      });

      const { getByTestId, getByText } = renderComponent();
      const input = getByTestId("drain-node-typing-gate-input");
      const confirmBtn = getByTestId("drain-node-confirm-btn");

      await waitForReady(getByTestId);

      pdbsList = [createMockPdb("late-pdb", "default", { matchLabels: { app: "web" }}, 1)];
      fireEvent.change(input, { target: { value: "node-1" }});
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockNodeApi.cordon).not.toHaveBeenCalled();
        expect(getByText(/New PodDisruptionBudget "late-pdb"/)).toBeInTheDocument();
      });
    });
  });
});
