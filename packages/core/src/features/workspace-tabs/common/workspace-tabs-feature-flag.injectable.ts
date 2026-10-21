/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { action, computed, makeObservable, observable } from "mobx";

export class WorkspaceTabsFeatureFlag {
  @observable private explicitState: boolean | undefined = undefined;

  constructor() {
    makeObservable(this);
  }

  @action
  public setEnabled(enabled: boolean): void {
    this.explicitState = enabled;

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("openlens:workspace-tabs", enabled ? "true" : "false");
      }
    } catch {
      // Ignore localStorage errors in sandbox or tests
    }
  }

  @computed
  public get isEnabled(): boolean {
    if (this.explicitState !== undefined) {
      return this.explicitState;
    }

    // 1. Check CLI arguments (e.g. --enable-workspace-tabs)
    if (
      typeof process !== "undefined" &&
      Array.isArray(process.argv) &&
      process.argv.includes("--enable-workspace-tabs")
    ) {
      return true;
    }

    // 2. Check environment variables
    if (
      typeof process !== "undefined" &&
      process.env &&
      process.env.OPENLENS_WORKSPACE_TABS === "true"
    ) {
      return true;
    }

    // 3. Check window URL query parameters (if launched in browser/remote frame)
    if (
      typeof window !== "undefined" &&
      window.location &&
      typeof window.location.search === "string" &&
      window.location.search.includes("enable-workspace-tabs")
    ) {
      return true;
    }

    // 4. Check localStorage in renderer
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const stored = window.localStorage.getItem("openlens:workspace-tabs");

        if (stored === "true") return true;
        if (stored === "false") return false;
      } catch {
        // Fall through
      }
    }

    // Default: OFF
    return false;
  }
}

const workspaceTabsFeatureFlagInjectable = getInjectable({
  id: "workspace-tabs-feature-flag",
  instantiate: () => new WorkspaceTabsFeatureFlag(),
});

export default workspaceTabsFeatureFlagInjectable;
