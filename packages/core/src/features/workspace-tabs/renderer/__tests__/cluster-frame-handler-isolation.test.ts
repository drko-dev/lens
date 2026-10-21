/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { ClusterFrameHandler } from "../../../../renderer/components/cluster-manager/cluster-frame-handler";
import type { Cluster } from "../../../../common/cluster/cluster";

describe("OpenLens DevOps R4-02: ClusterFrameHandler Frame Isolation & Lifecycle", () => {
  let handler: ClusterFrameHandler;
  let mockLogger: any;
  let mockEmitClusterVisibility: jest.Mock;
  let mockGetClusterById: jest.Mock;
  let parentElem: HTMLElement;

  const devCluster: any = {
    id: "cluster-dev-01",
    contextName: { get: () => "ctx-dev" },
    ready: { get: () => true },
    available: { get: () => true },
    disconnected: { get: () => false },
  };

  const prodCluster: any = {
    id: "cluster-prod-99",
    contextName: { get: () => "ctx-prod" },
    ready: { get: () => true },
    available: { get: () => true },
    disconnected: { get: () => false },
  };

  beforeEach(() => {
    document.body.innerHTML = '<div id="lens-views"></div>';
    const parent = document.getElementById("lens-views");

    if (!parent) {
      throw new Error("#lens-views was not created");
    }

    parentElem = parent;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    mockEmitClusterVisibility = jest.fn();
    mockGetClusterById = jest.fn((id: string) => {
      if (id === devCluster.id) return devCluster as Cluster;
      if (id === prodCluster.id) return prodCluster as Cluster;

      return undefined;
    });

    handler = new ClusterFrameHandler({
      logger: mockLogger,
      getClusterById: mockGetClusterById,
      emitClusterVisibility: mockEmitClusterVisibility,
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("creates strictly one iframe per clusterId and never duplicates iframes", () => {
    handler.initView("cluster-dev-01");
    expect(parentElem.querySelectorAll("iframe")).toHaveLength(1);

    // Initializing same cluster again must be a no-op
    handler.initView("cluster-dev-01");
    expect(parentElem.querySelectorAll("iframe")).toHaveLength(1);

    // Initializing different cluster adds second iframe
    handler.initView("cluster-prod-99");
    expect(parentElem.querySelectorAll("iframe")).toHaveLength(2);

    const iframes = Array.from(parentElem.querySelectorAll("iframe"));

    expect(iframes[0].id).toBe("cluster-frame-cluster-dev-01");
    expect(iframes[1].id).toBe("cluster-frame-cluster-prod-99");
    expect(iframes[0]).toHaveAttribute("role", "tabpanel");
    expect(iframes[0]).toHaveAccessibleName("Kubernetes cluster: ctx-dev");
    expect(iframes[1]).toHaveAccessibleName("Kubernetes cluster: ctx-prod");
  });

  it("switches visibility between frames using hidden class without destroying iframes", () => {
    handler.initView("cluster-dev-01");
    handler.initView("cluster-prod-99");

    const devFrame = parentElem.querySelector("#cluster-frame-cluster-dev-01") as HTMLIFrameElement;
    const prodFrame = parentElem.querySelector("#cluster-frame-cluster-prod-99") as HTMLIFrameElement;

    // Simulate iframe load events
    devFrame.dispatchEvent(new Event("load"));
    prodFrame.dispatchEvent(new Event("load"));

    // Activate DEV cluster
    handler.setVisibleCluster("cluster-dev-01");
    expect(devFrame.classList.contains("hidden")).toBe(false);
    expect(prodFrame.classList.contains("hidden")).toBe(true);
    expect(mockEmitClusterVisibility).toHaveBeenCalledWith("cluster-dev-01");

    // Activate PROD cluster
    handler.setVisibleCluster("cluster-prod-99");
    expect(devFrame.classList.contains("hidden")).toBe(true);
    expect(prodFrame.classList.contains("hidden")).toBe(false);
    expect(mockEmitClusterVisibility).toHaveBeenCalledWith("cluster-prod-99");

    // Both iframes are STILL intact in DOM (not destroyed, preserving state/watchers)
    expect(parentElem.querySelectorAll("iframe")).toHaveLength(2);
  });
});
