/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { act, screen, within } from "@testing-library/react";
import { observable } from "mobx";
import { NetworkPolicy, Pod, Namespace } from "@openlens/kube-object";
import { NetworkPolicyMatrix } from "../matrix/network-policy-matrix";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import type { DiRender } from "../../test-utils/renderFor";
import { renderFor } from "../../test-utils/renderFor";

function createPod(name: string, namespace: string, labels: Record<string, string>, ip: string): Pod {
  return new Pod({
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name,
      namespace,
      uid: `pod-${namespace}-${name}`,
      resourceVersion: "1",
      selfLink: `/api/v1/namespaces/${namespace}/pods/${name}`,
      labels,
    },
    status: {
      phase: "Running",
      conditions: [],
      hostIP: "10.0.0.1",
      startTime: "2026-01-01T00:00:00Z",
      podIP: ip,
    },
    spec: {
      containers: [{ name: "c", image: "img", ports: [{ containerPort: 8080, name: "http" }] }],
    },
  });
}

function createPolicy(name: string, namespace: string, spec: any, resourceVersion = "1"): NetworkPolicy {
  return new NetworkPolicy({
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name,
      namespace,
      uid: `np-${namespace}-${name}`,
      resourceVersion,
      selfLink: `/apis/networking.k8s.io/v1/namespaces/${namespace}/networkpolicies/${name}`,
    },
    spec,
  });
}

function createNamespace(name: string): Namespace {
  return new Namespace({
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
      name,
      uid: `ns-${name}`,
      resourceVersion: "1",
      selfLink: `/api/v1/namespaces/${name}`,
    },
  });
}

/**
 * Observable store double: the very same instance is kept for the whole test while its flags and
 * its collection change, which is exactly how the real ItemStore behaves.
 */
function createObservableStore<T extends object>(initial: T) {
  return observable(initial) as T & { items: any[]; lastError?: unknown };
}

function createCluster(id: string) {
  return {
    id,
    disconnected: observable.box(false),
    online: observable.box(true),
    accessible: observable.box(true),
  };
}

function tableVerdicts() {
  const table = screen.getByRole("table");

  return {
    allowed: within(table).queryAllByText("Permitido por políticas").length,
    denied: within(table).queryAllByText("Bloqueado por política").length,
    indeterminate: within(table).queryAllByText("Indeterminado").length,
  };
}

