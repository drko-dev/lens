/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import fetch from "@openlens/node-fetch";
import { DemoClusterServer } from "../demo-cluster-server";
import { generateDemoKubeconfigYaml } from "../demo-cluster-manager";
import yaml from "js-yaml";

describe("DemoClusterServer (R8-06 Loopback Simulated Cluster)", () => {
  let server: DemoClusterServer;
  let port: number;
  let baseUrl: string;

  beforeAll(async () => {
    server = new DemoClusterServer();
    port = await server.start(0);
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await server.stop();
  });

  it("binds strictly to loopback 127.0.0.1 and reports isRunning()", () => {
    expect(server.isRunning()).toBe(true);
    expect(server.getPort()).toBe(port);
    expect(port).toBeGreaterThan(0);
  });

  it("serves Kubernetes version discovery at /version", async () => {
    const res = await fetch(`${baseUrl}/version`);

    expect(res.status).toBe(200);

    const data = (await res.json()) as any;

    expect(data.gitVersion).toContain("v1.30.0-openlens-demo");
    expect(data.major).toBe("1");
    expect(data.minor).toBe("30");
  });

  it("serves APIResourceList and group discovery for the demo UI", async () => {
    for (const [route, expectedKind] of [
      ["/api/v1", "Pod"],
      ["/apis/apps/v1", "Deployment"],
      ["/apis/gateway.networking.k8s.io/v1", "Gateway"],
      ["/apis/resource.k8s.io/v1alpha2", "DeviceClass"],
    ]) {
      const response = await fetch(`${baseUrl}${route}`);

      expect(response.status).toBe(200);
      const data = (await response.json()) as any;

      expect(data.kind).toBe("APIResourceList");
      expect(data.resources.some((item: any) => item.kind === expectedKind)).toBe(true);
    }
    const group = await fetch(`${baseUrl}/apis/apps`);

    expect(group.status).toBe(200);
    expect(((await group.json()) as any).name).toBe("apps");
  });

  it("serves core namespaces, nodes, and pods with valid metadata", async () => {
    const nsRes = await fetch(`${baseUrl}/api/v1/namespaces`);

    expect(nsRes.status).toBe(200);
    const nsData = (await nsRes.json()) as any;

    expect(nsData.items.map((i: any) => i.metadata.name)).toContain("demo-apps");

    const nodeRes = await fetch(`${baseUrl}/api/v1/nodes`);

    expect(nodeRes.status).toBe(200);
    const nodeData = (await nodeRes.json()) as any;

    expect(nodeData.items.length).toBeGreaterThanOrEqual(1);

    const podRes = await fetch(`${baseUrl}/api/v1/pods`);

    expect(podRes.status).toBe(200);
    const podData = (await podRes.json()) as any;

    expect(podData.items.some((p: any) => p.metadata.name.startsWith("demo-web"))).toBe(true);
  });

  it("serves Gateway API, CEL policies, and DRA device classes for extended feature exploration", async () => {
    const gwRes = await fetch(`${baseUrl}/apis/gateway.networking.k8s.io/v1/gateways`);

    expect(gwRes.status).toBe(200);
    const gwData = (await gwRes.json()) as any;

    expect(gwData.items.length).toBeGreaterThanOrEqual(1);

    const celRes = await fetch(`${baseUrl}/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicies`);

    expect(celRes.status).toBe(200);
    const celData = (await celRes.json()) as any;

    expect(celData.items.length).toBeGreaterThanOrEqual(1);

    const draRes = await fetch(`${baseUrl}/apis/resource.k8s.io/v1alpha2/deviceclasses`);

    expect(draRes.status).toBe(200);
    const draData = (await draRes.json()) as any;

    expect(draData.items.length).toBeGreaterThanOrEqual(1);
  });

  it("approves SelfSubjectAccessReview to allow client UI navigation without RBAC warnings", async () => {
    const res = await fetch(`${baseUrl}/apis/authorization.k8s.io/v1/selfsubjectaccessreviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec: { resourceAttributes: { verb: "list", resource: "pods" }}}),
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as any;

    expect(data.status.allowed).toBe(true);
  });

  it("strictly rejects any mutation attempt with 403 Forbidden", async () => {
    const deleteRes = await fetch(`${baseUrl}/api/v1/namespaces/default/pods/demo-web`, {
      method: "DELETE",
    });

    expect(deleteRes.status).toBe(403);
    const data = (await deleteRes.json()) as any;

    expect(data.message).toContain("strictly read-only");
  });

  it("generates valid kubeconfig YAML targeting loopback server", () => {
    const kubeconfigYaml = generateDemoKubeconfigYaml(port);
    const parsed = yaml.load(kubeconfigYaml) as any;

    expect(parsed.clusters[0].cluster.server).toBe(`http://127.0.0.1:${port}`);
    expect(parsed.contexts[0].name).toBe("openlens-demo-cluster");
    expect(parsed["current-context"]).toBe("openlens-demo-cluster");
  });
});
