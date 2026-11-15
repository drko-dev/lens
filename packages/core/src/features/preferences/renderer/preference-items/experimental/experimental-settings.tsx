/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React, { useState } from "react";
import { SubTitle } from "../../../../../renderer/components/layout/sub-title";
import { Switch } from "../../../../../renderer/components/switch";
import { globalDockingStorageKey, isGlobalDockingEnabled } from "../../../../global-docking/renderer/global-docking-feature-flag";

export const ExperimentalSettings = () => {
  const [globalDocking, setGlobalDocking] = useState<boolean>(() =>
    isGlobalDockingEnabled(typeof window !== "undefined" ? window.localStorage : undefined),
  );

  const toggleGlobalDocking = (checked: boolean) => {
    try {
      window.localStorage.setItem(globalDockingStorageKey, checked ? "true" : "false");
    } catch {
      // Ignore storage errors in restricted contexts
    }
    setGlobalDocking(checked);
  };

  return (
    <section id="experimental" data-testid="experimental-preferences-section">
      <SubTitle title="Experimental Features" />
      <div className="notice" style={{ marginBottom: 16 }}>
        Experimental features let you try out new functionality that is still in development. These features may be unstable, change without notice, or be removed entirely.
      </div>
      <div className="flex gaps align-center justify-between" style={{ padding: "8px 0" }}>
        <div>
          <div style={{ fontWeight: 500 }}>Universal Global Docking Host</div>
          <div className="hint">
            Enable the split-panel universal docking host across cluster views (takes effect on next reload).
          </div>
        </div>
        <Switch
          checked={globalDocking}
          onChange={toggleGlobalDocking}
          data-testid="experimental-global-docking-switch"
        />
      </div>
    </section>
  );
};
