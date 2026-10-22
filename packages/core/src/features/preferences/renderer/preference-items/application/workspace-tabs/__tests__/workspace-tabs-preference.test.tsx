/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { WorkspaceTabsFeatureFlag } from "../../../../../../workspace-tabs/common/workspace-tabs-feature-flag.injectable";
import { NonInjectedWorkspaceTabsPreference } from "../workspace-tabs-preference";

describe("<WorkspaceTabsPreference />", () => {
  const originalArgv = [...process.argv];

  afterEach(() => {
    process.argv = [...originalArgv];
    delete process.env.OPENLENS_WORKSPACE_TABS;
    window.localStorage.removeItem("openlens:workspace-tabs");
  });

  it("is editable when not overridden", () => {
    process.argv = ["node", "lens"];
    render(<NonInjectedWorkspaceTabsPreference featureFlag={new WorkspaceTabsFeatureFlag()} />);

    expect(screen.getByRole("switch")).toBeEnabled();
    expect(screen.getByRole("switch")).toBeChecked();
    expect(screen.queryByTestId("workspace-tabs-override-note")).not.toBeInTheDocument();
  });

  it("is read-only and explains the source when overridden", () => {
    process.argv = ["node", "lens", "--disable-workspace-tabs"];
    render(<NonInjectedWorkspaceTabsPreference featureFlag={new WorkspaceTabsFeatureFlag()} />);

    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(screen.getByTestId("workspace-tabs-override-note")).toHaveTextContent("command-line argument");
  });
});
