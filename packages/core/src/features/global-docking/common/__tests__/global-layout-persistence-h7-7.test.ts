/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { PanelKind } from "../../../../renderer/components/split-panel/split-panel-types";
import { GLOBAL_LAYOUT_VERSION, globalLayoutStorageKeys, restoreGlobalLayout, serializeGlobalLayout } from "../global-layout-persistence";

const leaf = (id: string, panelKind: string, extra: Record<string, unknown> = {}) => ({ type: "leaf", id, panelKind, ...extra });
const group = (id: string, panels: unknown[], activePanelId?: string) => ({ type: "group", id, activePanelId: activePanelId ?? (panels[0] as any)?.id, panels });
const branch = (id: string, first: unknown, second: unknown, ratio = 0.5, orientation = "horizontal") => ({ type: "branch", id, orientation, ratio, first, second });

const kinds: readonly PanelKind[] = ["pods", "deployments", "services", "terminal", "pod-logs", "resource-editor", "kubetail", "resource-details"];
const clusterCtx = { scope: "cluster" as const, clusterId: "A", allowedKinds: kinds, singleInstance: true };
const ser = (root: unknown, over: Record<string, unknown> = {}) => serializeGlobalLayout({ scope: "cluster", clusterId: "A", rootNode: root as never, collapsedLeafIds: [], now: 1, ...over } as never)!;
const raw = (over: Record<string, unknown>) => JSON.stringify({
  version: 1, scope: "cluster", clusterId: "A", root: leaf("l1", "pods"), collapsedLeafIds: [], updatedAt: 1, ...over,
});

