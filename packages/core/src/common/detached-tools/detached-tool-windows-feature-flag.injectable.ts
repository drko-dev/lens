/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { action, computed, makeObservable, observable } from "mobx";

/**
 * R4-06: detached tool windows are OFF unless `--enable-detached-tools` is passed
 * or `OPENLENS_DETACHED_TOOLS=1` is set. Shared by Main (which refuses requests)
 * and the cluster frame (which hides the detach actions).
 */
export class DetachedToolWindowsFeatureFlag {
  @observable private explicitState: boolean | undefined = undefined;

  constructor() {
    makeObservable(this);
  }

  @action
  public setEnabled(enabled: boolean | undefined): void {
    this.explicitState = enabled;
  }

  @computed
  public get isEnabled(): boolean {
    if (this.explicitState !== undefined) {
      return this.explicitState;
    }

    if (typeof process !== "undefined") {
      if (Array.isArray(process.argv) && process.argv.includes("--enable-detached-tools")) {
        return true;
      }

      const fromEnv = process.env?.OPENLENS_DETACHED_TOOLS;

      return fromEnv === "1" || fromEnv === "true";
    }

    return false;
  }
}

const detachedToolWindowsFeatureFlagInjectable = getInjectable({
  id: "detached-tool-windows-feature-flag",
  instantiate: () => new DetachedToolWindowsFeatureFlag(),
});

export default detachedToolWindowsFeatureFlagInjectable;
