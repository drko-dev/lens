/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { WorkspaceTabsFeatureFlag } from "../../common/workspace-tabs-feature-flag.injectable";

describe("WorkspaceTabsFeatureFlag", () => {
  const originalWorkspaceFlag = process.env.OPENLENS_WORKSPACE_TABS;
  const originalR4PilotFlag = process.env.OPENLENS_R4_PILOT;
  const originalArgv = [...process.argv];

  afterEach(() => {
    process.argv = [...originalArgv];
    if (originalWorkspaceFlag === undefined) delete process.env.OPENLENS_WORKSPACE_TABS;
    else process.env.OPENLENS_WORKSPACE_TABS = originalWorkspaceFlag;

    if (originalR4PilotFlag === undefined) delete process.env.OPENLENS_R4_PILOT;
    else process.env.OPENLENS_R4_PILOT = originalR4PilotFlag;

    window.localStorage.removeItem("openlens:workspace-tabs");
  });

  it("keeps the classic shell as default and does not inherit the R4-01 pilot flag", () => {
    delete process.env.OPENLENS_WORKSPACE_TABS;
    process.env.OPENLENS_R4_PILOT = "true";
    process.argv = ["node", "lens"];
    window.localStorage.removeItem("openlens:workspace-tabs");

    expect(new WorkspaceTabsFeatureFlag().isEnabled).toBe(false);
  });

  it("can be enabled explicitly for an isolated workspace-tabs pilot via env var", () => {
    process.env.OPENLENS_WORKSPACE_TABS = "true";

    expect(new WorkspaceTabsFeatureFlag().isEnabled).toBe(true);
  });

  it("enables when --enable-workspace-tabs is passed via process.argv (CLI-only, no env var)", () => {
    delete process.env.OPENLENS_WORKSPACE_TABS;
    delete process.env.OPENLENS_R4_PILOT;
    window.localStorage.removeItem("openlens:workspace-tabs");
    process.argv = ["node", "openlens", "--enable-workspace-tabs"];

    expect(new WorkspaceTabsFeatureFlag().isEnabled).toBe(true);
  });

  it("remains disabled when arbitrary other CLI arguments are passed", () => {
    delete process.env.OPENLENS_WORKSPACE_TABS;
    window.localStorage.removeItem("openlens:workspace-tabs");
    process.argv = ["node", "openlens", "--other-flag", "--integration-testing"];

    expect(new WorkspaceTabsFeatureFlag().isEnabled).toBe(false);
  });
});
