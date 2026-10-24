/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { computeItemsSignature, DataFreshnessTracker, deriveEvaluationState, getStoreLoadState, toClusterConnectionState } from "../data-state";

describe("NetworkPolicy data state derivation", () => {
  describe("getStoreLoadState", () => {
    it("reports an absent store", () => {
      expect(getStoreLoadState(undefined).state).toBe("absent");
    });

    it("reports a store that never loaded as not-loaded", () => {
      expect(getStoreLoadState({ items: [], isLoading: false, isLoaded: false, failedLoading: false }).state).toBe("not-loaded");
    });

    it("reports a loading store", () => {
      expect(getStoreLoadState({ items: [], isLoading: true, isLoaded: false, failedLoading: false }).state).toBe("loading");
    });

    it("reports a loaded store", () => {
      expect(getStoreLoadState({ items: [], isLoading: false, isLoaded: true, failedLoading: false }).state).toBe("loaded");
    });

    it("detects an RBAC denial", () => {
      const detail = getStoreLoadState({ items: [], failedLoading: true, lastError: { statusCode: 403 }});

      expect(detail.state).toBe("failed");
      expect(detail.isPermissionDenied).toBe(true);
    });

    it("detects an RBAC denial carried only by the error status", () => {
      const detail = getStoreLoadState({ items: [], failedLoading: true, lastError: { status: 403 }});

      expect(detail.isPermissionDenied).toBe(true);
    });
  });

  describe("deriveEvaluationState", () => {
    const loadedStore = { items: [], isLoading: false, isLoaded: true, failedLoading: false };

    it("is ready when every store completed a load", () => {
      const result = deriveEvaluationState({
        stores: [
          { name: "Pods", probe: loadedStore },
          { name: "Namespaces", probe: loadedStore },
          { name: "NetworkPolicies", probe: loadedStore },
        ],
      });

      expect(result.state).toBe("ready");
    });

    it("is ready when a loaded store is legitimately empty", () => {
      const result = deriveEvaluationState({
        stores: [
          { name: "Pods", probe: { items: [], isLoading: false, isLoaded: true, failedLoading: false }},
          { name: "Namespaces", probe: loadedStore },
          { name: "NetworkPolicies", probe: loadedStore },
        ],
      });

      expect(result.state).toBe("ready");
    });

    it("is unknown when a store is absent (never Default Allow)", () => {
      const result = deriveEvaluationState({
        stores: [
          { name: "Pods", probe: undefined },
          { name: "Namespaces", probe: loadedStore },
          { name: "NetworkPolicies", probe: loadedStore },
        ],
      });

      expect(result.state).toBe("unknown");
      expect(result.reason).toContain("no está disponible");
    });

    it("is unknown when a store never initialized", () => {
      const result = deriveEvaluationState({
        stores: [
          { name: "Pods", probe: { items: [], isLoading: false, isLoaded: false, failedLoading: false }},
          { name: "Namespaces", probe: loadedStore },
          { name: "NetworkPolicies", probe: loadedStore },
        ],
      });

      expect(result.state).toBe("unknown");
      expect(result.reason).toContain("no se inicializó");
    });

    it("is loading while a store is loading", () => {
      const result = deriveEvaluationState({
        stores: [
          { name: "Pods", probe: { items: [], isLoading: true, isLoaded: false, failedLoading: false }},
          { name: "Namespaces", probe: loadedStore },
          { name: "NetworkPolicies", probe: loadedStore },
        ],
      });

      expect(result.state).toBe("loading");
    });

    it("is permission-denied on an RBAC 403", () => {
      const result = deriveEvaluationState({
        stores: [
          { name: "Pods", probe: { items: [], isLoading: false, isLoaded: false, failedLoading: true, lastError: { statusCode: 403 }}},
          { name: "Namespaces", probe: loadedStore },
          { name: "NetworkPolicies", probe: loadedStore },
        ],
      });

      expect(result.state).toBe("permission-denied");
    });

    it("is partial-data when a store failed with a non RBAC error", () => {
      const result = deriveEvaluationState({
        stores: [
          { name: "Pods", probe: loadedStore },
          { name: "Namespaces", probe: { items: [], isLoading: false, isLoaded: false, failedLoading: true, lastError: { statusCode: 500 }}},
          { name: "NetworkPolicies", probe: loadedStore },
        ],
      });

      expect(result.state).toBe("partial-data");
    });

    it("is disconnected when the cluster is disconnected, even if the stores are fine", () => {
      const result = deriveEvaluationState({
        cluster: { id: "cluster-a", disconnected: true },
        stores: [
          { name: "Pods", probe: loadedStore },
          { name: "Namespaces", probe: loadedStore },
          { name: "NetworkPolicies", probe: loadedStore },
        ],
      });

      expect(result.state).toBe("disconnected");
    });

    it("is loading while the connection to the cluster is still being established", () => {
      const result = deriveEvaluationState({
        cluster: { id: "cluster-a", disconnected: false, online: false, accessible: false },
        stores: [
          { name: "Pods", probe: loadedStore },
          { name: "Namespaces", probe: loadedStore },
          { name: "NetworkPolicies", probe: loadedStore },
        ],
      });

      expect(result.state).toBe("loading");
      expect(result.cause).toBe("cluster-connecting");
    });

    it("is permission-denied for a reachable but inaccessible cluster", () => {
      const result = deriveEvaluationState({
        cluster: { id: "cluster-a", disconnected: false, online: true, accessible: false },
        stores: [
          { name: "Pods", probe: loadedStore },
          { name: "Namespaces", probe: loadedStore },
          { name: "NetworkPolicies", probe: loadedStore },
        ],
      });

      expect(result.state).toBe("permission-denied");
      expect(result.cause).toBe("cluster-inaccessible");
    });

    it("prefers the explicit disconnection over any other cluster condition", () => {
      const result = deriveEvaluationState({
        cluster: { id: "cluster-a", disconnected: true, online: false, accessible: false },
        stores: [
          { name: "Pods", probe: loadedStore },
          { name: "Namespaces", probe: loadedStore },
          { name: "NetworkPolicies", probe: loadedStore },
        ],
      });

      expect(result.state).toBe("disconnected");
      expect(result.cause).toBe("cluster-disconnected");
    });

    it("distinguishes a store RBAC denial from an inaccessible cluster", () => {
      const result = deriveEvaluationState({
        stores: [
          { name: "Pods", probe: { items: [], isLoading: false, isLoaded: false, failedLoading: true, lastError: { statusCode: 403 }}},
        ],
      });

      expect(result.state).toBe("permission-denied");
      expect(result.cause).toBe("store-permission-denied");
    });

    it("prefers permission-denied over loading", () => {
      const result = deriveEvaluationState({
        stores: [
          { name: "Pods", probe: { items: [], isLoading: true, isLoaded: false, failedLoading: false }},
          { name: "Namespaces", probe: { items: [], isLoading: false, isLoaded: false, failedLoading: true, lastError: { statusCode: 403 }}},
          { name: "NetworkPolicies", probe: loadedStore },
        ],
      });

      expect(result.state).toBe("permission-denied");
    });
  });
});

