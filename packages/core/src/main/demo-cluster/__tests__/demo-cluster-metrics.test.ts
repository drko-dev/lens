/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/** @jest-environment node */

import http from "http";
import { DemoClusterServer } from "../demo-cluster-server";
import { getDemoPodMetrics, getDemoNodeMetrics, getDemoPods } from "../demo-cluster-data";

describe("read-only synthetic demo metrics (visual Pod/Node fixtures)", () => {
  it("returns valid metrics with the containers expected by PodStore", () => {
    const metrics = getDemoPodMetrics();
    const pods = getDemoPods().items;

    expect(metrics.kind).toBe("PodMetricsList");
    expect(metrics.apiVersion).toBe("metrics.k8s.io/v1beta1");
    expect(metrics.items).toHaveLength(pods.length);

    for (const [index, item] of metrics.items.entries()) {
      expect(item.metadata.name).toBe(pods[index].metadata.name);
      expect(item.metadata.namespace).toBe(pods[index].metadata.namespace);
      expect(item.containers).toHaveLength(pods[index].spec.containers.length);
      expect(item.containers[0].usage.cpu).toMatch(/^\d+m$/);
      expect(item.containers[0].usage.memory).toMatch(/^\d+Mi$/);
    }

    expect(getDemoNodeMetrics().items).toHaveLength(2);
  });

  it("serves metrics.k8s.io (not Pod objects) for list and namespaced queries, with writes forbidden", async () => {
    const server = new DemoClusterServer();
    const port = await server.start();

    const request = (path: string, method = "GET") => new Promise<{ status: number; body: any }>((resolve, reject) => {
      http.request({ hostname: "127.0.0.1", port, method, path, timeout: 3000 }, response => {
        let output = "";

        response.setEncoding("utf8");
        response.on("data", part => output += part);
        response.on("end", () => {
          try {
            resolve({ status: response.statusCode ?? 0, body: JSON.parse(output) });
          } catch (error) {
            reject(error);
          }
        });
      }).on("error", reject).end();
    });

    try {
      const discovery = await request("/apis/metrics.k8s.io/v1beta1");
      expect(discovery.status).toBe(200);
      expect(discovery.body.resources).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "pods", kind: "PodMetrics" }),
        expect.objectContaining({ name: "nodes", kind: "NodeMetrics" }),
      ]));

      const pods = await request("/apis/metrics.k8s.io/v1beta1/pods");
      expect(pods.status).toBe(200);
      expect(pods.body.kind).toBe("PodMetricsList");
      expect(pods.body.items[0].containers[0].usage.cpu).toMatch(/^\d+m$/);
      expect(pods.body.items[0].spec).toBeUndefined();

      const ns = await request("/apis/metrics.k8s.io/v1beta1/namespaces/default/pods");
      expect(ns.status).toBe(200);
      expect(ns.body.items).toHaveLength(0);

      const nodes = await request("/apis/metrics.k8s.io/v1beta1/nodes");
      expect(nodes.status).toBe(200);
      expect(nodes.body.kind).toBe("NodeMetricsList");
      expect(nodes.body.items[0].usage.memory).toMatch(/^\d+Gi$/);

      const denied = await request("/apis/metrics.k8s.io/v1beta1/pods", "DELETE");
      expect(denied.status).toBe(403);
    } finally {
      await server.stop();
    }
  });
});
