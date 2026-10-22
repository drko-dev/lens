/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DockTabs } from "../dock-tabs";
import { TabKind } from "../dock/store";
import type { DockTab as DockTabModel } from "../dock/store";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";

jest.mock("../dock-tab", () => ({
  DockTab: ({ value }: { value: DockTabModel }) => (
    <div
      role="tab"
      tabIndex={0}
      className="Tab">
      {value.title}
    </div>
  ),
}));
jest.mock("../terminal/dock-tab", () => ({ TerminalTab: () => null }));

const tabs = [
  { id: "a", kind: TabKind.POD_LOGS, title: "Logs A" },
  { id: "b", kind: TabKind.POD_LOGS, title: "Logs B" },
] as DockTabModel[];

describe("R5-06 DockTabs", () => {
  const render = renderFor(getDiForUnitTesting());

  it("renders a tablist without overflow controls when not overflowing", () => {
    const { getByRole, queryByLabelText } = render(
      <DockTabs
        tabs={tabs}
        autoFocus={false}
        selectedTab={tabs[0]}
        onChangeTab={jest.fn()} />,
    );

    expect(getByRole("tablist")).toBeInTheDocument();
    expect(queryByLabelText("All dock tabs")).toBeNull();
  });

  it("shows overflow controls when overflowing and lists tabs in the menu", () => {
    const sw = jest.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(500);
    const cw = jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(100);
    const onChangeTab = jest.fn();
    const { getByLabelText } = render(
      <DockTabs
        tabs={tabs}
        autoFocus={false}
        selectedTab={tabs[0]}
        onChangeTab={onChangeTab} />,
    );

    expect(getByLabelText("Scroll tabs left")).toBeInTheDocument();
    expect(getByLabelText("Scroll tabs right")).toBeInTheDocument();
    fireEvent.click(getByLabelText("All dock tabs"));
    fireEvent.click(document.body.querySelectorAll(".MenuItem")[1]);
    expect(onChangeTab).toHaveBeenCalledWith(tabs[1]);
    sw.mockRestore();
    cw.mockRestore();
  });

  it("moves focus with arrow keys", () => {
    const { getAllByRole } = render(
      <DockTabs
        tabs={tabs}
        autoFocus={false}
        selectedTab={tabs[0]}
        onChangeTab={jest.fn()} />,
    );
    const [first, second] = getAllByRole("tab");

    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(second).toHaveFocus();
  });
});
