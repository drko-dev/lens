/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { screen, fireEvent, within } from "@testing-library/react";
import { NetworkPolicyMatrix } from "../matrix/network-policy-matrix";
import { NetworkPolicy, Pod, Namespace } from "@openlens/kube-object";
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
      podIP: "10.244.1.5",
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

describe("NetworkPolicyMatrix Component", () => {
  let render: DiRender;

  beforeEach(() => {
    const di = getDiForUnitTesting();

    render = renderFor(di);
  });

  const podFrontend = createPod("frontend", "default", { app: "frontend" });
  const podBackend = createPod("backend", "default", { app: "backend" });
  const nsDefault = createNamespace("default");

  const policy = createPolicy("backend-policy", "default", {
    podSelector: { matchLabels: { app: "backend" }},
    policyTypes: ["Ingress"],
    ingress: [
      {
        from: [{ podSelector: { matchLabels: { app: "frontend" }}}],
        ports: [{ port: 8080, protocol: "TCP" }],
      },
    ],
  });

  const mockPodStore = {
    items: [podFrontend, podBackend],
    isLoading: false,
    isLoaded: true,
    failedLoading: false,
  };

  const mockNamespaceStore = {
    items: [nsDefault],
    isLoading: false,
    isLoaded: true,
    failedLoading: false,
  };

  const mockPolicyStore = {
    items: [policy],
    isLoading: false,
    isLoaded: true,
    failedLoading: false,
  };

  const mockCluster = { id: "cluster-a", disconnected: false, online: true, accessible: true };

  it("renders header and limitations disclaimer", () => {
    render(
      <NetworkPolicyMatrix
        policy={policy}
        podStore={mockPodStore as any}
        namespaceStore={mockNamespaceStore as any}
        networkPolicyStore={mockPolicyStore as any}
        cluster={mockCluster}
      />,
    );

    expect(screen.getByText("Matriz de Conectividad de NetworkPolicies")).toBeInTheDocument();
    expect(screen.getByText(/Aviso de limitaciones:/i)).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("renders evaluated connection rows with allowed status", () => {
    render(
      <NetworkPolicyMatrix
        policy={policy}
        podStore={mockPodStore as any}
        namespaceStore={mockNamespaceStore as any}
        networkPolicyStore={mockPolicyStore as any}
        cluster={mockCluster}
      />,
    );

    expect(screen.getAllByText("frontend").length).toBeGreaterThan(0);
    expect(screen.getAllByText("backend").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Permitido por políticas").length).toBeGreaterThan(0);
  });

  it("filters rows by search input", () => {
    render(
      <NetworkPolicyMatrix
        policy={policy}
        podStore={mockPodStore as any}
        namespaceStore={mockNamespaceStore as any}
        networkPolicyStore={mockPolicyStore as any}
        cluster={mockCluster}
      />,
    );

    const input = screen.getByPlaceholderText("Buscar Pod o IP...");

    fireEvent.change(input, { target: { value: "nonexistent-pod" }});

    expect(screen.getByText("No se encontraron conexiones evaluables con los filtros seleccionados.")).toBeInTheDocument();
  });

  it("displays RBAC 403 banner on permission denied", () => {
    const deniedPodStore = {
      items: [],
      isLoading: false,
      failedLoading: true,
      lastError: { statusCode: 403 },
    };

    render(
      <NetworkPolicyMatrix
        policy={policy}
        podStore={deniedPodStore as any}
        namespaceStore={mockNamespaceStore as any}
        networkPolicyStore={mockPolicyStore as any}
        cluster={mockCluster}
      />,
    );

    expect(screen.getByText(/Acceso restringido \(RBAC 403\)/i)).toBeInTheDocument();
  });

  it("displays partial data banner when namespace store failed with a non RBAC error", () => {
    const failedNsStore = {
      items: [],
      isLoading: false,
      isLoaded: false,
      failedLoading: true,
      lastError: { statusCode: 500 },
    };

    render(
      <NetworkPolicyMatrix
        policy={policy}
        podStore={mockPodStore as any}
        namespaceStore={failedNsStore as any}
        networkPolicyStore={mockPolicyStore as any}
        cluster={mockCluster}
      />,
    );

    expect(screen.getByText(/Datos parciales:/i)).toBeInTheDocument();
  });

  it("supports focusedPod scoping", () => {
    render(
      <NetworkPolicyMatrix
        focusedPod={podBackend}
        podStore={mockPodStore as any}
        namespaceStore={mockNamespaceStore as any}
        networkPolicyStore={mockPolicyStore as any}
        cluster={mockCluster}
      />,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByText("backend").length).toBeGreaterThan(0);
  });

  it("displays disconnected banner when the cluster is disconnected (authentic cluster state)", () => {
    render(
      <NetworkPolicyMatrix
        policy={policy}
        podStore={mockPodStore as any}
        namespaceStore={mockNamespaceStore as any}
        networkPolicyStore={mockPolicyStore as any}
        cluster={{ id: "cluster-a", disconnected: true, online: false, accessible: false }}
      />,
    );

    expect(screen.getByText(/Clúster desconectado:/i)).toBeInTheDocument();
  });

  it("does not report allowed connections when a store was never initialized", () => {
    const notLoadedStore = {
      items: [],
      isLoading: false,
      isLoaded: false,
      failedLoading: false,
    };

    render(
      <NetworkPolicyMatrix
        policy={policy}
        podStore={notLoadedStore as any}
        namespaceStore={mockNamespaceStore as any}
        networkPolicyStore={mockPolicyStore as any}
        cluster={mockCluster}
      />,
    );

    expect(screen.getByText(/Estado de datos desconocido:/i)).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryAllByText("Permitido por políticas")).toHaveLength(0);
  });

  it("does not report allowed connections when a store is absent", () => {
    render(
      <NetworkPolicyMatrix
        policy={policy}
        namespaceStore={mockNamespaceStore as any}
        networkPolicyStore={mockPolicyStore as any}
        cluster={mockCluster}
      />,
    );

    expect(screen.getByText(/Estado de datos desconocido:/i)).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryAllByText("Permitido por políticas")).toHaveLength(0);
  });

  it("invalidates the results when the cluster changes", () => {
    const otherPolicy = createPolicy("other-cluster-policy", "default", {
      podSelector: { matchLabels: { app: "backend" }},
      policyTypes: ["Ingress"],
      ingress: [
        {
          from: [{ podSelector: { matchLabels: { app: "frontend" }}}],
          ports: [{ port: 9090, protocol: "TCP" }],
        },
      ],
    });

    const { rerender } = render(
      <NetworkPolicyMatrix
        policy={policy}
        podStore={mockPodStore as any}
        namespaceStore={mockNamespaceStore as any}
        networkPolicyStore={mockPolicyStore as any}
        cluster={mockCluster}
      />,
    );

    expect(screen.getAllByText("8080").length).toBeGreaterThan(0);

    rerender(
      <NetworkPolicyMatrix
        policy={otherPolicy}
        podStore={mockPodStore as any}
        namespaceStore={mockNamespaceStore as any}
        networkPolicyStore={mockPolicyStore as any}
        cluster={{ id: "cluster-b", disconnected: false, online: true, accessible: true }}
      />,
    );

    // Results of the previous cluster/policy must not survive the switch
    expect(screen.queryAllByText("8080")).toHaveLength(0);
    expect(screen.getAllByText("9090").length).toBeGreaterThan(0);
  });

  it("discloses a partial analysis when the explicit evaluation budget is reached", () => {
    render(
      <NetworkPolicyMatrix
        policy={policy}
        podStore={mockPodStore as any}
        namespaceStore={mockNamespaceStore as any}
        networkPolicyStore={mockPolicyStore as any}
        cluster={mockCluster}
        maxConnections={1}
      />,
    );

    expect(screen.getByText(/Análisis parcial:/i)).toBeInTheDocument();
    expect(screen.getByText(/NO fueron evaluadas/i)).toBeInTheDocument();
  });

  it("distinguishes container declared ports from the remaining accessible ports", () => {
    render(
      <NetworkPolicyMatrix
        focusedPod={podBackend}
        podStore={mockPodStore as any}
        namespaceStore={mockNamespaceStore as any}
        networkPolicyStore={mockPolicyStore as any}
        cluster={mockCluster}
      />,
    );

    expect(screen.getAllByText("8080").length).toBeGreaterThan(0);
    expect(screen.getAllByText("otros puertos").length).toBeGreaterThan(0);
  });

  it("renders pagination info when connections exist", () => {
    render(
      <NetworkPolicyMatrix
        policy={policy}
        podStore={mockPodStore as any}
        namespaceStore={mockNamespaceStore as any}
        networkPolicyStore={mockPolicyStore as any}
        cluster={mockCluster}
      />,
    );

    expect(screen.getByText(/Mostrando 1–/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
  });
});
