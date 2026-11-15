/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExperimentalSettings } from "./experimental-settings";
import { globalDockingStorageKey } from "../../../../global-docking/renderer/global-docking-feature-flag";

describe("<ExperimentalSettings />", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders experimental notice and persists global docking toggle", () => {
    render(<ExperimentalSettings />);

    expect(screen.getByText("Experimental Features")).toBeInTheDocument();
    expect(screen.getByText(/Experimental features let you try out new functionality/i)).toBeInTheDocument();

    const toggle = screen.getByTestId("experimental-global-docking-switch") as HTMLInputElement;

    expect(toggle.checked).toBe(false);

    fireEvent.click(toggle);

    expect(toggle.checked).toBe(true);
    expect(window.localStorage.getItem(globalDockingStorageKey)).toBe("true");
  });
});
