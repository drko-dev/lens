/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent } from "@testing-library/react";
import { runInAction } from "mobx";
import type { DiContainer } from "@ogre-tools/injectable";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";
import type { DiRender } from "../../test-utils/renderFor";
import { DynamicLayoutRenderer } from "../dynamic-layout-renderer";
import { MAX_SPLIT_RATIO, MIN_SPLIT_RATIO, SplitPanelStore } from "../split-panel-store";
import type { SplitLayoutBranch } from "../split-panel-types";

// Every element reports the same 1000x800 box at the origin, so the divider's centre line is
// x=500 / y=400 and the branch container is 1000px wide and 800px tall.
const BOX = { x: 0, y: 0, top: 0, left: 0, width: 1000, height: 800, right: 1000, bottom: 800, toJSON: () => ({}) } as DOMRect;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const mouseMove = (pageX: number, pageY: number) => {
  const event = new MouseEvent("mousemove", { bubbles: true, clientX: pageX, clientY: pageY });

  Object.defineProperties(event, { pageX: { value: pageX }, pageY: { value: pageY }});
  document.dispatchEvent(event);
};

describe("branch divider resize direction", () => {
  let di: DiContainer;
  let render: DiRender;
  let store: SplitPanelStore;
  let rectSpy: jest.SpyInstance;

  beforeEach(() => {
    di = getDiForUnitTesting();
    render = renderFor(di);
    store = new SplitPanelStore({ getLocalStorageItem: () => null, setLocalStorageItem: () => {} });
    rectSpy = jest.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(BOX);
  });

  afterEach(() => rectSpy.mockRestore());

  const renderBranch = (orientation: "horizontal" | "vertical") => {
    const branch: SplitLayoutBranch = {
      type: "branch", id: "b1", orientation, ratio: 0.5,
      first: { type: "leaf", id: "l1", panelKind: "unknown" as never, title: "first" },
      second: { type: "leaf", id: "l2", panelKind: "unknown" as never, title: "second" },
    };

    runInAction(() => { store.rootNode = branch; });
    const result = render(<DynamicLayoutRenderer node={branch} splitPanelStore={store} />);
    const anchor = result.getByTestId("branch-divider-b1").querySelector(".ResizingAnchor");

    if (!anchor) throw new Error("resizing anchor not rendered");

    return anchor;
  };

  const ratio = () => (store.rootNode as SplitLayoutBranch).ratio;

  // ResizingAnchor reads document mousemove events and throttles them to one every 100 ms.
  const drag = async (anchor: Element, from: [number, number], to: [number, number]) => {
    fireEvent.mouseDown(anchor);
    mouseMove(...from);
    await wait(120);
    mouseMove(...to);
    await wait(120);
    fireEvent.mouseUp(document);
  };

  it("dragging a horizontal divider to the right grows the first (left) panel", async () => {
    const anchor = renderBranch("horizontal");

    await drag(anchor, [500, 10], [700, 10]);

    expect(ratio()).toBeCloseTo(0.7);
  });

  it("dragging a horizontal divider to the left shrinks the first (left) panel", async () => {
    const anchor = renderBranch("horizontal");

    await drag(anchor, [500, 10], [400, 10]);

    expect(ratio()).toBeCloseTo(0.4);
  });

  it("dragging a vertical divider down grows the first (top) panel", async () => {
    const anchor = renderBranch("vertical");

    await drag(anchor, [10, 400], [10, 520]);

    expect(ratio()).toBeCloseTo(0.65);
  });

  it("dragging a vertical divider up shrinks the first (top) panel", async () => {
    const anchor = renderBranch("vertical");

    await drag(anchor, [10, 400], [10, 320]);

    expect(ratio()).toBeCloseTo(0.4);
  });

  it("keeps the ratio within the allowed limits", async () => {
    const anchor = renderBranch("horizontal");

    await drag(anchor, [500, 10], [990, 10]);
    expect(ratio()).toBe(MAX_SPLIT_RATIO);

    await drag(anchor, [990, 10], [5, 10]);
    expect(ratio()).toBe(MIN_SPLIT_RATIO);
  });
});