describe("global layout persistence (H7.7, pure)", () => {
  it("round-trips a nested tree with a tab group, active tab, ratios and collapsed ids", () => {
    const tree = branch("b1", group("g1", [leaf("l1", "pods", { title: "Pods" }), leaf("l2", "services")], "l2"), branch("b2", leaf("l3", "deployments"), leaf("l4", "kubetail"), 0.3, "vertical"), 0.7);
    const r = restoreGlobalLayout(ser(tree, { collapsedLeafIds: ["l3"] }), clusterCtx);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rootNode).toEqual(tree);
      expect(r.collapsedLeafIds).toEqual(["l3"]);
      expect(r.dropped).toBe(0);
    }
  });

  it("uses versioned keys that never collide with the Kubetail layout", () => {
    const a = globalLayoutStorageKeys({ scope: "cluster", clusterId: "A" });
    const root = globalLayoutStorageKeys({ scope: "root" });

    expect(a.primary).toBe("openlens:global-layout:v1:A");
    expect(root.primary).toBe("openlens:root-layout:v1");
    expect(new Set([a.primary, a.previous, a.corrupted, root.primary, root.previous, root.corrupted]).size).toBe(6);
    [a, root].forEach((k) => Object.values(k).forEach((v) => expect(v.startsWith("openlens:split-layout")).toBe(false)));
    expect(GLOBAL_LAYOUT_VERSION).toBe(1);
  });

  it.each([
    [null, "empty"], ["", "empty"], ["{not json", "malformed"], ["[]", "malformed"], ["42", "malformed"],
    [JSON.stringify({ scope: "cluster", clusterId: "A", root: leaf("l", "pods") }), "unknown-version"],
    [raw({ version: 2 }), "unknown-version"],
    [raw({ scope: "root" }), "scope-mismatch"],
    [raw({ clusterId: "B" }), "cluster-mismatch"],
    [raw({ root: { type: "bogus" } }), "invalid-tree"],
    [raw({ root: leaf("l", "nope") }), "invalid-tree"],
  ])("rejects %s as %s", (input, reason) => {
    expect(restoreGlobalLayout(input as never, clusterCtx)).toEqual({ ok: false, reason });
  });

  it("rejects a root layout for a cluster and vice versa", () => {
    const rootRaw = serializeGlobalLayout({ scope: "root", rootNode: leaf("l", "pods") as never, collapsedLeafIds: [], now: 1 })!;

    expect(restoreGlobalLayout(rootRaw, clusterCtx)).toEqual({ ok: false, reason: "scope-mismatch" });
    expect(restoreGlobalLayout(ser(leaf("l", "pods")), { scope: "root", allowedKinds: kinds, singleInstance: true })).toEqual({ ok: false, reason: "scope-mismatch" });
  });

  it("enforces depth, node and panel limits", () => {
    let deep: unknown = leaf("x", "pods");

    for (let i = 0; i < 9; i++) {
      deep = branch(`b${i}`, deep, leaf(`s${i}`, "services"));
    }
    expect(restoreGlobalLayout(raw({ root: deep }), { ...clusterCtx, singleInstance: false })).toEqual({ ok: false, reason: "invalid-tree" });

    const many = group("g", Array.from({ length: 25 }, (_, i) => leaf(`p${i}`, "pods")));

    expect(restoreGlobalLayout(raw({ root: many }), { ...clusterCtx, singleInstance: false })).toEqual({ ok: false, reason: "invalid-tree" });

    let wide: unknown = leaf("w0", "pods");

    for (let i = 1; i < 40; i++) {
      wide = branch(`wb${i}`, wide, leaf(`w${i}`, "pods"));
    }
    expect(restoreGlobalLayout(raw({ root: wide }), { ...clusterCtx, singleInstance: false })).toEqual({ ok: false, reason: "invalid-tree" });
  });

  it("clamps ratios and defaults non-finite ones", () => {
    const r1 = restoreGlobalLayout(raw({ root: branch("b", leaf("a", "pods"), leaf("c", "services"), 0.01) }), clusterCtx);
    const r2 = restoreGlobalLayout(raw({ root: branch("b", leaf("a", "pods"), leaf("c", "services"), 5) }), clusterCtx);
    const r3 = restoreGlobalLayout(raw({ root: branch("b", leaf("a", "pods"), leaf("c", "services"), "x" as never) }), clusterCtx);

    expect((r1 as any).rootNode.ratio).toBe(0.15);
    expect((r2 as any).rootNode.ratio).toBe(0.85);
    expect((r3 as any).rootNode.ratio).toBe(0.5);
  });

  it("drops invalid orientation to a valid default", () => {
    const r = restoreGlobalLayout(raw({ root: branch("b", leaf("a", "pods"), leaf("c", "services"), 0.5, "diagonal") }), clusterCtx);

    expect((r as any).rootNode.orientation).toBe("horizontal");
  });

  it("drops unknown kinds, disallowed kinds and singleton duplicates, keeping the valid part", () => {
    const tree = branch("b", branch("b2", leaf("a", "pods"), leaf("u", "unknown-kind")), branch("b3", leaf("d", "pods"), leaf("n", "nodes")));
    const r = restoreGlobalLayout(raw({ root: tree, collapsedLeafIds: ["a", "u", "d"] }), clusterCtx);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rootNode).toEqual(leaf("a", "pods"));
      expect(r.dropped).toBe(3);
      expect(r.collapsedLeafIds).toEqual(["a"]);
    }
  });

  it("keeps multiple instances of identity-bound kinds under singleInstance", () => {
    const tree = group("g", [
      leaf("d1", "resource-details", { resourceBinding: { clusterId: "A", kind: "Pod", name: "p1" } }),
      leaf("d2", "resource-details", { resourceBinding: { clusterId: "A", kind: "Pod", name: "p2" } }),
    ]);
    const r = restoreGlobalLayout(raw({ root: tree }), clusterCtx);

    expect(r.ok && (r.rootNode as any).panels).toHaveLength(2);
  });

  it("drops duplicate leaf ids", () => {
    const r = restoreGlobalLayout(raw({ root: group("g", [leaf("a", "pods"), leaf("a", "services")]) }), { ...clusterCtx, singleInstance: false });

    expect(r.ok && (r.rootNode as any).panels.map((p: any) => p.id)).toEqual(["a"]);
    expect((r as any).dropped).toBe(1);
  });

  it("drops leaves bound to another cluster", () => {
    const tree = branch("b", leaf("a", "pods"), leaf("x", "resource-details", { resourceBinding: { clusterId: "B", kind: "Pod", name: "p" } }));
    const r = restoreGlobalLayout(raw({ root: tree }), clusterCtx);

    expect(r.ok && r.rootNode).toEqual(leaf("a", "pods"));
  });

  it("prunes empty groups, collapses single-child branches and repairs the active tab", () => {
    const tree = branch("b", group("empty", []), group("g", [leaf("a", "pods"), leaf("c", "services")], "ghost"));
    const r = restoreGlobalLayout(raw({ root: tree }), clusterCtx);

    expect(r.ok && r.rootNode).toEqual(group("g", [leaf("a", "pods"), leaf("c", "services")], "a"));
  });

  it("restores a terminal with a fresh tabId and marks session kinds inert", () => {
    const tree = branch("b1", group("g", [
      leaf("t", "terminal", { resourceBinding: { clusterId: "A", kind: "Terminal", name: "Terminal", tabId: "docked-terminal:A:old" } }),
      leaf("lg", "pod-logs", { resourceBinding: { clusterId: "A", kind: "Pod", name: "p", container: "c", tabId: "docked-logs:A" } }),
    ]), branch("b2", leaf("ed", "resource-editor"), leaf("kt", "kubetail")));
    const r = restoreGlobalLayout(raw({ root: tree }), { ...clusterCtx, generateId: () => "fresh" });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect([...r.inertLeafIds].sort()).toEqual(["ed", "kt", "lg", "t"]);
      expect(JSON.stringify(r.rootNode)).toContain("docked-terminal:A:fresh");
      expect(JSON.stringify(r.rootNode)).not.toContain("docked-terminal:A:old");
      expect(JSON.stringify(r.rootNode)).toContain("docked-logs:A");
    }
  });

  it("generates a different terminal tabId each restore by default", () => {
    const term = leaf("t", "terminal", { resourceBinding: { clusterId: "A", kind: "Terminal", name: "Terminal", tabId: "old" } });
    const tabId = (s: string) => ((restoreGlobalLayout(s, clusterCtx) as any).rootNode.resourceBinding.tabId as string);
    const s = ser(term);

    expect(tabId(s)).toMatch(/^docked-terminal:A:/);
    expect(tabId(s)).not.toBe(tabId(s));
  });

  it("never serializes sensitive or unknown fields", () => {
    const tree = leaf("t", "terminal", {
      token: "tok", password: "pw", grantId: "g", buffer: "secret output", content: "yaml",
      resourceBinding: { clusterId: "A", kind: "Terminal", name: "Terminal", tabId: "x", token: "tok2", authHeader: "Bearer z" },
    });
    const out = ser(tree);

    ["tok", "pw", "grantId", "secret output", "yaml", "tok2", "Bearer", "buffer", "password"].forEach((s) => expect(out).not.toContain(s));
  });

  it("returns undefined for an invalid tree and does not mutate inputs", () => {
    expect(serializeGlobalLayout({ scope: "cluster", clusterId: "A", rootNode: { type: "x" } as never, collapsedLeafIds: [], now: 1 })).toBeUndefined();

    const tree = branch("b", leaf("a", "pods"), leaf("u", "bad"));
    const copy = JSON.stringify(tree);

    restoreGlobalLayout(raw({ root: tree }), clusterCtx);
    ser(tree);
    expect(JSON.stringify(tree)).toBe(copy);
  });
});
