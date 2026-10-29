/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { screen, fireEvent, waitFor, render as testingLibraryRender } from "@testing-library/react";
import { computed, runInAction } from "mobx";
import { NonInjectedRbacInspector } from "../rbac-inspector";
import type { AccessReviewResult } from "../../../../../common/k8s-api/endpoints/rbac-evaluator";
import { Cluster } from "../../../../../common/cluster/cluster";
import { getDiForUnitTesting } from "../../../../getDiForUnitTesting";
import { renderFor, type DiRender } from "../../../test-utils/renderFor";
import directoryForUserDataInjectable from "../../../../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import directoryForKubeConfigsInjectable from "../../../../../common/app-paths/directory-for-kube-configs/directory-for-kube-configs.injectable";
import storesAndApisCanBeCreatedInjectable from "../../../../stores-apis-can-be-created.injectable";

// Mock SiblingsInTabLayout to keep unit test isolated
jest.mock("../../../layout/siblings-in-tab-layout", () => ({
  SiblingsInTabLayout: ({ children }: any) => <div data-testid="siblings-tab-wrapper">{children}</div>,
}));

describe("RbacInspector Component", () => {
  let render: DiRender;
  let mockAccessReviewClient: {
    reviewAccess: jest.Mock;
  };
  let mockProps: any;

  beforeEach(() => {
    const di = getDiForUnitTesting();

    di.override(directoryForUserDataInjectable, () => "/some-user-store-path");
    di.override(directoryForKubeConfigsInjectable, () => "/some-kube-configs");
    di.override(storesAndApisCanBeCreatedInjectable, () => true);

    render = renderFor(di);

    mockAccessReviewClient = {
      reviewAccess: jest.fn().mockResolvedValue({
        verdict: "ALLOWED_API",
        allowed: true,
        origin: "api-server",
        reason: "Allowed by API server",
        matchingEvidence: [
          {
            bindingName: "mock-binding",
            bindingKind: "RoleBinding",
            bindingNamespace: "default",
            roleRefKind: "Role",
            roleRefName: "mock-role",
            matchedRule: { verbs: ["get"], resources: ["pods"], apiGroups: [""] },
            scopeDescription: "Namespace 'default'",
          },
        ],
        query: {
          identityType: "current-user",
          resourceAttributes: { verb: "get", resource: "pods" },
        },
        timestamp: new Date().toISOString(),
      } as AccessReviewResult),
    };

    mockProps = {
      roleStore: { items: [], isLoaded: true, failedLoading: false },
      clusterRoleStore: { items: [], isLoaded: true, failedLoading: false },
      roleBindingStore: { items: [], isLoaded: true, failedLoading: false },
      clusterRoleBindingStore: { items: [], isLoaded: true, failedLoading: false },
      serviceAccountStore: { items: [] },
      namespaceStore: { items: [{ getName: () => "default" }, { getName: () => "kube-system" }] },
      isProductionCluster: computed(() => false),
      hostedCluster: new Cluster({
        id: "test-cluster-id",
        contextName: "test-dev-cluster",
        kubeConfigPath: "/some-kube-config",
      }),
      subscribeStores: jest.fn(() => jest.fn()),
      accessReviewClient: mockAccessReviewClient,
      observableHistory: { searchParams: "" },
    };
  });

  it("renders header, controls, and query builder", () => {
    render(<NonInjectedRbacInspector {...mockProps} />);

    expect(screen.getByTestId("rbac-inspector-container")).toBeInTheDocument();
    expect(screen.getByText(/RBAC Permission Inspector/i)).toBeInTheDocument();
    expect(screen.getByTestId("identity-type-select")).toBeInTheDocument();
    expect(screen.getByTestId("check-permission-button")).toBeInTheDocument();
    expect(screen.getByTestId("check-matrix-button")).toBeInTheDocument();
  });

  it("displays PRODUCTION warning badge when cluster is marked production", () => {
    mockProps.isProductionCluster = computed(() => true);
    render(<NonInjectedRbacInspector {...mockProps} />);

    expect(screen.getByTestId("prod-warning-badge")).toBeInTheDocument();
    expect(screen.getByText(/PRODUCTION CLUSTER/i)).toBeInTheDocument();
  });

  it("displays store warning banner when RBAC stores failed or are not loaded", () => {
    mockProps.roleStore = { items: [], isLoaded: false, failedLoading: true };
    render(<NonInjectedRbacInspector {...mockProps} />);

    expect(screen.getByTestId("store-warning-banner")).toBeInTheDocument();
    expect(screen.getByText(/Almacén de definiciones RBAC incompleto/i)).toBeInTheDocument();
  });

  it("subscribes to all RBAC stores on mount and releases the subscription on unmount", () => {
    const dispose = jest.fn();

    mockProps.subscribeStores = jest.fn(() => dispose);
    const view = render(<NonInjectedRbacInspector {...mockProps} />);

    expect(mockProps.subscribeStores).toHaveBeenCalledTimes(1);
    expect(mockProps.subscribeStores).toHaveBeenCalledWith([
      mockProps.roleStore,
      mockProps.clusterRoleStore,
      mockProps.roleBindingStore,
      mockProps.clusterRoleBindingStore,
    ]);

    view.unmount();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it.each(["roleStore", "clusterRoleStore", "roleBindingStore", "clusterRoleBindingStore"] as const)(
    "keeps the incomplete warning visible while %s is loading",
    storeName => {
      mockProps[storeName] = { ...mockProps[storeName], isLoaded: false, failedLoading: false };
      render(<NonInjectedRbacInspector {...mockProps} />);

      expect(screen.getByTestId("store-warning-banner")).toBeInTheDocument();
    },
  );

  it("clears the incomplete warning only when all RBAC stores are loaded", () => {
    expect(mockProps.roleStore.isLoaded).toBe(true);
    expect(mockProps.clusterRoleStore.isLoaded).toBe(true);
    expect(mockProps.roleBindingStore.isLoaded).toBe(true);
    expect(mockProps.clusterRoleBindingStore.isLoaded).toBe(true);

    render(<NonInjectedRbacInspector {...mockProps} />);

    expect(screen.queryByTestId("store-warning-banner")).not.toBeInTheDocument();
  });

  it("keeps the incomplete warning visible when an RBAC list fails with 403", () => {
    mockProps.clusterRoleBindingStore = {
      ...mockProps.clusterRoleBindingStore,
      isLoaded: true,
      failedLoading: true,
      lastError: { statusCode: 403, message: "Forbidden" },
    };

    render(<NonInjectedRbacInspector {...mockProps} />);

    expect(screen.getByTestId("store-warning-banner")).toHaveTextContent(/RBAC 403/i);
  });

  it("switches to ServiceAccount mode and displays namespace/name inputs", () => {
    render(<NonInjectedRbacInspector {...mockProps} />);

    const select = screen.getByTestId("identity-type-select");

    fireEvent.change(select, { target: { value: "service-account" }});

    expect(screen.getByTestId("sa-namespace-input")).toBeInTheDocument();
    expect(screen.getByTestId("sa-name-input")).toBeInTheDocument();
  });

  it("runs single check and displays verdict badge and matching evidence", async () => {
    render(<NonInjectedRbacInspector {...mockProps} />);

    const checkBtn = screen.getByTestId("check-permission-button");

    fireEvent.click(checkBtn);

    await waitFor(() => {
      expect(mockAccessReviewClient.reviewAccess).toHaveBeenCalled();
      expect(screen.getByTestId("single-result-box")).toBeInTheDocument();
      expect(screen.getByTestId("verdict-allowed-api")).toBeInTheDocument();
      expect(screen.getByTestId("matching-evidence-item")).toBeInTheDocument();
    });
  });

  it("renders LOCAL_MATCH badge as 'COINCIDENCIA LOCAL — NO VERIFICADA' (never as ALLOWED)", async () => {
    mockAccessReviewClient.reviewAccess.mockResolvedValueOnce({
      verdict: "LOCAL_MATCH",
      allowed: false,
      origin: "local-analysis",
      reason: "Matched locally by cached RoleBinding",
      matchingEvidence: [],
      query: { identityType: "current-user" },
      timestamp: new Date().toISOString(),
    });

    render(<NonInjectedRbacInspector {...mockProps} />);

    fireEvent.click(screen.getByTestId("check-permission-button"));

    await waitFor(() => {
      const badge = screen.getByTestId("verdict-local-match");

      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent("COINCIDENCIA LOCAL — NO VERIFICADA");
    });
  });

  it("runs matrix check and displays permission matrix table", async () => {
    render(<NonInjectedRbacInspector {...mockProps} />);

    const matrixBtn = screen.getByTestId("check-matrix-button");

    fireEvent.click(matrixBtn);

    await waitFor(() => {
      expect(mockAccessReviewClient.reviewAccess).toHaveBeenCalled();
      expect(screen.getByTestId("matrix-results-box")).toBeInTheDocument();
      expect(screen.getByTestId("matrix-row-get")).toBeInTheDocument();
      expect(screen.getByTestId("matrix-row-list")).toBeInTheDocument();
      expect(screen.getByTestId("matrix-row-delete")).toBeInTheDocument();
    });
  });

  it("initializes from searchParams without automatically executing queries (requires operator action)", async () => {
    mockProps.observableHistory = {
      searchParams: "?identity=service-account&namespace=kube-system&serviceAccount=coredns",
    };

    render(<NonInjectedRbacInspector {...mockProps} />);

    // Fields must be pre-filled
    expect(screen.getByTestId("sa-namespace-input")).toHaveValue("kube-system");
    expect(screen.getByTestId("sa-name-input")).toHaveValue("coredns");

    // Critical: NEVER auto-execute without operator conscious action
    expect(mockAccessReviewClient.reviewAccess).not.toHaveBeenCalled();
  });

  it("invalidates and clears previous results when query inputs change", async () => {
    render(<NonInjectedRbacInspector {...mockProps} />);

    fireEvent.click(screen.getByTestId("check-permission-button"));

    await waitFor(() => {
      expect(screen.getByTestId("single-result-box")).toBeInTheDocument();
    });

    // Change target resource input
    const resourceInput = screen.getByTestId("target-resource-input");

    fireEvent.change(resourceInput, { target: { value: "configmaps" }});

    // Results must be invalidated and cleared
    await waitFor(() => {
      expect(screen.queryByTestId("single-result-box")).not.toBeInTheDocument();
    });
  });

  it("prevents async race conditions: discards out-of-order late responses", async () => {
    let resolveFirstQuery: (val: any) => void = () => {};

    mockAccessReviewClient.reviewAccess
      .mockImplementationOnce(() => new Promise(resolve => {
        resolveFirstQuery = resolve;
      }))
      .mockResolvedValueOnce({
        verdict: "DENIED_API",
        allowed: false,
        origin: "api-server",
        reason: "Latest query denied",
        matchingEvidence: [],
        query: { identityType: "current-user" },
        timestamp: new Date().toISOString(),
      });

    let inspectorRef: any = null;

    render(<NonInjectedRbacInspector ref={ref => { inspectorRef = ref; }} {...mockProps} />);

    // Trigger first query (slow)
    inspectorRef.runSingleCheck();

    // Trigger second query (fast)
    inspectorRef.runSingleCheck();

    await waitFor(() => {
      expect(screen.getByTestId("verdict-denied-api")).toBeInTheDocument();
    });

    // Now resolve first query late
    resolveFirstQuery({
      verdict: "ALLOWED_API",
      allowed: true,
      origin: "api-server",
      reason: "Old query resolved late",
      matchingEvidence: [],
      query: { identityType: "current-user" },
      timestamp: new Date().toISOString(),
    });

    // Latest result (DENIED_API) must still remain, NOT overwritten by old response
    await new Promise(r => setTimeout(r, 50));
    expect(screen.getByTestId("verdict-denied-api")).toBeInTheDocument();
    expect(screen.queryByTestId("verdict-allowed-api")).not.toBeInTheDocument();
  });

  it("resets loading and immediately re-enables buttons when an input is edited during a pending query", async () => {
    let resolvePendingQuery: (val: any) => void = () => {};

    mockAccessReviewClient.reviewAccess.mockImplementationOnce(
      () => new Promise(resolve => {
        resolvePendingQuery = resolve;
      }),
    );

    render(<NonInjectedRbacInspector {...mockProps} />);

    const checkBtn = screen.getByTestId("check-permission-button");
    const matrixBtn = screen.getByTestId("check-matrix-button");

    // Click check button to start query
    fireEvent.click(checkBtn);

    // Verify button is in waiting/disabled state
    expect(checkBtn).toBeDisabled();
    expect(matrixBtn).toBeDisabled();

    // User edits an input while the query is in flight
    const resourceInput = screen.getByTestId("target-resource-input");

    fireEvent.change(resourceInput, { target: { value: "configmaps" }});

    // Loading must be reset to false and buttons must be immediately re-enabled
    await waitFor(() => {
      expect(checkBtn).not.toBeDisabled();
      expect(matrixBtn).not.toBeDisabled();
    });

    // Resolve the discarded query
    resolvePendingQuery({
      verdict: "ALLOWED_API",
      allowed: true,
      origin: "api-server",
      reason: "Discarded query finished late",
      matchingEvidence: [],
      query: { identityType: "current-user" },
      timestamp: new Date().toISOString(),
    });

    // The discarded response MUST NOT set singleResult or show any verdict
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByTestId("single-result-box")).not.toBeInTheDocument();
    expect(screen.queryByTestId("verdict-allowed-api")).not.toBeInTheDocument();
  });

  it("displays cluster offline banner and invalidates results when cluster access is lost", async () => {
    const cluster = new Cluster({
      id: "cluster-reactive-1",
      contextName: "reactive-cluster",
      kubeConfigPath: "/some-kube-config",
    });
    const { disconnected: disconnectedBox, accessible: accessibleBox, online: onlineBox } = cluster;

    runInAction(() => {
      disconnectedBox.set(false);
      accessibleBox.set(true);
      onlineBox.set(true);
    });
    mockProps.hostedCluster = cluster;

    render(<NonInjectedRbacInspector {...mockProps} />);

    // Execute check successfully while connected
    fireEvent.click(screen.getByTestId("check-permission-button"));

    await waitFor(() => {
      expect(screen.getByTestId("single-result-box")).toBeInTheDocument();
    });

    // Simulate cluster disconnection in real-time
    disconnectedBox.set(true);
    onlineBox.set(false);

    // Offline banner must appear and existing results must be invalidated/cleared
    await waitFor(() => {
      expect(screen.getByTestId("cluster-offline-banner")).toBeInTheDocument();
      expect(screen.getByText(/Clúster no disponible/i)).toBeInTheDocument();
      expect(screen.queryByTestId("single-result-box")).not.toBeInTheDocument();
    });
  });
});

describe("RbacInspector computed cluster name rendering", () => {
  it("renders the hosted cluster's computed name as text", () => {
    const cluster = new Cluster({
      id: "test-cluster-id",
      contextName: "qa-context",
      kubeConfigPath: "/tmp/qa-kubeconfig",
    });

    const inspector = new NonInjectedRbacInspector({
      roleStore: { items: [], isLoaded: true, failedLoading: false } as any,
      clusterRoleStore: { items: [], isLoaded: true, failedLoading: false } as any,
      roleBindingStore: { items: [], isLoaded: true, failedLoading: false } as any,
      clusterRoleBindingStore: { items: [], isLoaded: true, failedLoading: false } as any,
      serviceAccountStore: { items: [] } as any,
      namespaceStore: { items: [] } as any,
      isProductionCluster: computed(() => false),
      hostedCluster: cluster,
      subscribeStores: jest.fn(() => jest.fn()),
      accessReviewClient: { reviewAccess: jest.fn() } as any,
      observableHistory: { searchParams: "" } as any,
    });
    const findClusterLabel = (node: React.ReactNode): React.ReactElement | undefined => {
      if (!React.isValidElement(node)) {
        return undefined;
      }
      if (node.type === "span" && node.props.style?.marginLeft === 8) {
        return node;
      }
      return React.Children.toArray(node.props.children)
        .map(findClusterLabel)
        .find(Boolean);
    };
    const clusterLabel = findClusterLabel(inspector.render());

    expect(clusterLabel).toBeDefined();
    testingLibraryRender(clusterLabel!);

    expect(screen.getByText("qa-context")).toBeInTheDocument();
  });
});
