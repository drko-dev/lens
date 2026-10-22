/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { action, computed, makeObservable, observable } from "mobx";

export type WorkspaceTabsOverrideSource = "cli" | "env" | "url";

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

  /**
   * Highest-precedence explicit override (CLI > env > URL), if any.
   * The persisted preference and the default are not overrides.
   */
  @computed
  public get override(): { source: WorkspaceTabsOverrideSource; enabled: boolean } | undefined {
    const argv = typeof process !== "undefined" && Array.isArray(process.argv) ? process.argv : [];

    if (argv.includes("--disable-workspace-tabs")) return { source: "cli", enabled: false };
    if (argv.includes("--enable-workspace-tabs")) return { source: "cli", enabled: true };

    // Main forwards its CLI flags to renderers through this env var (renderer argv lacks them)
    const cliEnv = typeof process !== "undefined" && process.env ? process.env.OPENLENS_WORKSPACE_TABS_CLI : undefined;

    if (cliEnv === "false") return { source: "cli", enabled: false };
    if (cliEnv === "true") return { source: "cli", enabled: true };

    const envValue = typeof process !== "undefined" && process.env
      ? process.env.OPENLENS_WORKSPACE_TABS?.toLowerCase()
      : undefined;

    if (envValue === "false" || envValue === "0") return { source: "env", enabled: false };
    if (envValue === "true" || envValue === "1") return { source: "env", enabled: true };

    const search = typeof window !== "undefined" && window.location && typeof window.location.search === "string"
      ? window.location.search
      : "";

    if (search.includes("disable-workspace-tabs")) return { source: "url", enabled: false };
    if (search.includes("enable-workspace-tabs")) return { source: "url", enabled: true };

    return undefined;
  }

  @computed
  public get overrideSource(): WorkspaceTabsOverrideSource | undefined {
    return this.override?.source;
  }

  /** True when any override forces the value, so the Preferences toggle must be read-only. */
  @computed
  public get isLockedByOverride(): boolean {
    return this.overrideSource !== undefined;
  }

  @computed
  public get isEnabled(): boolean {
    const override = this.override;

    if (override) return override.enabled;

    // In-session explicit choice (mirrors the persisted preference)
    if (this.explicitState !== undefined) return this.explicitState;

    // Persisted user preference
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const stored = window.localStorage.getItem("openlens:workspace-tabs");

        if (stored === "true") return true;
        if (stored === "false") return false;
      } catch {
        // Fall through
      }
    }

    // Default: ON
    return true;
  }
}

const workspaceTabsFeatureFlagInjectable = getInjectable({
  id: "workspace-tabs-feature-flag",
  instantiate: () => new WorkspaceTabsFeatureFlag(),
});

export default workspaceTabsFeatureFlagInjectable;
