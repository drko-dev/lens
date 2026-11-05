/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { action, computed, makeObservable, observable } from "mobx";

export type FloatingPanelsOverrideSource = "cli" | "env" | "url";

export class FloatingPanelsFeatureFlag {
  @observable private explicitState: boolean | undefined = undefined;

  constructor() {
    makeObservable(this);
  }

  @action
  public setEnabled(enabled: boolean): void {
    this.explicitState = enabled;

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("openlens:floating-panels", enabled ? "true" : "false");
      }
    } catch {
      // Ignore localStorage errors in sandbox or tests
    }
  }

  @computed
  public get override(): { source: FloatingPanelsOverrideSource; enabled: boolean } | undefined {
    const argv = typeof process !== "undefined" && Array.isArray(process.argv) ? process.argv : [];

    if (argv.includes("--disable-floating-panels") || argv.includes("--disable-split-panels")) {
      return { source: "cli", enabled: false };
    }

    if (argv.includes("--enable-floating-panels") || argv.includes("--enable-split-panels")) {
      return { source: "cli", enabled: true };
    }

    const cliEnv = typeof process !== "undefined" && process.env ? process.env.OPENLENS_FLOATING_PANELES_CLI : undefined;

    if (cliEnv === "false") return { source: "cli", enabled: false };
    if (cliEnv === "true") return { source: "cli", enabled: true };

    const envValue = typeof process !== "undefined" && process.env
      ? (process.env.OPENLENS_FLOATING_PANELS ?? process.env.OPENLENS_SPLIT_PANELS)?.toLowerCase()
      : undefined;

    if (envValue === "false" || envValue === "0") return { source: "env", enabled: false };
    if (envValue === "true" || envValue === "1") return { source: "env", enabled: true };

    const search = typeof window !== "undefined" && window.location && typeof window.location.search === "string"
      ? window.location.search
      : "";

    if (search.includes("disable-floating-panels") || search.includes("disable-split-panels")) {
      return { source: "url", enabled: false };
    }

    if (search.includes("enable-floating-panels") || search.includes("enable-split-panels")) {
      return { source: "url", enabled: true };
    }

    return undefined;
  }

  @computed
  public get overrideSource(): FloatingPanelsOverrideSource | undefined {
    return this.override?.source;
  }

  @computed
  public get isLockedByOverride(): boolean {
    return this.overrideSource !== undefined;
  }

  @computed
  public get isEnabled(): boolean {
    const override = this.override;

    if (override) return override.enabled;

    if (this.explicitState !== undefined) return this.explicitState;

    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const stored = window.localStorage.getItem("openlens:floating-panels");

        if (stored === "true") return true;
        if (stored === "false") return false;
      } catch {
        // Fall through
      }
    }

    // Default for H1: ON in development
    return true;
  }
}

const floatingPanelsFeatureFlagInjectable = getInjectable({
  id: "floating-panels-feature-flag",
  instantiate: () => new FloatingPanelsFeatureFlag(),
});

export default floatingPanelsFeatureFlagInjectable;