describe("NetworkPolicyMatrix reactivity (stable observable instances)", () => {
  let render: DiRender;

  beforeEach(() => {
    render = renderFor(getDiForUnitTesting());
  });

  const podFrontend = createPod("frontend", "default", { app: "frontend" }, "10.244.1.5");
  const podBackend = createPod("backend", "default", { app: "backend" }, "10.244.1.6");
  const nsDefault = createNamespace("default");

  const scopedPolicy = createPolicy("scoped-policy", "default", {
    podSelector: { matchLabels: { app: "backend" }},
    policyTypes: ["Ingress"],
    ingress: [
      {
        from: [{ podSelector: { matchLabels: { app: "frontend" }}}],
        ports: [{ port: 8080, protocol: "TCP" }],
      },
    ],
  });

  it("drops the previous verdicts when the cluster becomes disconnected", () => {
    const podStore = createObservableStore({ items: [podFrontend, podBackend], isLoaded: true, isLoading: false, failedLoading: false });
    const namespaceStore = createObservableStore({ items: [nsDefault], isLoaded: true, isLoading: false, failedLoading: false });
    const policyStore = createObservableStore({ items: [scopedPolicy], isLoaded: true, isLoading: false, failedLoading: false });
    const cluster = createCluster("cluster-a");

    render(
      <NetworkPolicyMatrix
        policy={scopedPolicy}
        podStore={podStore as any}
        namespaceStore={namespaceStore as any}
        networkPolicyStore={policyStore as any}
        cluster={cluster}
      />,
    );

    expect(tableVerdicts().allowed).toBeGreaterThan(0);

    act(() => {
      cluster.disconnected.set(true);
    });

    expect(screen.getByText(/Clúster desconectado:/i)).toBeInTheDocument();
    expect(tableVerdicts().allowed).toBe(0);
  });

  it("does not certify permissions from stale data after the connection is lost and recovered", () => {
    const podStore = createObservableStore({ items: [podFrontend, podBackend], isLoaded: true, isLoading: false, failedLoading: false });
    const namespaceStore = createObservableStore({ items: [nsDefault], isLoaded: true, isLoading: false, failedLoading: false });
    const policyStore = createObservableStore({ items: [scopedPolicy], isLoaded: true, isLoading: false, failedLoading: false });
    const cluster = createCluster("cluster-a");

    render(
      <NetworkPolicyMatrix
        policy={scopedPolicy}
        podStore={podStore as any}
        namespaceStore={namespaceStore as any}
        networkPolicyStore={policyStore as any}
        cluster={cluster}
      />,
    );

    expect(tableVerdicts().allowed).toBeGreaterThan(0);

    act(() => {
      cluster.disconnected.set(true);
    });

    expect(tableVerdicts().allowed).toBe(0);

    act(() => {
      cluster.disconnected.set(false);
      cluster.online.set(true);
      cluster.accessible.set(true);
    });

    // The resources still held by the stores are the ones from before the disconnection
    expect(tableVerdicts().allowed).toBe(0);
    expect(screen.getByText(/Estado de datos desconocido:/i)).toBeInTheDocument();

    // Every store must confirm its own reload: a confirmed reload of the NetworkPolicyStore alone
    // does not certify the Pods or the Namespaces.
    act(() => {
      podStore.isLoading = true;
      namespaceStore.isLoading = true;
      policyStore.isLoading = true;
    });

    act(() => {
      podStore.isLoading = false;
      podStore.items = [createPod("frontend", "default", { app: "frontend" }, "10.244.1.5"), createPod("backend", "default", { app: "backend" }, "10.244.1.6")];
      namespaceStore.isLoading = false;
      policyStore.isLoading = false;
      policyStore.items = [scopedPolicy];
    });

    expect(tableVerdicts().allowed).toBeGreaterThan(0);
  });

  it("moves from disconnected to connecting to ready as the cluster comes back", () => {
    const podStore = createObservableStore({ items: [podFrontend, podBackend], isLoaded: true, isLoading: false, failedLoading: false });
    const namespaceStore = createObservableStore({ items: [nsDefault], isLoaded: true, isLoading: false, failedLoading: false });
    const policyStore = createObservableStore({ items: [scopedPolicy], isLoaded: true, isLoading: false, failedLoading: false });
    const cluster = createCluster("cluster-a");

    cluster.disconnected.set(true);

    render(
      <NetworkPolicyMatrix
        policy={scopedPolicy}
        podStore={podStore as any}
        namespaceStore={namespaceStore as any}
        networkPolicyStore={policyStore as any}
        cluster={cluster}
      />,
    );

    expect(screen.getByText(/Clúster desconectado:/i)).toBeInTheDocument();

    act(() => {
      cluster.disconnected.set(false);
      cluster.online.set(false);
    });

    expect(screen.getByText(/Conectando con el clúster:/i)).toBeInTheDocument();
    expect(tableVerdicts().allowed).toBe(0);

    act(() => {
      cluster.online.set(true);
      cluster.accessible.set(true);
      podStore.isLoading = true;
      namespaceStore.isLoading = true;
      policyStore.isLoading = true;
    });

    act(() => {
      podStore.isLoading = false;
      podStore.items = [createPod("frontend", "default", { app: "frontend" }, "10.244.1.5"), createPod("backend", "default", { app: "backend" }, "10.244.1.6")];
      namespaceStore.isLoading = false;
      policyStore.isLoading = false;
      policyStore.items = [scopedPolicy];
    });

    expect(tableVerdicts().allowed).toBeGreaterThan(0);
  });

  it("does not consider a reachable but inaccessible cluster as ready", () => {
    const podStore = createObservableStore({ items: [podFrontend, podBackend], isLoaded: true, isLoading: false, failedLoading: false });
    const namespaceStore = createObservableStore({ items: [nsDefault], isLoaded: true, isLoading: false, failedLoading: false });
    const policyStore = createObservableStore({ items: [scopedPolicy], isLoaded: true, isLoading: false, failedLoading: false });
    const cluster = createCluster("cluster-a");

    render(
      <NetworkPolicyMatrix
        policy={scopedPolicy}
        podStore={podStore as any}
        namespaceStore={namespaceStore as any}
        networkPolicyStore={policyStore as any}
        cluster={cluster}
      />,
    );

    expect(tableVerdicts().allowed).toBeGreaterThan(0);

    act(() => {
      cluster.accessible.set(false);
    });

    expect(screen.getByText(/Clúster inaccesible:/i)).toBeInTheDocument();
    expect(tableVerdicts().allowed).toBe(0);
  });

  it("drops the previous verdicts when a store hits an RBAC 403", () => {
    const podStore = createObservableStore({ items: [podFrontend, podBackend], isLoaded: true, isLoading: false, failedLoading: false });
    const namespaceStore = createObservableStore({ items: [nsDefault], isLoaded: true, isLoading: false, failedLoading: false });
    const policyStore = createObservableStore({ items: [scopedPolicy], isLoaded: true, isLoading: false, failedLoading: false });
    const cluster = createCluster("cluster-a");

    render(
      <NetworkPolicyMatrix
        policy={scopedPolicy}
        podStore={podStore as any}
        namespaceStore={namespaceStore as any}
        networkPolicyStore={policyStore as any}
        cluster={cluster}
      />,
    );

    expect(tableVerdicts().allowed).toBeGreaterThan(0);

    act(() => {
      policyStore.failedLoading = true;
      policyStore.lastError = { statusCode: 403 };
    });

    expect(screen.getByText(/Acceso restringido/i)).toBeInTheDocument();
    expect(tableVerdicts().allowed).toBe(0);
  });

  it("switches from indeterminate to evaluated when a store that never loaded completes its load", () => {
    const podStore = createObservableStore({ items: [podFrontend, podBackend], isLoaded: false, isLoading: false, failedLoading: false });
    const namespaceStore = createObservableStore({ items: [nsDefault], isLoaded: true, isLoading: false, failedLoading: false });
    const policyStore = createObservableStore({ items: [scopedPolicy], isLoaded: true, isLoading: false, failedLoading: false });
    const cluster = createCluster("cluster-a");

    render(
      <NetworkPolicyMatrix
        policy={scopedPolicy}
        podStore={podStore as any}
        namespaceStore={namespaceStore as any}
        networkPolicyStore={policyStore as any}
        cluster={cluster}
      />,
    );

    expect(screen.getByText(/Estado de datos desconocido:/i)).toBeInTheDocument();
    expect(tableVerdicts().allowed).toBe(0);

    act(() => {
      podStore.isLoaded = true;
    });

    expect(tableVerdicts().allowed).toBeGreaterThan(0);
  });

  it("re-evaluates when a policy is updated inside the same store instance", () => {
    // Additive policy without ports: it allows every port towards the backend.
    const openAdditivePolicy = createPolicy("additive-policy", "default", {
      podSelector: { matchLabels: { app: "backend" }},
      policyTypes: ["Ingress"],
      ingress: [{ from: [{ podSelector: { matchLabels: { app: "frontend" }}}] }],
    });

    const podStore = createObservableStore({ items: [podFrontend, podBackend], isLoaded: true, isLoading: false, failedLoading: false });
    const namespaceStore = createObservableStore({ items: [nsDefault], isLoaded: true, isLoading: false, failedLoading: false });
    const policyStore = createObservableStore({ items: [scopedPolicy, openAdditivePolicy], isLoaded: true, isLoading: false, failedLoading: false });
    const cluster = createCluster("cluster-a");

    render(
      <NetworkPolicyMatrix
        policy={scopedPolicy}
        podStore={podStore as any}
        namespaceStore={namespaceStore as any}
        networkPolicyStore={policyStore as any}
        cluster={cluster}
      />,
    );

    // The additive policy allows every port, so the "other ports" row must be allowed
    const allowedBefore = tableVerdicts().allowed;

    expect(allowedBefore).toBeGreaterThan(0);
    expect(tableVerdicts().indeterminate).toBe(0);

    // The very same store instance now delivers a policy restricted to a different port
    const restrictivePolicy = createPolicy("additive-policy", "default", {
      podSelector: { matchLabels: { app: "backend" }},
      policyTypes: ["Ingress"],
      ingress: [
        {
          from: [{ podSelector: { matchLabels: { app: "frontend" }}}],
          ports: [{ port: 9999, protocol: "TCP" }],
        },
      ],
    }, "2");

    act(() => {
      policyStore.items = [scopedPolicy, restrictivePolicy];
    });

    // Only the declared port is allowed now: the "other ports" row can no longer be certified
    expect(tableVerdicts().indeterminate).toBeGreaterThan(0);
    expect(tableVerdicts().allowed).toBeLessThan(allowedBefore);
  });

  it("invalidates the results when the cluster changes while the previous cluster data is still present", () => {
    const podStore = createObservableStore({ items: [podFrontend, podBackend], isLoaded: true, isLoading: false, failedLoading: false });
    const namespaceStore = createObservableStore({ items: [nsDefault], isLoaded: true, isLoading: false, failedLoading: false });
    const policyStore = createObservableStore({ items: [scopedPolicy], isLoaded: true, isLoading: false, failedLoading: false });
    const clusterA = createCluster("cluster-a");
    const clusterB = createCluster("cluster-b");

    const { rerender } = render(
      <NetworkPolicyMatrix
        policy={scopedPolicy}
        podStore={podStore as any}
        namespaceStore={namespaceStore as any}
        networkPolicyStore={policyStore as any}
        cluster={clusterA}
      />,
    );

    expect(tableVerdicts().allowed).toBeGreaterThan(0);

    rerender(
      <NetworkPolicyMatrix
        policy={scopedPolicy}
        podStore={podStore as any}
        namespaceStore={namespaceStore as any}
        networkPolicyStore={policyStore as any}
        cluster={clusterB}
      />,
    );

    // The data of the previous cluster is still in the stores: the results must be recomputed for
    // the new cluster, and the stale data must not be certified as fresh.
    expect(tableVerdicts().allowed).toBe(0);
    expect(screen.getByText(/Estado de datos desconocido:/i)).toBeInTheDocument();

    // The resources of the new cluster are only certified after the stores confirm the reload
    act(() => {
      podStore.isLoading = true;
      namespaceStore.isLoading = true;
      policyStore.isLoading = true;
    });

    act(() => {
      podStore.isLoading = false;
      podStore.items = [createPod("frontend", "default", { app: "frontend" }, "10.244.1.5"), createPod("backend", "default", { app: "backend" }, "10.244.1.6")];
      namespaceStore.isLoading = false;
      policyStore.isLoading = false;
      policyStore.items = [createPolicy("scoped-policy", "default", scopedPolicy.spec, "2")];
    });

    expect(tableVerdicts().allowed).toBeGreaterThan(0);
  });
});

