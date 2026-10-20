/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  OpenLensMcpServer,
  ALLOWLISTED_MCP_TOOLS,
  FORBIDDEN_WRITE_TOOLS,
  redactSensitiveData,
} from "../mcp-server";

describe("OpenLens DevOps R3-07: Local Read-Only MCP Server (stdio)", () => {
  let server: OpenLensMcpServer;

  beforeEach(() => {
    server = new OpenLensMcpServer({
      getClusters: () => [
        {
          id: "prod-cluster-1",
          name: "production-eu-west",
          environment: "Production",
          isProduction: true,
          isOnline: true,
        },
      ],
      getResources: async () => [
        { metadata: { name: "pod-1", namespace: "default" } },
        { metadata: { name: "pod-2", namespace: "default" } },
      ],
    });
  });

  describe("JSON-RPC Lifecycle & Handshake", () => {
    it("initializes successfully with server identity and capabilities", async () => {
      const res = await server.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      });

      expect(res.jsonrpc).toBe("2.0");
      expect(res.id).toBe(1);
      expect(res.result.serverInfo.name).toBe("openlens-devops-mcp");
      expect(res.result.serverInfo.version).toBe("6.5.3-devops");
      expect(res.result.capabilities.tools).toBeDefined();
    });

    it("handles ping and notifications cleanly", async () => {
      const notif = await server.handleRequest({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });
      expect(notif).toBeNull();

      const ping = await server.handleRequest({
        jsonrpc: "2.0",
        id: 2,
        method: "ping",
      });
      expect(ping.result).toEqual({});
    });
  });

  describe("Tool Discovery (tools/list)", () => {
    it("lists all allowlisted read-only tools and no write tools", async () => {
      const res = await server.handleRequest({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/list",
      });

      expect(res.result.tools.length).toBe(ALLOWLISTED_MCP_TOOLS.length);
      const toolNames = res.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain("list_clusters");
      expect(toolNames).toContain("list_resources");
      expect(toolNames).toContain("get_pod_logs");
      expect(toolNames).toContain("estimate_cluster_costs");

      // Verify no write tools in the list
      for (const forbidden of FORBIDDEN_WRITE_TOOLS) {
        expect(toolNames).not.toContain(forbidden);
      }
    });
  });

  describe("Allowlisted Read-Only Execution", () => {
    it("executes list_clusters safely with read-only declaration", async () => {
      const res = await server.handleRequest({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "list_clusters",
          arguments: {},
        },
      });

      expect(res.result.content[0].type).toBe("text");
      const parsed = JSON.parse(res.result.content[0].text);
      expect(parsed.clusters.length).toBe(1);
      expect(parsed.clusters[0].name).toBe("production-eu-west");
      expect(parsed.readOnlySafety).toContain("Enabled");
    });

    it("caps list_resources to maximum 50 items", async () => {
      const res = await server.handleRequest({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "list_resources",
          arguments: {
            clusterId: "prod-cluster-1",
            resourceKind: "pods",
            limit: 200, // Client requests 200
          },
        },
      });

      const parsed = JSON.parse(res.result.content[0].text);
      expect(parsed.count).toBeLessThanOrEqual(50);
    });
  });

  describe("Strict Safety & Write Rejection", () => {
    it("prohibits delete_resource and returns -32001 Forbidden error", async () => {
      const res = await server.handleRequest({
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: {
          name: "delete_resource",
          arguments: {
            clusterId: "prod-cluster-1",
            name: "critical-db",
          },
        },
      });

      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32001);
      expect(res.error.message).toContain("Operation Forbidden");
      expect(res.error.message).toContain("strictly in read-only mode");
    });

    it("prohibits pod_exec and shell operations", async () => {
      const res = await server.handleRequest({
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: {
          name: "pod_exec",
          arguments: {
            command: "rm -rf /",
          },
        },
      });

      expect(res.error.code).toBe(-32001);
      expect(res.error.message).toContain("Operation Forbidden");
    });
  });

  describe("Credential & Secret Redaction", () => {
    it("redacts tokens, passwords, and secret data fields", () => {
      const input = {
        kind: "Secret",
        metadata: { name: "db-credentials" },
        data: {
          password: "super-secret-password-1234567890",
          token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token-content",
        },
        other: "safe-value",
      };

      const redacted = redactSensitiveData(input);
      expect(redacted.data).toBe("[REDACTED_SECRET]");
      expect(redacted.other).toBe("safe-value");
    });
  });
});
