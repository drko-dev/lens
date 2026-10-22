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

  const clean = () => {
    delete process.env.OPENLENS_WORKSPACE_TABS;
    delete process.env.OPENLENS_WORKSPACE_TABS_CLI;
    process.argv = ["node", "lens"];
    window.localStorage.removeItem("openlens:workspace-tabs");
  };

  it("defaults to ON and ignores the R4-01 pilot flag", () => {
    clean();
    process.env.OPENLENS_R4_PILOT = "false";

    const flag = new WorkspaceTabsFeatureFlag();

    expect(flag.isEnabled).toBe(true);
    expect(flag.overrideSource).toBeUndefined();
  });

  it("persisted preference beats the default", () => {
    clean();
    window.localStorage.setItem("openlens:workspace-tabs", "false");

    const flag = new WorkspaceTabsFeatureFlag();

    expect(flag.isEnabled).toBe(false);
    expect(flag.isLockedByOverride).toBe(false);
  });

  it("URL beats the persisted preference", () => {
    clean();
    window.localStorage.setItem("openlens:workspace-tabs", "true");
    window.history.pushState({}, "", "/?disable-workspace-tabs");

    try {
      const flag = new WorkspaceTabsFeatureFlag();

      expect(flag.isEnabled).toBe(false);
      expect(flag.overrideSource).toBe("url");
    } finally {
      window.history.pushState({}, "", "/");
    }
  });

  it("env beats URL and the persisted preference", () => {
    clean();
    window.localStorage.setItem("openlens:workspace-tabs", "true");
    process.env.OPENLENS_WORKSPACE_TABS = "false";
    window.history.pushState({}, "", "/?enable-workspace-tabs");

    try {
      const flag = new WorkspaceTabsFeatureFlag();

      expect(flag.isEnabled).toBe(false);
      expect(flag.overrideSource).toBe("env");
      expect(flag.isLockedByOverride).toBe(true);
    } finally {
      window.history.pushState({}, "", "/");
    }
  });

  it("CLI beats env", () => {
    clean();
    process.env.OPENLENS_WORKSPACE_TABS = "true";
    process.argv = ["node", "openlens", "--disable-workspace-tabs"];

    const flag = new WorkspaceTabsFeatureFlag();

    expect(flag.isEnabled).toBe(false);
    expect(flag.overrideSource).toBe("cli");
  });

  it("main-forwarded OPENLENS_WORKSPACE_TABS_CLI acts as the cli source and beats env", () => {
    clean();
    process.env.OPENLENS_WORKSPACE_TABS = "true";
    process.env.OPENLENS_WORKSPACE_TABS_CLI = "false";

    const flag = new WorkspaceTabsFeatureFlag();

    expect(flag.isEnabled).toBe(false);
    expect(flag.overrideSource).toBe("cli");
    delete process.env.OPENLENS_WORKSPACE_TABS_CLI;
  });

  it("--enable-workspace-tabs enables via CLI", () => {
    clean();
    window.localStorage.setItem("openlens:workspace-tabs", "false");
    process.argv = ["node", "openlens", "--enable-workspace-tabs"];

    expect(new WorkspaceTabsFeatureFlag().isEnabled).toBe(true);
  });

  it("setEnabled persists the preference when not overridden", () => {
    clean();

    const flag = new WorkspaceTabsFeatureFlag();

    flag.setEnabled(false);

    expect(flag.isEnabled).toBe(false);
    expect(window.localStorage.getItem("openlens:workspace-tabs")).toBe("false");
  });
});
