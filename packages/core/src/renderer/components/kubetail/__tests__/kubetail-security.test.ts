/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import DOMPurify from "dompurify";
import { KubetailStore } from "../kubetail-store";
import type { DeploymentStore } from "../../workloads-deployments/store";
import type { PodStore } from "../../workloads-pods/store";
import type { KubetailStreamClient, StreamCallbacks } from "../kubetail-stream-client.injectable";
import { stripAnsiCodes } from "../../dock/logs/log-buffer-utils";

describe("Kubetail Milestone 5: Security, RBAC & Sanitization", () => {
  let mockDeploymentStore: Partial<DeploymentStore>;
  let mockPodStore: Partial<PodStore>;
  let streamCallbacks: StreamCallbacks;

  const mockStreamClient: KubetailStreamClient = {
    startStream: (params, callbacks) => {
      streamCallbacks = callbacks;
      return { abort: jest.fn() };
    },
  };

  const mockPod: any = {
    getName: () => "auth-pod-1",
    getNs: () => "kube-system",
    getContainers: () => [{ name: "c1" }],
    getOwnerRefs: () => [{ name: "auth-deploy" }],
  };

  beforeEach(() => {
    mockDeploymentStore = {
      items: [{ getName: () => "auth-deploy", getNs: () => "kube-system" } as any],
      getChildPods: () => [mockPod],
    } as any;
    mockPodStore = { items: [mockPod] } as any;
  });

  describe("RBAC & Authentication Failure Handling", () => {
    it("immediately halts reconnect retries on HTTP 403 Forbidden without API spam", () => {
      const store = new KubetailStore({
        deploymentStore: mockDeploymentStore as DeploymentStore,
        podStore: mockPodStore as PodStore,
        streamClient: mockStreamClient,
      });

      store.selectWorkloadFromNavigation({
        kind: "Deployment",
        name: "auth-deploy",
        namespace: "kube-system",
      });

      const streamKey = "auth-pod-1/c1";
      expect(store.activeStreams.get(streamKey)?.status).toBe("STREAMING");

      // Simulate API server returning HTTP 403 (User lacks 'pods/log' RBAC)
      streamCallbacks.onError(new Error("Request failed with status code 403"), 403);

      const stream = store.activeStreams.get(streamKey);
      expect(stream?.status).toBe("ERROR");
      expect(stream?.error).toContain("HTTP 403 Forbidden");

      // Verify no reconnect timers are scheduled
      expect((store as any).retryTimers.has(streamKey)).toBe(false);

      store.destroy();
    });

    it("immediately halts reconnect retries on HTTP 401 Unauthorized", () => {
      const store = new KubetailStore({
        deploymentStore: mockDeploymentStore as DeploymentStore,
        podStore: mockPodStore as PodStore,
        streamClient: mockStreamClient,
      });

      store.selectWorkloadFromNavigation({
        kind: "Deployment",
        name: "auth-deploy",
        namespace: "kube-system",
      });

      const streamKey = "auth-pod-1/c1";

      // Simulate token expiration / 401
      streamCallbacks.onError(new Error("Unauthorized"), 401);

      const stream = store.activeStreams.get(streamKey);
      expect(stream?.status).toBe("ERROR");
      expect(stream?.error).toContain("HTTP 401 Unauthorized");
      expect((store as any).retryTimers.has(streamKey)).toBe(false);

      store.destroy();
    });
  });

  describe("Log Sanitization & XSS Defense", () => {
    it("neutralizes malicious script tags and event handlers in log lines via DOMPurify", () => {
      const dirtyPayload = "<script>window.pwned=true;</script><img src='x' onerror='alert(1)' />[INFO] User logged in <a href='javascript:void(0)'>Click</a>";

      const sanitized = DOMPurify.sanitize(dirtyPayload);

      expect(sanitized).not.toContain("<script>");
      expect(sanitized).not.toContain("window.pwned");
      expect(sanitized).not.toContain("onerror");
      expect(sanitized).not.toContain("javascript:");
      expect(sanitized).toContain("[INFO] User logged in");
    });

    it("completely strips ANSI control sequences in plain text exports", () => {
      const coloredLog = "\u001b[31;1m[ERROR]\u001b[0m \u001b[32mConnection established\u001b[0m \u001b[34;4m(id=99)\u001b[0m";

      const clean = stripAnsiCodes(coloredLog);

      expect(clean).toBe("[ERROR] Connection established (id=99)");
      expect(clean).not.toContain("\u001b");
      expect(clean).not.toContain("[31;1m");
    });

    it("generates strictly valid JSONL output without unescaped special characters", () => {
      const store = new KubetailStore({
        deploymentStore: mockDeploymentStore as DeploymentStore,
        podStore: mockPodStore as PodStore,
        streamClient: mockStreamClient,
      });

      store.selectWorkloadFromNavigation({
        kind: "Deployment",
        name: "auth-deploy",
        namespace: "kube-system",
      });

      streamCallbacks.onLine('2026-11-01T12:00:00.000Z {"event":"login","details":"quotes \\" and \n newlines"}');
      (store as any).flushBatch();

      const jsonl = store.exportLogs("jsonl", false, "prod-cluster");
      const lines = jsonl.trim().split("\n");

      expect(lines.length).toBe(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.cluster).toBe("prod-cluster");
      expect(parsed.pod).toBe("auth-pod-1");
      expect(parsed.message).toContain('{"event":"login"');

      store.destroy();
    });
  });

  describe("Input & URL Parameter Validation", () => {
    it("rejects malicious or invalid workload kinds from URL params gracefully", () => {
      const store = new KubetailStore({
        deploymentStore: mockDeploymentStore as DeploymentStore,
        podStore: mockPodStore as PodStore,
        streamClient: mockStreamClient,
      });

      const result = store.selectWorkloadFromNavigation({
        kind: "<script>alert(1)</script>" as any,
        name: "auth-deploy",
        namespace: "kube-system",
      });

      expect(result).toBe(false);
      expect(store.selectedResource).toBeUndefined();

      store.destroy();
    });

    it("persists only safe visual presentation preferences in local storage", () => {
      let storedData: any = null;
      const mockStorage = {
        get: () => storedData,
        set: (data: any) => { storedData = data; },
      };

      const store = new KubetailStore({
        deploymentStore: mockDeploymentStore as DeploymentStore,
        podStore: mockPodStore as PodStore,
        streamClient: mockStreamClient,
        createStorage: () => mockStorage as any,
      });

      store.toggleAutoScroll();

      expect(storedData).toBeDefined();
      const keys = Object.keys(storedData);
      expect(keys.sort()).toEqual(["autoFollowNewReplicas", "autoScroll", "maxLines"]);

      // Verify no logs, tokens, or kubeconfig data are in storage
      expect(storedData.logs).toBeUndefined();
      expect(storedData.token).toBeUndefined();
      expect(storedData.kubeconfig).toBeUndefined();

      store.destroy();
    });
  });
});
