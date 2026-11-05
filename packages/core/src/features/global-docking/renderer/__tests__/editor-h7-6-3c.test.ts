/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { createGlobalPanelStore, dockedEditorTabId, openEditorPanel } from "../global-panel-store";
import type { EditorDescriptor } from "../global-panel-store";
import type { SplitLayoutLeaf } from "../../../../renderer/components/split-panel/split-panel-types";

const deploy: EditorDescriptor = { selfLink: "/apis/apps/v1/namespaces/ns/deployments/web", apiVersion: "apps/v1", kind: "Deployment", name: "web", namespace: "ns", uid: "u-web" };
const cfg: EditorDescriptor = { selfLink: "/api/v1/namespaces/ns/configmaps/cfg", apiVersion: "v1", kind: "ConfigMap", name: "cfg", namespace: "ns", uid: "u-cfg" };

const editors = (store: ReturnType<typeof createGlobalPanelStore>) => store.allActiveLeaves.filter((leaf) => leaf.panelKind === "resource-editor");
const tabIdOf = (store: ReturnType<typeof createGlobalPanelStore>, id: string) => store.allActiveLeaves.find((leaf) => leaf.id === id)?.resourceBinding?.tabId;

describe("global docking Editor (H7.6.3C)", () => {
  describe("stable document identity", () => {
    it("derives the id from cluster and resource, not from the panel id", () => {
      const store = createGlobalPanelStore("c1");
      const id = openEditorPanel(store, deploy);

      expect(tabIdOf(store, id)).toBe(`docked-edit:c1:${deploy.selfLink}`);
      expect(tabIdOf(store, id)).not.toContain(id);
    });

    it("reopening the same document reuses the panel and the id (no duplicate session)", () => {
      const store = createGlobalPanelStore("c1");
      const first = openEditorPanel(store, deploy);

      expect(openEditorPanel(store, deploy)).toBe(first);
      expect(editors(store)).toHaveLength(1);
    });

    it("a docking move keeps the session id (the panel is only relocated)", () => {
      const store = createGlobalPanelStore("c1");
      const id = openEditorPanel(store, deploy);

      openEditorPanel(store, cfg);

      const before = tabIdOf(store, id);

      const target = store.allActiveLeaves.find((l) => l.id !== id)!.id;

      expect(store.dockPanel(id, target, "right", "c1")).toBe(true); // really moved
      expect(editors(store)).toHaveLength(2);
      expect(tabIdOf(store, id)).toBe(before);
    });

    it("collapse and restore keep the session id and release nothing", () => {
      const closed: SplitLayoutLeaf[] = [];
      const store = createGlobalPanelStore("c1", { onPanelClosed: (leaf) => closed.push(leaf) });
      const id = openEditorPanel(store, deploy);

      openEditorPanel(store, cfg);
      store.collapsePanel(id);
      store.restorePanel(id);

      expect(tabIdOf(store, id)).toBe(dockedEditorTabId({ clusterId: "c1", selfLink: deploy.selfLink }));
      expect(closed).toHaveLength(0);
    });

    it("different documents and different clusters never share a session id", () => {
      const a = createGlobalPanelStore("c1");
      const b = createGlobalPanelStore("c2");
      const ids = [
        tabIdOf(a, openEditorPanel(a, deploy)),
        tabIdOf(a, openEditorPanel(a, cfg)),
        tabIdOf(b, openEditorPanel(b, deploy)),
      ];

      expect(new Set(ids).size).toBe(3);
    });
  });

  describe("close confirmation", () => {
    const setup = (confirm: (leaf: SplitLayoutLeaf) => Promise<boolean>) => {
      const closed: SplitLayoutLeaf[] = [];
      const store = createGlobalPanelStore("c1", { onPanelClosed: (leaf) => closed.push(leaf), confirmPanelClose: confirm });
      const id = openEditorPanel(store, deploy);

      openEditorPanel(store, cfg);

      return { store, id, closed };
    };

    it("a cancelled close keeps the panel and releases nothing", async () => {
      const { store, id, closed } = setup(async () => false);

      expect(await store.requestClosePanel(id)).toBe(false);
      expect(editors(store)).toHaveLength(2);
      expect(closed).toHaveLength(0);
    });

    it("nothing is released while the confirmation is still pending", async () => {
      let answer!: (value: boolean) => void;
      const { store, id, closed } = setup(() => new Promise<boolean>((resolve) => { answer = resolve; }));
      const pending = store.requestClosePanel(id);

      expect(editors(store)).toHaveLength(2);
      expect(closed).toHaveLength(0);

      answer(true);
      await pending;

      expect(editors(store)).toHaveLength(1);
      expect(closed).toHaveLength(1);
    });

    it("a confirmed close removes the panel and reports it exactly once", async () => {
      const { store, id, closed } = setup(async () => true);

      expect(await store.requestClosePanel(id)).toBe(true);
      expect(closed.map((leaf) => leaf.resourceBinding?.tabId)).toEqual([`docked-edit:c1:${deploy.selfLink}`]);
    });

    it("reopening after a confirmed close creates a fresh panel with the same document id", async () => {
      const { store, id } = setup(async () => true);
      const oldTab = tabIdOf(store, id);

      await store.requestClosePanel(id);

      const reopened = openEditorPanel(store, deploy);

      expect(reopened).not.toBe(id);
      expect(tabIdOf(store, reopened)).toBe(oldTab);
    });

    it("without a confirmation dependency the close is immediate (other panel kinds unchanged)", async () => {
      const store = createGlobalPanelStore("c1");
      const id = openEditorPanel(store, deploy);

      openEditorPanel(store, cfg);

      expect(await store.requestClosePanel(id)).toBe(true);
    });
  });
});
