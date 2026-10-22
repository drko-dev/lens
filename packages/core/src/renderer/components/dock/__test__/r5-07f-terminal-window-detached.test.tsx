/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { act, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import terminalStoreInjectable from "../terminal/store.injectable";
import detachedTerminalTabsInjectable from "../terminal/detached-terminal-tabs.injectable";
import { TerminalWindow } from "../terminal/view";

describe("R5-07F: TerminalWindow does not connect while Main owns the session", () => {
  it("skips connect while the tab is detached and connects once after redock", () => {
    const di = getDiForUnitTesting();
    const terminal = { setOnSearchOpen: jest.fn(), attachTo: jest.fn(), detach: jest.fn(), onResize: jest.fn() };
    const connect = jest.fn();

    di.override(hostedClusterInjectable, () => ({ id: "c1", name: "dev", preferences: { clusterEnvironment: "development" }}) as any);
    di.override(terminalStoreInjectable, () => ({ connect, getTerminal: () => terminal, isDisconnected: () => false }) as any);

    const tabs = di.inject(detachedTerminalTabsInjectable);

    tabs.set("t1", "detached");

    renderFor(di)(<TerminalWindow tab={{ id: "t1" } as any} />);

    expect(screen.getByTestId("terminal-detached-placeholder")).toBeInTheDocument();
    expect(connect).not.toHaveBeenCalled();

    act(() => { tabs.delete("t1"); });

    expect(connect).toHaveBeenCalledTimes(1);
  });
});
