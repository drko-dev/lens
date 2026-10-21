/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { McpServerContext } from "../mcp-server";
import { OpenLensMcpServer, redactSensitiveData } from "../mcp-server";

const toolCall = (server: OpenLensMcpServer, name: string, args: Record<string, unknown> = {}, id = 1) => server.handleRequest({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name, arguments: args },
});

const context = (overrides: Partial<McpServerContext> = {}): McpServerContext => ({
  authorizeCluster: async clusterId => clusterId === "cluster-dev-01",
  getResources: async () => [],
  ...overrides,
});

describe("R4-01A MCP security gates", () => {
  describe("fail closed without a backend", () => {
    it.each([
      ["list_clusters", {}],
      ["get_cluster_info", { clusterId: "cluster-dev-01" }],
      ["list_resources", { clusterId: "cluster-dev-01", resourceKind: "pods" }],
      ["get_resource", { clusterId: "cluster-dev-01", resourceKind: "pods", name: "api" }],
      ["get_pod_logs", { clusterId: "cluster-dev-01", podName: "api", namespace: "default" }],
      ["get_events", { clusterId: "cluster-dev-01" }],
      ["estimate_cluster_costs", { clusterId: "cluster-dev-01" }],
    ])("returns NOT_CONFIGURED rather than synthetic data for %s", async (name, args) => {
      const response = await toolCall(new OpenLensMcpServer(), name, args as Record<string, unknown>);

      expect(response.error.code).toBe(-32003);
      expect(response.error.message).toContain("NOT_CONFIGURED");
      expect(response.result).toBeUndefined();
    });
  });

  describe("runtime input validation", () => {
    it("rejects malformed JSON-RPC envelopes and non-object tool arguments", async () => {
      const server = new OpenLensMcpServer(context());

      expect((await server.handleRequest(null)).error.code).toBe(-32600);
      expect((await server.handleRequest({ jsonrpc: "1.0", id: 2, method: "ping" })).error.code).toBe(-32600);
      expect((await server.handleRequest({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "list_clusters", arguments: [] },
      })).error.code).toBe(-32602);
    });

    it.each([
      ["missing clusterId", { resourceKind: "pods" }],
      ["invalid clusterId", { clusterId: "../production", resourceKind: "pods" }],
      ["invalid kind", { clusterId: "cluster-dev-01", resourceKind: "pods/exec" }],
      ["invalid namespace", { clusterId: "cluster-dev-01", resourceKind: "pods", namespace: "../default" }],
      ["negative limit", { clusterId: "cluster-dev-01", resourceKind: "pods", limit: -1 }],
      ["fractional limit", { clusterId: "cluster-dev-01", resourceKind: "pods", limit: 1.5 }],
      ["unknown argument", { clusterId: "cluster-dev-01", resourceKind: "pods", shell: "id" }],
    ])("rejects %s before calling the backend", async (_label, args) => {
      const getResources = jest.fn(async () => []);
      const server = new OpenLensMcpServer(context({ getResources }));
      const response = await toolCall(server, "list_resources", args as Record<string, unknown>);

      expect(response.error.code).toBe(-32602);
      expect(getResources).not.toHaveBeenCalled();
    });

    it("rejects oversized request payloads before dispatch", async () => {
      const getResources = jest.fn(async () => []);
      const server = new OpenLensMcpServer(context({ getResources }));
      const response = await server.handleRequest({
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "list_clusters", arguments: {}, _meta: { padding: "x".repeat(300_000) }},
      });

      expect(response.error.code).toBe(-32600);
      expect(getResources).not.toHaveBeenCalled();
    });
  });

  describe("cluster authorization", () => {
    it("denies a cluster outside the caller scope without invoking the provider", async () => {
      const getResources = jest.fn(async () => [{ metadata: { name: "api" }}]);
      const server = new OpenLensMcpServer(context({ getResources }));
      const response = await toolCall(server, "list_resources", {
        clusterId: "cluster-prod-99",
        resourceKind: "pods",
      });

      expect(response.error.code).toBe(-32001);
      expect(response.error.message).toContain("ACCESS_DENIED");
      expect(getResources).not.toHaveBeenCalled();
    });

    it("re-checks authorization after an awaited backend call so a revoked scope cannot return data", async () => {
      let allowed = true;
      const server = new OpenLensMcpServer(context({
        authorizeCluster: async () => allowed,
        getResources: async () => {
          allowed = false;

          return [{ metadata: { name: "private-pod" }}];
        },
      }));
      const response = await toolCall(server, "list_resources", {
        clusterId: "cluster-dev-01",
        resourceKind: "pods",
      });

      expect(response.error.code).toBe(-32001);
      expect(JSON.stringify(response)).not.toContain("private-pod");
    });

    it("does not return clusters outside the caller's authorization scope", async () => {
      const server = new OpenLensMcpServer(context({
        getClusters: () => [
          { id: "cluster-dev-01", name: "dev" },
          { id: "cluster-prod-99", name: "prod" },
        ],
      }));
      const response = await toolCall(server, "list_clusters");
      const result = JSON.parse(response.result.content[0].text);

      expect(result.clusters.map((cluster: { id: string }) => cluster.id)).toEqual(["cluster-dev-01"]);
    });
  });

  describe("execution and response budgets", () => {
    it("aborts a backend call after its execution timeout", async () => {
      jest.useFakeTimers();

      try {
        const server = new OpenLensMcpServer(context({
          getResources: async (_clusterId, _kind, _namespace, signal) => new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new Error("provider-secret-token")), { once: true });
          }),
        }));
        const pending = toolCall(server, "list_resources", {
          clusterId: "cluster-dev-01",
          resourceKind: "pods",
        });

        jest.advanceTimersByTime(5_001);
        const response = await pending;

        expect(response.error.code).toBe(-32002);
        expect(response.error.message).toContain("TIMEOUT");
        expect(response.error.message).not.toContain("provider-secret-token");
      } finally {
        jest.useRealTimers();
      }
    });

    it("rejects calls beyond the concurrency budget", async () => {
      let release: (value: any[]) => void = () => {};
      const pendingResult = new Promise<any[]>(resolve => release = resolve);
      const server = new OpenLensMcpServer(context({ getResources: async () => pendingResult }));
      const args = { clusterId: "cluster-dev-01", resourceKind: "pods" };
      const firstFour = Array.from({ length: 4 }, (_value, index) => toolCall(server, "list_resources", args, index + 1));
      const fifth = await toolCall(server, "list_resources", args, 5);

      expect(fifth.error.code).toBe(-32002);
      expect(fifth.error.message).toContain("CONCURRENCY_LIMIT");
      release([]);
      await Promise.all(firstFour);
    });

    it("keeps timed-out provider work inside the concurrency budget until it settles", async () => {
      jest.useFakeTimers();

      try {
        let release: (value: any[]) => void = () => {};
        let providerCalls = 0;
        const pendingResult = new Promise<any[]>(resolve => release = resolve);
        const server = new OpenLensMcpServer(context({
          getResources: async () => {
            providerCalls += 1;

            return pendingResult;
          },
        }));
        const args = { clusterId: "cluster-dev-01", resourceKind: "pods" };
        const firstFour = Array.from({ length: 4 }, (_value, index) => toolCall(server, "list_resources", args, index + 1));

        jest.advanceTimersByTime(5_001);

        const timeouts = await Promise.all(firstFour);

        expect(timeouts.every(response => response.error?.message.includes("TIMEOUT"))).toBe(true);
        expect(providerCalls).toBe(4);

        const fifth = await toolCall(server, "list_resources", args, 5);

        expect(fifth.error.code).toBe(-32002);
        expect(fifth.error.message).toContain("CONCURRENCY_LIMIT");
        expect(providerCalls).toBe(4);

        release([]);

        for (let tick = 0; tick < 8; tick += 1) await Promise.resolve();

        const afterRelease = await toolCall(server, "list_resources", args, 6);

        expect(afterRelease.error).toBeUndefined();
      } finally {
        jest.useRealTimers();
      }
    });

    it("rejects oversized sanitized output instead of emitting a partial or unbounded response", async () => {
      const server = new OpenLensMcpServer(context({
        getResources: async () => [{ metadata: { name: "api", annotations: { note: "x".repeat(1_100_000) }}}],
      }));
      const response = await toolCall(server, "list_resources", {
        clusterId: "cluster-dev-01",
        resourceKind: "pods",
      });

      expect(response.error.code).toBe(-32002);
      expect(response.error.message).toContain("OUTPUT_LIMIT");
      expect(response.result).toBeUndefined();
    });
  });

  describe("sensitive-data redaction and safe errors", () => {
    it("redacts Secrets, case variants, nested credentials, maps, errors, and binary buffers", () => {
      const cyclic: any[] = [];

      cyclic.push(cyclic);
      const input = {
        kind: "Secret",
        DATA: { "tls.key": "YmFzZTY0LXNlY3JldA==" },
        String_Data: { password: "plaintext" },
        nested: [{ ClIeNt_CeRtIfIcAtE_DaTa: "certificate" }],
        buffer: Buffer.from("credential bytes"),
        map: new Map([["access_token", "map-secret"]]),
        error: Object.assign(new Error("failed with token=error-secret"), { authorization: "Bearer error-token" }),
        cyclic,
      };

      const result = redactSensitiveData(input);

      expect(result.DATA).toBe("[REDACTED_SECRET]");
      expect(result.String_Data).toBe("[REDACTED_SECRET]");
      expect(result.nested[0].ClIeNt_CeRtIfIcAtE_DaTa).toBe("[REDACTED_SECRET]");
      expect(result.buffer).toBe("[REDACTED_BINARY_DATA]");
      expect(result.map.access_token).toBe("[REDACTED_SECRET]");
      expect(result.error.message).not.toContain("error-secret");
      expect(result.error.authorization).toBeUndefined();
      expect(result.cyclic[0]).toBe("[CIRCULAR_REFERENCE]");
    });

    it("redacts credentials in bearer/basic auth, arbitrary sensitive assignments, and URL query parameters", () => {
      const value = "Authorization: Bearer bearer-secret; client_secret=client-secret; https://host/path?access%5Ftoken=url-secret&branch=main";
      const result = redactSensitiveData(value);

      expect(result).not.toContain("bearer-secret");
      expect(result).not.toContain("client-secret");
      expect(result).not.toContain("url-secret");
      expect(result).toContain("Bearer [REDACTED_TOKEN]");
      expect(result).toContain("branch=main");
    });

    it("returns a fixed safe error when an adapter throws sensitive details", async () => {
      const server = new OpenLensMcpServer(context({
        getResources: async () => {
          throw new Error("failed at https://k8s.example?token=adapter-secret with Bearer hidden-secret");
        },
      }));
      const response = await toolCall(server, "list_resources", {
        clusterId: "cluster-dev-01",
        resourceKind: "pods",
      });

      expect(response.error.code).toBe(-32000);
      expect(response.error.message).toBe("Tool execution failed.");
      expect(JSON.stringify(response)).not.toContain("adapter-secret");
      expect(JSON.stringify(response)).not.toContain("hidden-secret");
    });
  });
});
