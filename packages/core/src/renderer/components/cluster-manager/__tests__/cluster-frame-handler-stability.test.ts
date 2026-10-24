/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { ClusterFrameHandler } from "../cluster-frame-handler";
import type { Cluster } from "../../../../common/cluster/cluster";

describe("ClusterFrameHandler Stability & Anti-Lock Suite", () => {
  let handler: ClusterFrameHandler;
  let mockLogger: any;
  let mockEmitClusterVisibility: jest.Mock;
  let mockGetClusterById: jest.Mock;
  let parentElem: HTMLElement;

  const clusterA: any = {
    id: "cluster-a",
    contextName: { get: () => "ctx-a" },
    ready: { get: () => true },
    available: { get: () => true },
    disconnected: { get: () => false },
  };

  const clusterB: any = {
    id: "cluster-b",
    contextName: { get: () => "ctx-b" },
    ready: { get: () => true },
    available: { get: () => true },
    disconnected: { get: () => false },
  };

  beforeEach(() => {
    document.body.innerHTML = '<div id="lens-views"></div>';
    const parent = document.getElementById("lens-views");

    if (!parent) {
      throw new Error("#lens-views not found");
    }

    parentElem = parent;
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    mockEmitClusterVisibility = jest.fn();
    mockGetClusterById = jest.fn((id: string) => {
      if (id === clusterA.id) return clusterA as Cluster;
      if (id === clusterB.id) return clusterB as Cluster;

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

  it("reports hasView correctly before and after initView", () => {
    expect(handler.hasView("cluster-a")).toBe(false);
    handler.initView("cluster-a");
    expect(handler.hasView("cluster-a")).toBe(true);
  });

  it("does not re-hide or cause visual thrashing when setVisibleCluster is called with the active cluster", () => {
    handler.initView("cluster-a");
    const frame = parentElem.querySelector<HTMLIFrameElement>("#cluster-frame-cluster-a")!;

    // Simulate iframe loaded
    frame.dispatchEvent(new Event("load"));
    expect(handler.hasLoadedView("cluster-a")).toBe(true);

    // Initial activation
    handler.setVisibleCluster("cluster-a");
    expect(frame.classList.contains("hidden")).toBe(false);
    expect(mockEmitClusterVisibility).toHaveBeenCalledWith("cluster-a");

    const emitCount = mockEmitClusterVisibility.mock.calls.length;

    // Calling setVisibleCluster again with the same active cluster must be a clean no-op
    handler.setVisibleCluster("cluster-a");
    expect(frame.classList.contains("hidden")).toBe(false);
    expect(mockEmitClusterVisibility.mock.calls.length).toBe(emitCount);
  });

  it("immediately activates a loaded and ready cluster when switching", () => {
    handler.initView("cluster-a");
    handler.initView("cluster-b");

    const frameA = parentElem.querySelector<HTMLIFrameElement>("#cluster-frame-cluster-a")!;
    const frameB = parentElem.querySelector<HTMLIFrameElement>("#cluster-frame-cluster-b")!;

    frameA.dispatchEvent(new Event("load"));
    frameB.dispatchEvent(new Event("load"));

    handler.setVisibleCluster("cluster-a");
    expect(frameA.classList.contains("hidden")).toBe(false);

    // Switch to cluster B
    handler.setVisibleCluster("cluster-b");
    expect(frameA.classList.contains("hidden")).toBe(true);
    expect(frameB.classList.contains("hidden")).toBe(false);
    expect(mockEmitClusterVisibility).toHaveBeenLastCalledWith("cluster-b");
  });

  it("clears visible cluster and hides all frames cleanly on clearVisibleCluster", () => {
    handler.initView("cluster-a");
    const frame = parentElem.querySelector<HTMLIFrameElement>("#cluster-frame-cluster-a")!;

    frame.dispatchEvent(new Event("load"));
    handler.setVisibleCluster("cluster-a");
    expect(frame.classList.contains("hidden")).toBe(false);

    handler.clearVisibleCluster();
    expect(frame.classList.contains("hidden")).toBe(true);
    expect(mockEmitClusterVisibility).toHaveBeenLastCalledWith(null);
  });
});