describe("NetworkPolicyMatrix data freshness per store", () => {
  let render: DiRender;

  beforeEach(() => {
    render = renderFor(getDiForUnitTesting());
  });

  const podFrontend = createPod("frontend", "default", { app: "frontend" }, "10.244.1.5");
  const podBackend = createPod("backend", "default", { app: "backend" }, "10.244.1.6");
  const nsDefault = createNamespace("default");

  const scopedPolicy = createPolicy("scoped-policy", "default", {
    podSelector: { matchLabels: { app: "backend" }},
    policyTypes: ["Ingress"],
    ingress: [
      {
        from: [{ podSelector: { matchLabels: { app: "frontend" }}}],
        ports: [{ port: 8080, protocol: "TCP" }],
      },
    ],
  });

  function setup() {
    const podStore = createObservableStore({ items: [podFrontend, podBackend], isLoaded: true, isLoading: false, failedLoading: false });
    const namespaceStore = createObservableStore({ items: [nsDefault], isLoaded: true, isLoading: false, failedLoading: false });
    const policyStore = createObservableStore({ items: [scopedPolicy], isLoaded: true, isLoading: false, failedLoading: false });
    const cluster = createCluster("cluster-a");

    const { rerender } = render(
      <NetworkPolicyMatrix
        policy={scopedPolicy}
        podStore={podStore as any}
        namespaceStore={namespaceStore as any}
        networkPolicyStore={policyStore as any}
        cluster={cluster}
      />,
    );

    return { podStore, namespaceStore, policyStore, cluster, rerender };
  }

  function loseAndRestoreConnection(cluster: ReturnType<typeof createCluster>) {
    act(() => {
      cluster.disconnected.set(true);
    });

    expect(tableVerdicts().allowed).toBe(0);

    act(() => {
      cluster.disconnected.set(false);
      cluster.online.set(true);
      cluster.accessible.set(true);
    });
  }

  it("keeps the NetworkPolicies indeterminate when only the Pods are updated after a reconnection", () => {
    const { podStore, policyStore, cluster } = setup();

    expect(tableVerdicts().allowed).toBeGreaterThan(0);

    loseAndRestoreConnection(cluster);

    expect(tableVerdicts().allowed).toBe(0);

    act(() => {
      podStore.items = [createPod("frontend", "default", { app: "frontend" }, "10.244.1.5"), createPod("backend", "default", { app: "backend" }, "10.244.1.6")];
    });

    // The Pods are fresh, but the NetworkPolicies still come from before the disconnection
    expect(tableVerdicts().allowed).toBe(0);
    expect(screen.getByText(/Estado de datos desconocido:/i)).toBeInTheDocument();
    expect(policyStore.items.length).toBe(1);
  });

  it("keeps the NetworkPolicies indeterminate when only the Namespaces are updated after a reconnection", () => {
    const { namespaceStore, cluster } = setup();

    expect(tableVerdicts().allowed).toBeGreaterThan(0);

    loseAndRestoreConnection(cluster);

    expect(tableVerdicts().allowed).toBe(0);

    act(() => {
      namespaceStore.items = [createNamespace("default")];
    });

    expect(tableVerdicts().allowed).toBe(0);
    expect(screen.getByText(/Estado de datos desconocido:/i)).toBeInTheDocument();
  });

  it("keeps the NetworkPolicies indeterminate when the cluster changes and the previous policies are still held", () => {
    const { podStore, namespaceStore, policyStore, rerender } = setup();

    expect(tableVerdicts().allowed).toBeGreaterThan(0);

    rerender(
      <NetworkPolicyMatrix
        policy={scopedPolicy}
        podStore={podStore as any}
        namespaceStore={namespaceStore as any}
        networkPolicyStore={policyStore as any}
        cluster={createCluster("cluster-b")}
      />,
    );

    // The stores still hold the policies of the previous cluster
    expect(policyStore.items.length).toBe(1);
    expect(podStore.items.length).toBe(2);
    expect(namespaceStore.items.length).toBe(1);

    expect(tableVerdicts().allowed).toBe(0);
    expect(screen.getByText(/Estado de datos desconocido:/i)).toBeInTheDocument();
  });

  it("keeps the NetworkPolicies indeterminate when the content changes during the disconnection", () => {
    const { podStore, cluster } = setup();

    expect(tableVerdicts().allowed).toBeGreaterThan(0);

    act(() => {
      cluster.disconnected.set(true);
    });

    // The store delivers new content while the connection is lost
    act(() => {
      podStore.items = [createPod("frontend", "default", { app: "frontend" }, "10.244.1.5"), createPod("backend", "default", { app: "backend" }, "10.244.1.6")];
    });

    expect(tableVerdicts().allowed).toBe(0);

    act(() => {
      cluster.disconnected.set(false);
      cluster.online.set(true);
      cluster.accessible.set(true);
    });

    // The reconnection alone does not certify the stale NetworkPolicies
    expect(tableVerdicts().allowed).toBe(0);
    expect(screen.getByText(/Estado de datos desconocido:/i)).toBeInTheDocument();
  });

  it("keeps the NetworkPolicies indeterminate when a load finishes during the disconnection", () => {
    const { policyStore, cluster } = setup();

    expect(tableVerdicts().allowed).toBeGreaterThan(0);

    act(() => {
      cluster.disconnected.set(true);
    });

    // The load starts and finishes while the connection is lost
    act(() => {
      policyStore.isLoading = true;
    });

    act(() => {
      policyStore.isLoading = false;
    });

    expect(tableVerdicts().allowed).toBe(0);

    act(() => {
      cluster.disconnected.set(false);
      cluster.online.set(true);
      cluster.accessible.set(true);
    });

    // The reconnection without a new reload does not certify the stale NetworkPolicies
    expect(tableVerdicts().allowed).toBe(0);
    expect(screen.getByText(/Estado de datos desconocido:/i)).toBeInTheDocument();
  });

  it("keeps the NetworkPolicies indeterminate when the reload fails", () => {
    const { policyStore, cluster } = setup();

    expect(tableVerdicts().allowed).toBeGreaterThan(0);

    act(() => {
      cluster.disconnected.set(true);
    });

    act(() => {
      cluster.disconnected.set(false);
      cluster.online.set(true);
      cluster.accessible.set(true);
    });

    // The store reloading with a failure must not certify fresh data
    act(() => {
      policyStore.isLoading = true;
    });

    act(() => {
      policyStore.isLoading = false;
      policyStore.failedLoading = true;
      policyStore.lastError = { statusCode: 500 };
    });

    expect(tableVerdicts().allowed).toBe(0);
    expect(screen.getByText(/Datos parciales:/i)).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryAllByText("Permitido por políticas")).toHaveLength(0);
  });

  it("allows the evaluation again after a confirmed full reload", () => {
    const { podStore, namespaceStore, policyStore, cluster } = setup();

    expect(tableVerdicts().allowed).toBeGreaterThan(0);

    loseAndRestoreConnection(cluster);

    expect(tableVerdicts().allowed).toBe(0);

    act(() => {
      podStore.isLoading = true;
      namespaceStore.isLoading = true;
      policyStore.isLoading = true;
    });

    act(() => {
      podStore.isLoading = false;
      podStore.items = [createPod("frontend", "default", { app: "frontend" }, "10.244.1.5"), createPod("backend", "default", { app: "backend" }, "10.244.1.6")];
      namespaceStore.isLoading = false;
      namespaceStore.items = [createNamespace("default")];
      policyStore.isLoading = false;
      policyStore.items = [scopedPolicy];
    });

    expect(tableVerdicts().allowed).toBeGreaterThan(0);
  });

  it("does not stay indeterminate after a confirmed reload without content modifications", () => {
    const { podStore, namespaceStore, policyStore, cluster } = setup();

    expect(tableVerdicts().allowed).toBeGreaterThan(0);

    loseAndRestoreConnection(cluster);

    expect(tableVerdicts().allowed).toBe(0);

    // The stores confirm the reload without delivering any content change
    act(() => {
      podStore.isLoading = true;
      namespaceStore.isLoading = true;
      policyStore.isLoading = true;
    });

    act(() => {
      podStore.isLoading = false;
      namespaceStore.isLoading = false;
      policyStore.isLoading = false;
    });

    expect(tableVerdicts().allowed).toBeGreaterThan(0);
  });
});
