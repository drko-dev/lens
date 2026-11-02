/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { act } from "@testing-library/react";
import { computed, observable, runInAction } from "mobx";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import { renderFor } from "../../../../renderer/components/test-utils/renderFor";
import getClusterByIdInjectable from "../../../cluster/storage/common/get-by-id.injectable";
import { SplitPanelStore } from "../../../../renderer/components/split-panel/split-panel-store";
import type { SplitLayoutLeaf } from "../../../../renderer/components/split-panel/split-panel-types";
import { createBranchNode } from "../../../../renderer/components/split-panel/panel-catalog";
import globalPanelStoreInjectable from "../global-panel-store.injectable";
import { GlobalPanelHost } from "../global-panel-host";
import { NEUTRAL_PANEL_ACCENT, resolvePanelClusterIdentity } from "../panel-cluster-identity";

const leaf = (id: string): SplitLayoutLeaf => ({ type: "leaf", id, panelKind: "unknown" as never, title: id });
const fakeCluster = (id: string, preferences: Record<string, unknown>) => ({
  id,
  preferences: observable(preferences),
  contextName: computed(() => `ctx-${id}`),
});

describe("global docking cluster identity (H7.4)", () => {
  describe("resolvePanelClusterIdentity", () => {
    it("uses the configured color and environment", () => {
      const identity = resolvePanelClusterIdentity("c1", fakeCluster("c1", { clusterColor: "#10B981", clusterEnvironment: "development", clusterAlias: "Dev A" }) as never);

      expect(identity).toMatchObject({ clusterId: "c1", name: "Dev A", accent: "#10B981" });
      expect(identity.environment.shortLabel).toBe("DEV");
    });

    it("falls back to the environment color, then to a neutral theme color", () => {
      expect(resolvePanelClusterIdentity("c1", fakeCluster("c1", { clusterEnvironment: "production" }) as never).accent)
        .toBe("var(--envProduction, #EF4444)");
      expect(resolvePanelClusterIdentity("c1", fakeCluster("c1", {}) as never).accent).toBe(NEUTRAL_PANEL_ACCENT);
      expect(resolvePanelClusterIdentity("c1", undefined)).toMatchObject({ name: "c1", accent: NEUTRAL_PANEL_ACCENT });
    });

    it("never infers production from the cluster name", () => {
      const identity = resolvePanelClusterIdentity("c1", fakeCluster("c1", { clusterName: "prod-payments" }) as never);

      expect(identity.environment.isProduction).toBe(false);
      expect(identity.environment.id).toBe("none");
    });
  });

  describe("<GlobalPanelHost />", () => {
    const setup = (clusters: Record<string, ReturnType<typeof fakeCluster>>) => {
      const di = getDiForUnitTesting();
      const store = new SplitPanelStore({ initialClusterId: "c1", getLocalStorageItem: () => null, setLocalStorageItem: () => {} });

      runInAction(() => { store.rootNode = createBranchNode("horizontal", 0.5, leaf("a"), leaf("b")); });
      di.override(globalPanelStoreInjectable, () => store);
      di.override(getClusterByIdInjectable, () => (id: string) => clusters[id] as never);

      return { store, result: renderFor(di)(<GlobalPanelHost />) };
    };
    const accentOf = (element: HTMLElement) => element.style.getPropertyValue("--panel-accent");

    it("draws the cluster accent on headers, grouped tabs and the restore band", () => {
      const { store, result } = setup({ c1: fakeCluster("c1", { clusterColor: "#10B981" }) });

      expect(accentOf(result.getByTestId("panel-header-a"))).toBe("#10B981");
      expect(accentOf(result.getByTestId("panel-header-b"))).toBe("#10B981");
      expect(result.getByTestId("panel-header-a").getAttribute("data-cluster-id")).toBe("c1");

      act(() => { store.movePanel("b", "a", "group"); });
      expect(accentOf(result.getByTestId("tab-a"))).toBe("#10B981");
      expect(accentOf(result.getByTestId("tab-b"))).toBe("#10B981");

      act(() => { store.collapsePanel("b"); });
      expect(accentOf(result.getByTestId("panel-restore-collapsed-b"))).toBe("#10B981");
    });

    it("updates the accent reactively without re-mounting the panel content", () => {
      const cluster = fakeCluster("c1", { clusterColor: "#10B981" });
      const { result } = setup({ c1: cluster });
      const body = result.getByTestId("panel-container-a").lastElementChild;

      act(() => { runInAction(() => { cluster.preferences.clusterColor = "#14B8A6"; }); });

      expect(accentOf(result.getByTestId("panel-header-a"))).toBe("#14B8A6");
      expect(result.getByTestId("panel-container-a").lastElementChild).toBe(body);
    });

    it("labels production clusters with text, not only color", () => {
      const cluster = fakeCluster("c1", { clusterEnvironment: "production" });
      const { result } = setup({ c1: cluster });

      expect(result.getByTestId("panel-env-a").textContent).toContain("PROD");
      expect(result.getByTestId("panel-header-a").getAttribute("data-production")).toBe("true");
      expect(result.getByTestId("panel-header-a").textContent).toContain("Cluster ctx-c1");
    });

    it("shows no environment label for a cluster without configured environment", () => {
      const { result } = setup({ c1: fakeCluster("c1", { clusterName: "prod-payments" }) });

      expect(result.queryByTestId("panel-env-a")).toBeNull();
      expect(result.getByTestId("panel-header-a").getAttribute("data-production")).toBe("false");
    });

    it("only follows its own cluster", () => {
      const other = fakeCluster("c2", { clusterColor: "#EF4444" });
      const { result } = setup({ c1: fakeCluster("c1", { clusterColor: "#10B981" }), c2: other });

      act(() => { runInAction(() => { other.preferences.clusterColor = "#8B5CF6"; }); });

      expect(accentOf(result.getByTestId("panel-header-a"))).toBe("#10B981");
    });
  });
});
