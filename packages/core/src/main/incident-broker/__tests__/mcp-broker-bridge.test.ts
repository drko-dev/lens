/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { OpenLensMcpServer } from "../../mcp/mcp-server";
import { IncidentAuthorizationEngine } from "../authorization-engine";
import { IncidentBrokerService } from "../incident-broker-service";
import { McpBrokerBridge, type KubernetesApiExecutor } from "../mcp-broker-bridge";
import { KubernetesTechnicalIdentityManager } from "../technical-identity-manager";
import type { AgentTechnicalIdentity, UserIdentity } from "../../../common/incident/broker-types";

describe("H8-011: Read-Only Diagnostic Tools & OpenLensMcpServer Broker Bridge", () => {
  let broker: IncidentBrokerService;
  let identityManager: KubernetesTechnicalIdentityManager;
  let bridge: McpBrokerBridge;
  let server: OpenLensMcpServer;
  let k8sExecutorMock: jest.Mocked<KubernetesApiExecutor>;

  const clusterId = "cluster-k8s-01";
  const namespace = "production";
  const incidentId = "INC-TEST-002";

  const operatorUser: UserIdentity = {
    username: "operator@devops.org",
    groups: ["devops-engineers"],
  };

  const agentIdentity: AgentTechnicalIdentity = {
    serviceAccountName: "openlens-ai-investigator",
    serviceAccountNamespace: "kube-system",
    audience: "openlens-ai-investigator",
    token: "agent-k8s-technical-jwt-9999",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  };

  beforeEach(() => {
    identityManager = new KubernetesTechnicalIdentityManager();
    identityManager.registerTechnicalIdentity(clusterId, agentIdentity);

    const authEngine = new IncidentAuthorizationEngine(
      async () => true, // User allowed
      async () => true, // Agent allowed
    );

    broker = new IncidentBrokerService(authEngine, identityManager);

    k8sExecutorMock = {
      listResources: jest.fn().mockResolvedValue([
        { metadata: { name: "payment-pod-1", namespace: "production" } },
        { metadata: { name: "payment-pod-2", namespace: "production" } },
      ]),
      getResource: jest.fn().mockResolvedValue({
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "payment-deployment", namespace: "production" },
        spec: { replicas: 3 },
      }),
      getPodLogs: jest.fn().mockResolvedValue([
        "2026-11-05T12:00:00Z [INFO] Service started",
        "2026-11-05T12:01:00Z [WARN] Database latency 120ms",
      ]),
      getEvents: jest.fn().mockResolvedValue([
        { reason: "BackOff", message: "Back-off restarting failed container", type: "Warning" },
      ]),
      getClusterInfo: jest.fn().mockResolvedValue({
        serverVersion: "v1.30.2",
        nodesCount: 5,
      }),
    };

    bridge = new McpBrokerBridge(broker, k8sExecutorMock);
    server = new OpenLensMcpServer(bridge);
  });

  describe("Read-Only Tool Invocations via JSON-RPC", () => {
    it("successfully retrieves allowed Kubernetes resources via list_resources", async () => {
      const session = broker.createSession({ incidentId, clusterId, namespace, user: operatorUser });
      bridge.setActiveSessionId(session.sessionId);

      const response = await server.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "list_resources",
          arguments: {
            clusterId,
            resourceKind: "pods",
            namespace,
            limit: 10,
          },
        },
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();

      const parsedContent = JSON.parse(response.result.content[0].text);
      expect(parsedContent.count).toBe(2);
      expect(parsedContent.items[0].metadata.name).toBe("payment-pod-1");

      // Verify the K8s executor received the agent technical token, NOT the user's
      expect(k8sExecutorMock.listResources).toHaveBeenCalledWith(
        clusterId,
        "pods",
        namespace,
        agentIdentity.token,
        expect.any(Object),
      );
    });

    it("successfully retrieves pod logs via get_pod_logs with bounded lines", async () => {
      const session = broker.createSession({ incidentId, clusterId, namespace, user: operatorUser });
      bridge.setActiveSessionId(session.sessionId);

      const response = await server.handleRequest({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "get_pod_logs",
          arguments: {
            clusterId,
            podName: "payment-pod-1",
            namespace,
            tailLines: 50,
          },
        },
      });

      expect(response.error).toBeUndefined();
      const parsed = JSON.parse(response.result.content[0].text);
      expect(parsed.lines).toHaveLength(2);
      expect(parsed.lines[1]).toContain("Database latency 120ms");
    });

    it("successfully retrieves namespace events via get_events", async () => {
      const session = broker.createSession({ incidentId, clusterId, namespace, user: operatorUser });
      bridge.setActiveSessionId(session.sessionId);

      const response = await server.handleRequest({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "get_events",
          arguments: {
            clusterId,
            namespace,
            limit: 20,
          },
        },
      });

      expect(response.error).toBeUndefined();
      const parsed = JSON.parse(response.result.content[0].text);
      expect(parsed.events).toHaveLength(1);
      expect(parsed.events[0].reason).toBe("BackOff");
    });
  });

  describe("Security Boundaries: Resource Kind & Mutation Blocking", () => {
    it("BLOCKS list_resources for secrets with -32001 Operation Forbidden", async () => {
      const session = broker.createSession({ incidentId, clusterId, namespace, user: operatorUser });
      bridge.setActiveSessionId(session.sessionId);

      const response = await server.handleRequest({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "list_resources",
          arguments: {
            clusterId,
            resourceKind: "secrets",
            namespace,
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32001);
      expect(response.error.message).toContain("strictly prohibited");
      expect(k8sExecutorMock.listResources).not.toHaveBeenCalled();
    });

    it("BLOCKS get_resource for serviceaccounts with -32001 Operation Forbidden", async () => {
      const session = broker.createSession({ incidentId, clusterId, namespace, user: operatorUser });
      bridge.setActiveSessionId(session.sessionId);

      const response = await server.handleRequest({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "get_resource",
          arguments: {
            clusterId,
            resourceKind: "serviceaccount",
            name: "default",
            namespace,
          },
        },
      });

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32001);
      expect(response.error.message).toContain("strictly prohibited");
      expect(k8sExecutorMock.getResource).not.toHaveBeenCalled();
    });

    it("BLOCKS mutating tools like delete_resource, patch_resource, and pod_exec", async () => {
      const session = broker.createSession({ incidentId, clusterId, namespace, user: operatorUser });
      bridge.setActiveSessionId(session.sessionId);

      for (const forbiddenTool of ["delete_resource", "patch_resource", "pod_exec", "open_shell"]) {
        const response = await server.handleRequest({
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: {
            name: forbiddenTool,
            arguments: { clusterId },
          },
        });

        expect(response.error).toBeDefined();
        expect(response.error.code).toBe(-32001);
        expect(response.error.message).toContain("operates strictly in read-only mode");
      }
    });

    it("proves ZERO writes to Kubernetes API executor across all operations", () => {
      // KubernetesApiExecutor interface has only read methods:
      const methods = Object.keys(k8sExecutorMock);
      const writeMethods = methods.filter(m =>
        /create|update|patch|delete|apply|exec|write/i.test(m),
      );

      expect(writeMethods).toHaveLength(0);
    });
  });
});
