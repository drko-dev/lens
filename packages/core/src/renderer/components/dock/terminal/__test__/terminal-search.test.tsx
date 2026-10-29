/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import { TerminalSearch } from "../terminal-search";
import type { Terminal } from "../terminal";
import { getDiForUnitTesting } from "../../../../getDiForUnitTesting";
import type { DiRender } from "../../../test-utils/renderFor";
import { renderFor } from "../../../test-utils/renderFor";

describe("TerminalSearch (R2-04)", () => {
  let mockTerminal: Partial<Terminal>;
  let mockOnClose: jest.Mock;
  let render: DiRender;

  beforeEach(() => {
    const di = getDiForUnitTesting();

    render = renderFor(di);
    mockOnClose = jest.fn();
    mockTerminal = {
      findNext: jest.fn().mockReturnValue(true),
      findPrevious: jest.fn().mockReturnValue(true),
      clearSearch: jest.fn(),
      focus: jest.fn(),
    };
  });

  it("renders search input, toggle controls, navigation, and close buttons", () => {
    render(
      <TerminalSearch
        terminal={mockTerminal as Terminal}
        onClose={mockOnClose}
      />,
    );

    expect(screen.getByTestId("terminal-search-bar")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-search-input")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-search-case-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-search-regex-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-search-word-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-search-prev-btn")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-search-next-btn")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-search-close-btn")).toBeInTheDocument();
  });

  it("calls findNext on typing and displays match indicator", () => {
    render(
      <TerminalSearch
        terminal={mockTerminal as Terminal}
        onClose={mockOnClose}
      />,
    );

    const input = screen.getByTestId("terminal-search-input");

    fireEvent.change(input, { target: { value: "kubectl" }});

    expect(mockTerminal.findNext).toHaveBeenCalledWith("kubectl", {
      regex: false,
      caseSensitive: false,
      wholeWord: false,
      incremental: true,
    });

    expect(screen.getByTestId("terminal-search-status").textContent).toBe("Match");
  });

  it("displays 'No results' when findNext returns false", () => {
    (mockTerminal.findNext as jest.Mock).mockReturnValue(false);

    render(
      <TerminalSearch
        terminal={mockTerminal as Terminal}
        onClose={mockOnClose}
      />,
    );

    const input = screen.getByTestId("terminal-search-input");

    fireEvent.change(input, { target: { value: "nonexistent" }});

    expect(screen.getByTestId("terminal-search-status").textContent).toBe("No results");
  });

  it("toggles case sensitive option", () => {
    render(
      <TerminalSearch
        terminal={mockTerminal as Terminal}
        onClose={mockOnClose}
      />,
    );

    const caseBtn = screen.getByTestId("terminal-search-case-toggle");
    const input = screen.getByTestId("terminal-search-input");

    fireEvent.change(input, { target: { value: "error" }});
    fireEvent.click(caseBtn);

    expect(caseBtn).toHaveClass("active");
    expect(mockTerminal.findNext).toHaveBeenCalledWith("error", {
      regex: false,
      caseSensitive: true,
      wholeWord: false,
      incremental: false,
    });
  });

  it("toggles regex option", () => {
    render(
      <TerminalSearch
        terminal={mockTerminal as Terminal}
        onClose={mockOnClose}
      />,
    );

    const regexBtn = screen.getByTestId("terminal-search-regex-toggle");
    const input = screen.getByTestId("terminal-search-input");

    fireEvent.change(input, { target: { value: "pod-.*" }});
    fireEvent.click(regexBtn);

    expect(regexBtn).toHaveClass("active");
    expect(mockTerminal.findNext).toHaveBeenCalledWith("pod-.*", {
      regex: true,
      caseSensitive: false,
      wholeWord: false,
      incremental: false,
    });
  });

  it("toggles whole word option", () => {
    render(
      <TerminalSearch
        terminal={mockTerminal as Terminal}
        onClose={mockOnClose}
      />,
    );

    const wordBtn = screen.getByTestId("terminal-search-word-toggle");
    const input = screen.getByTestId("terminal-search-input");

    fireEvent.change(input, { target: { value: "log" }});
    fireEvent.click(wordBtn);

    expect(wordBtn).toHaveClass("active");
    expect(mockTerminal.findNext).toHaveBeenCalledWith("log", {
      regex: false,
      caseSensitive: false,
      wholeWord: true,
      incremental: false,
    });
  });

  it("navigates next on Enter and previous on Shift+Enter", () => {
    render(
      <TerminalSearch
        terminal={mockTerminal as Terminal}
        onClose={mockOnClose}
      />,
    );

    const input = screen.getByTestId("terminal-search-input");

    fireEvent.change(input, { target: { value: "ready" }});

    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(mockTerminal.findNext).toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(mockTerminal.findPrevious).toHaveBeenCalled();
  });

  it("closes and clears search on Escape key or close button click", () => {
    render(
      <TerminalSearch
        terminal={mockTerminal as Terminal}
        onClose={mockOnClose}
      />,
    );

    const input = screen.getByTestId("terminal-search-input");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(mockTerminal.clearSearch).toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
    expect(mockTerminal.focus).toHaveBeenCalled();

    const closeBtn = screen.getByTestId("terminal-search-close-btn");

    fireEvent.click(closeBtn);
    expect(mockTerminal.clearSearch).toHaveBeenCalledTimes(2);
  });
});
