/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { act, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { observable } from "mobx";
import { Pod, NetworkPolicy, Namespace } from "@openlens/kube-object";
import { PodNetworkPolicies } from "../details/pod-network-policies";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import type { DiRender } from "../../test-utils/renderFor";
import { renderFor } from "../../test-utils/renderFor";

function createPod(name: string, namespace: string, labels: Record<string, string>): Pod {
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
      podIP: "10.244.1.10",
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

describe("PodNetworkPolicies reactivity (stable observable instances)", () => {
  let render: DiRender;

  beforeEach(() => {
    render = renderFor(getDiForUnitTesting());
  });

  const pod = createPod("backend", "default", { app: "backend" });
  const ns = new Namespace({
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
      name: "default",
      uid: "ns-default",
      resourceVersion: "1",
      selfLink: "/api/v1/namespaces/default",
    },
  });

  it("switches from unisolated to isolated when a Default Deny policy lands in the same store", () => {
    const policyStore = createObservableStore<{ items: NetworkPolicy[]; isLoaded: boolean; isLoading: boolean; failedLoading: boolean }>({ items: [], isLoaded: true, isLoading: false, failedLoading: false });
    const podStore = createObservableStore({ items: [pod], isLoaded: true, isLoading: false, failedLoading: false });
    const namespaceStore = createObservableStore({ items: [ns], isLoaded: true, isLoading: false, failedLoading: false });
    const cluster = createCluster("cluster-a");

    render(
      <MemoryRouter>
        <PodNetworkPolicies
          pod={pod}
          podStore={podStore as any}
          namespaceStore={namespaceStore as any}
          networkPolicyStore={policyStore as any}
          cluster={cluster}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("No aislado (Default Allow Ingress)")).toBeInTheDocument();
    expect(screen.getByText("Ninguna política selecciona este Pod")).toBeInTheDocument();

    const denyPolicy = createPolicy("default-deny", "default", {
      podSelector: {},
      policyTypes: ["Ingress", "Egress"],
      ingress: [],
      egress: [],
    });

    act(() => {
      policyStore.items = [denyPolicy];
    });

    expect(screen.getByText("Aislado (Default Deny Ingress)")).toBeInTheDocument();
    expect(screen.getByText("Aislado (Default Deny Egress)")).toBeInTheDocument();
    expect(screen.queryByText("No aislado (Default Allow Ingress)")).not.toBeInTheDocument();
    expect(screen.getByText("default-deny")).toBeInTheDocument();
  });

  it("removes the previous isolation verdict when the cluster becomes disconnected", () => {
    const policyStore = createObservableStore<{ items: NetworkPolicy[]; isLoaded: boolean; isLoading: boolean; failedLoading: boolean }>({ items: [], isLoaded: true, isLoading: false, failedLoading: false });
    const podStore = createObservableStore({ items: [pod], isLoaded: true, isLoading: false, failedLoading: false });
    const namespaceStore = createObservableStore({ items: [ns], isLoaded: true, isLoading: false, failedLoading: false });
    const cluster = createCluster("cluster-a");

    render(
      <MemoryRouter>
        <PodNetworkPolicies
          pod={pod}
          podStore={podStore as any}
          namespaceStore={namespaceStore as any}
          networkPolicyStore={policyStore as any}
          cluster={cluster}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("No aislado (Default Allow Ingress)")).toBeInTheDocument();

    act(() => {
      cluster.disconnected.set(true);
    });

    expect(screen.getAllByText("Desconectado").length).toBeGreaterThan(0);
    expect(screen.queryByText("No aislado (Default Allow Ingress)")).not.toBeInTheDocument();
  });

  it("keeps the isolation verdict indeterminate while the store has not loaded", () => {
    const policyStore = createObservableStore({ items: [], isLoaded: false, isLoading: false, failedLoading: false });
    const podStore = createObservableStore({ items: [pod], isLoaded: true, isLoading: false, failedLoading: false });
    const namespaceStore = createObservableStore({ items: [ns], isLoaded: true, isLoading: false, failedLoading: false });
    const cluster = createCluster("cluster-a");

    render(
      <MemoryRouter>
        <PodNetworkPolicies
          pod={pod}
          podStore={podStore as any}
          namespaceStore={namespaceStore as any}
          networkPolicyStore={policyStore as any}
          cluster={cluster}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("Indeterminado").length).toBe(2);

    act(() => {
      policyStore.isLoaded = true;
    });

    expect(screen.getByText("No aislado (Default Allow Ingress)")).toBeInTheDocument();
  });

  it("does not assert isolation for a reachable but inaccessible cluster", () => {
    const policyStore = createObservableStore<{ items: NetworkPolicy[]; isLoaded: boolean; isLoading: boolean; failedLoading: boolean }>({ items: [], isLoaded: true, isLoading: false, failedLoading: false });
    const podStore = createObservableStore({ items: [pod], isLoaded: true, isLoading: false, failedLoading: false });
    const namespaceStore = createObservableStore({ items: [ns], isLoaded: true, isLoading: false, failedLoading: false });
    const cluster = createCluster("cluster-a");

    render(
      <MemoryRouter>
        <PodNetworkPolicies
          pod={pod}
          podStore={podStore as any}
          namespaceStore={namespaceStore as any}
          networkPolicyStore={policyStore as any}
          cluster={cluster}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("No aislado (Default Allow Ingress)")).toBeInTheDocument();

    act(() => {
      cluster.accessible.set(false);
    });

    expect(screen.getAllByText("Clúster inaccesible").length).toBeGreaterThan(0);
    expect(screen.queryByText("No aislado (Default Allow Ingress)")).not.toBeInTheDocument();
  });
});
