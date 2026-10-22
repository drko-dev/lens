/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { OwnerCandidate } from "./owner-reference";
import { resolveOwnerReference } from "./owner-reference";

const obj = (uid: string, name: string, ns?: string, kind = "ReplicaSet"): OwnerCandidate => ({
  kind,
  getId: () => uid,
  getName: () => name,
  getNs: () => ns,
});

describe("R4-07 resolveOwnerReference", () => {
  const ref = { kind: "ReplicaSet", name: "rs", uid: "u1" };

  it("verifies by uid", () => {
    const rs = obj("u1", "rs", "ns");

    expect(resolveOwnerReference({ ...ref, namespace: "ns" }, [obj("u2", "other", "ns"), rs])).toEqual({ state: "verified", object: rs });
  });

  it("is stale when same name has another uid", () => {
    const current = obj("u2", "rs", "ns");

    expect(resolveOwnerReference({ ...ref, namespace: "ns" }, [current])).toEqual({ state: "stale", current });
  });

  it("is missing when not loaded or no store", () => {
    expect(resolveOwnerReference({ ...ref, namespace: "ns" }, [])).toEqual({ state: "missing" });
    expect(resolveOwnerReference({ ...ref, namespace: "ns" }, undefined)).toEqual({ state: "missing" });
  });

  it("does not match across namespaces", () => {
    expect(resolveOwnerReference({ ...ref, namespace: "ns" }, [obj("u1", "rs", "other")])).toEqual({ state: "missing" });
    expect(resolveOwnerReference({ ...ref, namespace: "ns" }, [obj("u9", "rs", "other")])).toEqual({ state: "missing" });
  });

  it("does not verify a ref without uid", () => {
    expect(resolveOwnerReference({ kind: "ReplicaSet", name: "rs", namespace: "ns" }, [obj("u1", "rs", "ns")]).state).toBe("stale");
  });

  it("handles cluster-scoped owners", () => {
    const node = obj("n1", "node-a", undefined, "Node");

    expect(resolveOwnerReference({ kind: "Node", name: "node-a", uid: "n1", namespace: "ns" }, [node])).toEqual({ state: "verified", object: node });
    expect(resolveOwnerReference({ kind: "Node", name: "node-a", uid: "n2", namespace: "ns" }, [node]).state).toBe("stale");
  });

  it("ignores candidates of another kind", () => {
    expect(resolveOwnerReference({ ...ref, namespace: "ns" }, [obj("u1", "rs", "ns", "Deployment")])).toEqual({ state: "missing" });
  });
});