describe("NetworkPolicy data signatures and freshness", () => {
  const item = (id: string, resourceVersion: string, labels: Record<string, string> = {}, spec: unknown = undefined) => ({
    getId: () => id,
    getResourceVersion: () => resourceVersion,
    metadata: { labels },
    spec,
  });

  it("keeps the signature stable while nothing changes", () => {
    const stable = item("a", "1");

    expect(computeItemsSignature([stable])).toBe(computeItemsSignature([stable]));
  });

  it("changes the signature when a resource version changes", () => {
    expect(computeItemsSignature([item("a", "1")])).not.toBe(computeItemsSignature([item("a", "2")]));
  });

  it("changes the signature when the collection membership changes", () => {
    expect(computeItemsSignature([item("a", "1")])).not.toBe(computeItemsSignature([item("a", "1"), item("b", "1")]));
  });

  it("changes the signature when labels change", () => {
    expect(computeItemsSignature([item("a", "1", { app: "x" })])).not.toBe(computeItemsSignature([item("a", "1", { app: "y" })]));
  });

  it("changes the signature when the spec changes", () => {
    const before = computeItemsSignature([item("a", "1", {}, { port: 80 })], true);
    const after = computeItemsSignature([item("a", "1", {}, { port: 443 })], true);

    expect(before).not.toBe(after);
  });

  it("detects fresh resources re-delivered with new instances", () => {
    const before = computeItemsSignature([item("a", "1")]);
    const after = computeItemsSignature([item("a", "1")]);

    // Same logical resource, but the store delivered a new instance
    expect(after).not.toBe(before);
  });

  it("flags the data of a store as stale after losing the connection and clears it with fresh resources", () => {
    const tracker = new DataFreshnessTracker();
    const store = { signature: "sig-1", isLoading: false, clusterId: "cluster-a", connectionLost: false };

    expect(tracker.updateStore("networkPolicies", store)).toBe(false);

    expect(tracker.updateStore("networkPolicies", { ...store, connectionLost: true })).toBe(true);
    expect(tracker.updateStore("networkPolicies", store)).toBe(true);
    expect(tracker.updateStore("networkPolicies", { ...store, signature: "sig-2" })).toBe(false);
  });

  it("flags the data of a store as stale when the cluster changes", () => {
    const tracker = new DataFreshnessTracker();
    const store = { signature: "sig-1", isLoading: false, clusterId: "cluster-a", connectionLost: false };

    expect(tracker.updateStore("networkPolicies", store)).toBe(false);
    expect(tracker.updateStore("networkPolicies", { ...store, clusterId: "cluster-b" })).toBe(true);
    expect(tracker.updateStore("networkPolicies", { ...store, clusterId: "cluster-b", signature: "sig-2" })).toBe(true);
    expect(tracker.updateStore("networkPolicies", { ...store, clusterId: "cluster-b", isLoading: true })).toBe(true);
    expect(tracker.updateStore("networkPolicies", { ...store, clusterId: "cluster-b", isLoading: false })).toBe(false);
  });

  it("never certifies a store through a change exclusive to another store", () => {
    const tracker = new DataFreshnessTracker();

    expect(tracker.updateStore("networkPolicies", { signature: "policies-1", isLoading: false, clusterId: "cluster-a", connectionLost: false })).toBe(false);

    // The connection is lost: the NetworkPolicies become stale
    expect(tracker.updateStore("networkPolicies", { signature: "policies-1", isLoading: false, clusterId: "cluster-a", connectionLost: true })).toBe(true);

    // Only the Pods change: the NetworkPolicies stay stale
    expect(tracker.updateStore("pods", { signature: "pods-2", isLoading: false, clusterId: "cluster-a", connectionLost: false })).toBe(false);
    expect(tracker.updateStore("networkPolicies", { signature: "policies-1", isLoading: false, clusterId: "cluster-a", connectionLost: false })).toBe(true);
    expect(tracker.isAnyStale()).toBe(true);

    // Only the Namespaces change: the NetworkPolicies stay stale
    expect(tracker.updateStore("namespaces", { signature: "ns-2", isLoading: false, clusterId: "cluster-a", connectionLost: false })).toBe(false);
    expect(tracker.updateStore("networkPolicies", { signature: "policies-1", isLoading: false, clusterId: "cluster-a", connectionLost: false })).toBe(true);

    // The NetworkPolicyStore confirms its own reload
    expect(tracker.updateStore("networkPolicies", { signature: "policies-1", isLoading: true, clusterId: "cluster-a", connectionLost: false })).toBe(true);
    expect(tracker.updateStore("networkPolicies", { signature: "policies-1", isLoading: false, clusterId: "cluster-a", connectionLost: false })).toBe(false);
    expect(tracker.isAnyStale()).toBe(false);
  });

  it("keeps the data stale when the content changes while the connection is lost", () => {
    const tracker = new DataFreshnessTracker();
    const store = { signature: "policies-1", isLoading: false, clusterId: "cluster-a", connectionLost: false };

    expect(tracker.updateStore("networkPolicies", store)).toBe(false);

    // The connection is lost and the store delivers new content: it must stay stale
    expect(tracker.updateStore("networkPolicies", { ...store, connectionLost: true })).toBe(true);
    expect(tracker.updateStore("networkPolicies", { ...store, connectionLost: true, signature: "policies-2" })).toBe(true);
  });

  it("keeps the data stale when a load finishes during the disconnection", () => {
    const tracker = new DataFreshnessTracker();
    const store = { signature: "policies-1", isLoading: false, clusterId: "cluster-a", connectionLost: false };

    expect(tracker.updateStore("networkPolicies", store)).toBe(false);

    // The load starts and finishes while the connection is lost
    expect(tracker.updateStore("networkPolicies", { ...store, connectionLost: true, isLoading: true })).toBe(true);
    expect(tracker.updateStore("networkPolicies", { ...store, connectionLost: true, isLoading: false })).toBe(true);

    // The connection is restored without any reload: the data is still stale
    expect(tracker.updateStore("networkPolicies", store)).toBe(true);
  });

  it("requires a valid update or a verified reload after the connection is restored", () => {
    const tracker = new DataFreshnessTracker();
    const store = { signature: "policies-1", isLoading: false, clusterId: "cluster-a", connectionLost: false };

    tracker.updateStore("networkPolicies", { ...store, connectionLost: true });
    tracker.updateStore("networkPolicies", { ...store, connectionLost: true, isLoading: true });
    tracker.updateStore("networkPolicies", { ...store, connectionLost: true, isLoading: false });

    // Reconnection alone does not certify anything
    expect(tracker.updateStore("networkPolicies", store)).toBe(true);

    // A valid update delivered by the store while connected certifies it
    expect(tracker.updateStore("networkPolicies", { ...store, signature: "policies-2" })).toBe(false);
  });

  it("does not certify a store when the reload failed", () => {
    const tracker = new DataFreshnessTracker();
    const store = { signature: "policies-1", isLoading: false, clusterId: "cluster-a", connectionLost: false };

    expect(tracker.updateStore("networkPolicies", store)).toBe(false);

    expect(tracker.updateStore("networkPolicies", { ...store, isLoading: true })).toBe(false);

    // The reload failed: it must not certify fresh data
    expect(tracker.updateStore("networkPolicies", { ...store, isLoading: false, loadFailed: true })).toBe(true);

    // A later successful delivery by the store certifies it again
    expect(tracker.updateStore("networkPolicies", { ...store, signature: "policies-2" })).toBe(false);
  });

  it("clears the staleness of a store when it confirms a reload without content changes", () => {
    const tracker = new DataFreshnessTracker();
    const store = { signature: "policies-1", isLoading: false, clusterId: "cluster-a", connectionLost: false };

    expect(tracker.updateStore("networkPolicies", store)).toBe(false);
    expect(tracker.updateStore("networkPolicies", { ...store, connectionLost: true })).toBe(true);
    expect(tracker.updateStore("networkPolicies", { ...store, isLoading: true })).toBe(true);
    expect(tracker.updateStore("networkPolicies", { ...store, isLoading: false })).toBe(false);
  });

  it("normalizes observable cluster flags into plain values", () => {
    const state = toClusterConnectionState({
      id: "cluster-a",
      disconnected: { get: () => true },
      online: { get: () => false },
      accessible: { get: () => true },
    });

    expect(state).toEqual({ id: "cluster-a", disconnected: true, online: false, accessible: true, ready: undefined });
  });
});
