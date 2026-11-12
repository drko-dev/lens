/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { computed } from "mobx";
import { TerminalWindow } from "../view";
import { getDiForUnitTesting } from "../../../../getDiForUnitTesting";
import { renderFor } from "../../../test-utils/renderFor";
import activeThemeInjectable from "../../../../themes/active.injectable";
import { novakubeThemeName } from "../../../../themes/novakube.injectable";
import dockStoreInjectable from "../../dock/store.injectable";
import hostedClusterInjectable from "../../../../cluster-frame-context/hosted-cluster.injectable";
import terminalStoreInjectable from "../store.injectable";
import { TabKind } from "../../dock/store";

describe("Lens terminal search toolbar layout", () => {
  const mount = (themeName: string) => {
    const di = getDiForUnitTesting();
    const terminal = {
      setOnSearchOpen: jest.fn(),
      attachTo: jest.fn(),
      detach: jest.fn(),
      onResize: jest.fn(),
      findNext: jest.fn().mockReturnValue(true),
      findPrevious: jest.fn().mockReturnValue(true),
      clearSearch: jest.fn(),
      focus: jest.fn(),
    };

    di.override(activeThemeInjectable, () => computed(() => ({ name: themeName, type: "dark" }) as any));
    di.override(hostedClusterInjectable, () => ({ id: "demo-1", name: "Demo", preferences: {}}) as any);
    di.override(terminalStoreInjectable, () => ({
      connect: jest.fn(),
      getTerminal: () => terminal,
      isDisconnected: () => false,
    }) as any);
    di.override(dockStoreInjectable, () => ({ onResize: jest.fn(() => () => {}) }) as any);
    renderFor(di)(<TerminalWindow tab={{ id: "search-1", title: "Terminal", kind: TabKind.TERMINAL, pinned: false }} />);

    const open = terminal.setOnSearchOpen.mock.lastCall?.[0];

    expect(open).toBeInstanceOf(Function);
    act(() => open());

    return { terminal, root: document.querySelector(".TerminalWindow") };
  };

  it("puts NovaKube search before the context strip, without touching terminal safety actions", () => {
    const { terminal, root } = mount(novakubeThemeName);
    const search = screen.getByTestId("terminal-search-bar");
    const context = screen.getByTestId("terminal-context-header-search-1");

    expect(root).toBeInTheDocument();
    expect(search.parentElement).toBe(root);
    expect(screen.getByTestId("terminal-search-input")).toHaveAttribute("placeholder", "Search in Terminal...");
    expect(root?.firstElementChild).toBe(search);
    expect(search.nextElementSibling).toBe(context);
    fireEvent.change(screen.getByTestId("terminal-search-input"), { target: { value: "pod" }});
    expect(terminal.findNext).toHaveBeenCalledWith("pod", expect.objectContaining({ incremental: true }));
    fireEvent.click(screen.getByTestId("terminal-search-close-btn"));
    expect(screen.queryByTestId("terminal-search-bar")).not.toBeInTheDocument();
    expect(terminal.clearSearch).toHaveBeenCalledTimes(1);
  });

  it("keeps other themes' floating search inside terminal-body", () => {
    const { root } = mount("Cursor");
    const search = screen.getByTestId("terminal-search-bar");

    expect(screen.getByTestId("terminal-search-input")).toHaveAttribute("placeholder", "Find in terminal...");
    expect(search.parentElement).toHaveClass("terminal-body");
    expect(root?.firstElementChild).toBe(screen.getByTestId("terminal-context-header-search-1"));
    expect(screen.getByTestId("terminal-search-case-toggle")).toBeInTheDocument();
  });
});
