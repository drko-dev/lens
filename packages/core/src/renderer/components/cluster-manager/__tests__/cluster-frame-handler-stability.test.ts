/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { ClusterFrameHandler } from "../cluster-frame-handler";
import type { Cluster } from "../../../../common/cluster/cluster";
import { observable, runInAction } from "mobx";
import assert from "assert";

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
    const frame = parentElem.querySelector<HTMLIFrameElement>("#cluster-frame-cluster-a");

    assert(frame);

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

    const frameA = parentElem.querySelector<HTMLIFrameElement>("#cluster-frame-cluster-a");
    const frameB = parentElem.querySelector<HTMLIFrameElement>("#cluster-frame-cluster-b");

    assert(frameA && frameB);

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
    const frame = parentElem.querySelector<HTMLIFrameElement>("#cluster-frame-cluster-a");

    assert(frame);

    frame.dispatchEvent(new Event("load"));
    handler.setVisibleCluster("cluster-a");
    expect(frame.classList.contains("hidden")).toBe(false);

    handler.clearVisibleCluster();
    expect(frame.classList.contains("hidden")).toBe(true);
    expect(mockEmitClusterVisibility).toHaveBeenLastCalledWith(null);
  });

  it("removes iframe cleanly via fallback timer if load event does not fire on disconnect", () => {
    jest.useFakeTimers();
    const disconnectedBox = observable.box(false);
    const dynamicCluster: any = {
      id: "cluster-dyn",
      contextName: { get: () => "ctx-dyn" },
      ready: { get: () => true },
      available: { get: () => true },
      disconnected: disconnectedBox,
    };

    mockGetClusterById.mockImplementation((id: string) => {
      if (id === "cluster-dyn") return dynamicCluster as Cluster;
      if (id === clusterA.id) return clusterA as Cluster;

      return undefined;
    });

    handler.initView("cluster-dyn");
    const frame = parentElem.querySelector<HTMLIFrameElement>("#cluster-frame-cluster-dyn");

    assert(frame);
    expect(frame).toBeTruthy();

    frame.dispatchEvent(new Event("load"));
    expect(handler.hasLoadedView("cluster-dyn")).toBe(true);

    // Trigger disconnect
    runInAction(() => {
      disconnectedBox.set(true);
    });

    // Advance time past fallback timeout (1500ms) without emitting load event
    jest.advanceTimersByTime(2000);

    expect(parentElem.querySelector("#cluster-frame-cluster-dyn")).toBeNull();
    expect(handler.hasView("cluster-dyn")).toBe(false);
    jest.useRealTimers();
  });

  it("prevents duplicate iframe IDs on rapid disconnect and reconnect", () => {
    const disconnectedBox = observable.box(false);
    const dynamicCluster: any = {
      id: "cluster-fast",
      contextName: { get: () => "ctx-fast" },
      ready: { get: () => true },
      available: { get: () => true },
      disconnected: disconnectedBox,
    };

    mockGetClusterById.mockImplementation((id: string) => {
      if (id === "cluster-fast") return dynamicCluster as Cluster;

      return undefined;
    });

    handler.initView("cluster-fast");
    const frame1 = parentElem.querySelector<HTMLIFrameElement>("#cluster-frame-cluster-fast");

    assert(frame1);
    expect(frame1).toBeTruthy();
    frame1.dispatchEvent(new Event("load"));

    // Disconnect
    runInAction(() => {
      disconnectedBox.set(true);
    });

    // Frame 1 should be immediately renamed to prevent collision
    expect(frame1.id).toContain("teardown");
    expect(parentElem.querySelector("#cluster-frame-cluster-fast")).toBeNull();

    // Reconnect immediately
    runInAction(() => {
      disconnectedBox.set(false);
    });
    handler.initView("cluster-fast");
    const frame2 = parentElem.querySelector<HTMLIFrameElement>("#cluster-frame-cluster-fast");

    assert(frame2);
    expect(frame2).toBeTruthy();
    expect(frame2).not.toBe(frame1);
  });
});
