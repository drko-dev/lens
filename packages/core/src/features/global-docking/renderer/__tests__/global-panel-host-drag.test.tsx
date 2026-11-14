/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { computed } from "mobx";
import { fireEvent } from "@testing-library/react";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import { renderFor } from "../../../../renderer/components/test-utils/renderFor";
import { PanelHostView } from "../global-panel-host";
import { createGlobalPanelStore } from "../global-panel-store";

jest.mock("../../../../renderer/components/split-panel/panel-content-resolver", () => {
  const actual = jest.requireActual("../../../../renderer/components/split-panel/panel-content-resolver");

  return {
    ...actual,
    PanelContentResolver: ({ leafId }: { leafId: string }) => <div data-testid={`panel-stub-${leafId}`} />,
  };
});

describe("PanelHostView drag leave handling", () => {
  it("preserves drop preview on dragleave with null relatedTarget inside host bounds and clears outside", () => {
    const di = getDiForUnitTesting();
    const render = renderFor(di);
    const store = createGlobalPanelStore("cluster-a");
    const [pods, deployments] = store.allActiveLeaves;

    const result = render(
      <PanelHostView
        store={store}
        activeKind={computed(() => undefined)}
        testId="global-panel-host"
        onSelectPanel={jest.fn()}
        isKindAllowed={() => true}
      />,
    );

    const host = result.getByTestId("global-panel-host");
    const podsPanel = result.getByTestId(`panel-container-${pods.id}`);
    const deploymentsPanel = result.getByTestId(`panel-container-${deployments.id}`);

    const hostRect = { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    const targetRect = { left: 400, top: 0, right: 800, bottom: 600, width: 400, height: 600, x: 400, y: 0, toJSON: () => ({}) } as DOMRect;

    jest.spyOn(host, "getBoundingClientRect").mockReturnValue(hostRect);
    jest.spyOn(deploymentsPanel, "getBoundingClientRect").mockReturnValue(targetRect);
    const groupNode = deploymentsPanel.closest("[data-testid^=\"group-node-\"]");

    if (groupNode) {
      jest.spyOn(groupNode, "getBoundingClientRect").mockReturnValue(targetRect);
    }

    const dataTransfer = {
      types: ["application/openlens-panel-id"],
      effectAllowed: "move",
      dropEffect: "move",
      setData: jest.fn(),
      getData: jest.fn(() => pods.id),
    };

    const dragHandle = podsPanel.querySelector("[draggable=\"true\"]") ?? podsPanel;

    fireEvent.dragStart(dragHandle, { dataTransfer });
    fireEvent.dragOver(deploymentsPanel, { dataTransfer, clientX: 780, clientY: 300 });

    expect(result.queryByTestId("global-panel-drop-preview")).toBeTruthy();

    fireEvent(host, new MouseEvent("dragleave", { bubbles: true, relatedTarget: null, clientX: 780, clientY: 300 }));
    expect(result.queryByTestId("global-panel-drop-preview")).toBeTruthy();

    fireEvent(host, new MouseEvent("dragleave", { bubbles: true, relatedTarget: null, clientX: -10, clientY: 300 }));
    expect(result.queryByTestId("global-panel-drop-preview")).toBeNull();
  });
});
