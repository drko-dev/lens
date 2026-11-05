/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SplitPanelStore } from "../split-panel-store";
import { SplitPanelLayout } from "../split-panel-layout";
import { PanelContainer } from "../panel-container";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";
import splitPanelStoreInjectable from "../split-panel-store.injectable";
import type { DiContainer } from "@ogre-tools/injectable";

// Mock @openlens/resizing-anchor for jsdom
jest.mock("@openlens/resizing-anchor", () => ({
  ResizeDirection: { HORIZONTAL: "horizontal", VERTICAL: "vertical" },
  ResizeSide: { LEADING: "leading", TRAILING: "trailing" },
  ResizeGrowthDirection: { LEFT_TO_RIGHT: "left-to-right", RIGHT_TO_LEFT: "right-to-left" },
  ResizingAnchor: (props: any) => (
    <div
      data-testid="mock-resizing-anchor"
      onClick={() => props.onDrag?.(600)}
      onDoubleClick={props.onDoubleClick}
    />
  ),
}));

describe("SplitPanelLayout & PanelContainer", () => {
  let di: DiContainer;
  let store: SplitPanelStore;
  let render: ReturnType<typeof renderFor>;

  beforeEach(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.clear();
    }
    di = getDiForUnitTesting();
    store = new SplitPanelStore();
    di.override(splitPanelStoreInjectable, () => store);
    render = renderFor(di);
  });

  describe("SplitPanelLayout Rendering", () => {
    it("renders both Left and Right panels with divider in active split mode", () => {
      render(
        <SplitPanelLayout
          leftContent={<div data-testid="left-child">Left Kubetail Content</div>}
          rightContent={<div data-testid="right-child">Right Details Content</div>}
          leftTitle="Kubetail Stream"
          rightTitle="Deployment Details"
        />,
      );

      expect(screen.getByTestId("split-panel-layout-container")).toBeInTheDocument();
      expect(screen.getByTestId("split-panel-left")).toBeInTheDocument();
      expect(screen.getByTestId("split-panel-divider")).toBeInTheDocument();
      expect(screen.getByTestId("split-panel-right")).toBeInTheDocument();
      expect(screen.getByTestId("left-child")).toHaveTextContent("Left Kubetail Content");
      expect(screen.getByTestId("right-child")).toHaveTextContent("Right Details Content");
    });

    it("renders single classic container when classicMode is ON", () => {
      store.setClassicMode(true);

      render(
        <SplitPanelLayout
          leftContent={<div data-testid="left-child">Classic View</div>}
          rightContent={<div data-testid="right-child">Details View</div>}
        />,
      );

      expect(screen.getByTestId("split-panel-classic")).toBeInTheDocument();
      expect(screen.getByTestId("left-child")).toBeInTheDocument();
      expect(screen.queryByTestId("split-panel-right")).not.toBeInTheDocument();
      expect(screen.queryByTestId("split-panel-divider")).not.toBeInTheDocument();
    });

    it("expands left panel to full width when right panel is closed, and provides reopen button", () => {
      render(
        <SplitPanelLayout
          leftContent={<div>Left Content</div>}
          rightContent={<div>Right Content</div>}
        />,
      );

      const closeRightButton = screen.getByTestId("panel-close-button-resource-details");

      fireEvent.click(closeRightButton);

      expect(store.isRightClosed).toBe(true);
      expect(screen.getByTestId("reopen-right-bar")).toBeInTheDocument();
      expect(screen.queryByTestId("split-panel-right")).not.toBeInTheDocument();

      const reopenButton = screen.getByTestId("reopen-right-button");

      fireEvent.click(reopenButton);
      expect(store.isRightClosed).toBe(false);
      expect(screen.getByTestId("split-panel-right")).toBeInTheDocument();
    });

    it("swaps order when swap button is clicked", () => {
      render(
        <SplitPanelLayout
          leftContent={<div>Left Content</div>}
          rightContent={<div>Right Content</div>}
        />,
      );

      const swapButton = screen.getByTestId("panel-swap-button-kubetail");

      fireEvent.click(swapButton);
      expect(store.isSwapped).toBe(true);

      const container = screen.getByTestId("split-panel-layout-container");

      expect(container.className).toContain("isSwapped");
    });
  });

  describe("PanelContainer Error Isolation (ErrorBoundary)", () => {
    it("catches rendering errors in one panel without crashing the entire layout", () => {
      const BombComponent = () => {
        throw new Error("Simulated panel explosion");
      };

      // Suppress console.error in test
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      render(
        <PanelContainer panelId="faulty-panel" title="Faulty Panel">
          <BombComponent />
        </PanelContainer>,
      );

      expect(screen.getByTestId("panel-error-faulty-panel")).toBeInTheDocument();
      expect(screen.getByText("Panel Rendering Failed")).toBeInTheDocument();
      expect(screen.getByText("Simulated panel explosion")).toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });
  });
});
