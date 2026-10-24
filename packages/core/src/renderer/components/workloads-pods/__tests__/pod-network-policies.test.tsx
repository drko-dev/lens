/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

function createPolicy(name: string, namespace: string, spec: any): NetworkPolicy {
  return new NetworkPolicy({
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name,
      namespace,
      uid: `np-${namespace}-${name}`,
      resourceVersion: "1",
      selfLink: `/apis/networking.k8s.io/v1/namespaces/${namespace}/networkpolicies/${name}`,
    },
    spec,
  });
}

describe("PodNetworkPolicies Component", () => {
  let render: DiRender;

  beforeEach(() => {
    const di = getDiForUnitTesting();

    render = renderFor(di);
  });

  const pod = createPod("backend", "default", { app: "backend" });
  const otherPod = createPod("frontend", "default", { app: "frontend" });
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

  it("renders an indeterminate status when the policy store is absent (never Default Allow)", () => {
    render(
      <MemoryRouter>
        <PodNetworkPolicies pod={pod} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Network Policies")).toBeInTheDocument();
    expect(screen.getAllByText("Indeterminado").length).toBe(2);
    expect(screen.queryByText("No aislado (Default Allow Ingress)")).not.toBeInTheDocument();
    expect(screen.getByText("Estado de políticas no disponible (store no inicializado)")).toBeInTheDocument();
  });

  it("renders an indeterminate status when the policy store never initialized", () => {
    const notLoadedStore = {
      items: [],
      isLoading: false,
      failedLoading: false,
      isLoaded: false,
    };

    render(
      <MemoryRouter>
        <PodNetworkPolicies
          pod={pod}
          networkPolicyStore={notLoadedStore as any}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("Indeterminado").length).toBe(2);
    expect(screen.queryByText("No aislado (Default Allow Ingress)")).not.toBeInTheDocument();
  });

  it("renders the unisolated status when the store is loaded and no policy applies", () => {
    const loadedEmptyStore = {
      items: [],
      isLoading: false,
      failedLoading: false,
      isLoaded: true,
    };

    render(
      <MemoryRouter>
        <PodNetworkPolicies
          pod={pod}
          networkPolicyStore={loadedEmptyStore as any}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("No aislado (Default Allow Ingress)")).toBeInTheDocument();
    expect(screen.getByText("No aislado (Default Allow Egress)")).toBeInTheDocument();
    expect(screen.getByText("Ninguna política selecciona este Pod")).toBeInTheDocument();
  });

  it("renders isolated status and policy link when selecting policy exists", () => {
    const denyPolicy = createPolicy("backend-deny", "default", {
      podSelector: { matchLabels: { app: "backend" }},
      policyTypes: ["Ingress"],
      ingress: [],
    });

    const mockPolicyStore = {
      items: [denyPolicy],
      isLoading: false,
      failedLoading: false,
      isLoaded: true,
    };

    render(
      <MemoryRouter>
        <PodNetworkPolicies
          pod={pod}
          networkPolicyStore={mockPolicyStore as any}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Aislado (Default Deny Ingress)")).toBeInTheDocument();
    expect(screen.getByText("backend-deny")).toBeInTheDocument();
  });

  it("renders loading badge when networkPolicyStore is loading (fail-closed)", () => {
    const mockLoadingStore = {
      items: [],
      isLoading: true,
      failedLoading: false,
      isLoaded: false,
    };

    render(
      <MemoryRouter>
        <PodNetworkPolicies
          pod={pod}
          networkPolicyStore={mockLoadingStore as any}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("Cargando políticas...").length).toBeGreaterThan(0);
    expect(screen.getByText("Cargando políticas aplicables...")).toBeInTheDocument();
  });

  it("renders RBAC 403 permission denied badge when listing fails (fail-closed)", () => {
    const mock403Store = {
      items: [],
      isLoading: false,
      failedLoading: true,
      lastError: { statusCode: 403 },
      isLoaded: false,
    };

    render(
      <MemoryRouter>
        <PodNetworkPolicies
          pod={pod}
          networkPolicyStore={mock403Store as any}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("Permiso denegado (RBAC 403)").length).toBeGreaterThan(0);
    expect(screen.getByText("Permiso denegado para listar NetworkPolicies (RBAC 403)")).toBeInTheDocument();
  });

  it("renders disconnected badge when the cluster is disconnected (authentic cluster state)", () => {
    const mockDisconnectedStore = {
      items: [],
      isLoading: false,
      failedLoading: false,
      isLoaded: true,
    };

    render(
      <MemoryRouter>
        <PodNetworkPolicies
          pod={pod}
          networkPolicyStore={mockDisconnectedStore as any}
          cluster={{ id: "cluster-a", disconnected: true, online: false, accessible: false }}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("Desconectado").length).toBeGreaterThan(0);
    expect(screen.getByText("Clúster desconectado")).toBeInTheDocument();
  });

  it("toggles the traffic matrix when button is clicked", () => {
    const mockPolicyStore = {
      items: [],
      isLoading: false,
      failedLoading: false,
      isLoaded: true,
    };
    const mockPodStore = {
      items: [pod, otherPod],
      isLoading: false,
      failedLoading: false,
    };
    const mockNsStore = {
      items: [ns],
      isLoading: false,
      failedLoading: false,
    };

    render(
      <MemoryRouter>
        <PodNetworkPolicies
          pod={pod}
          networkPolicyStore={mockPolicyStore as any}
          podStore={mockPodStore as any}
          namespaceStore={mockNsStore as any}
        />
      </MemoryRouter>,
    );

    const toggleButton = screen.getByText("Inspeccionar matriz de tráfico del Pod");

    expect(toggleButton).toBeInTheDocument();

    fireEvent.click(toggleButton);

    expect(screen.getByText("Ocultar matriz de tráfico")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
