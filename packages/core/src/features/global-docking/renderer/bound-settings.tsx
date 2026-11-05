/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";

// Lazy on purpose: the Preferences tree imports half of the app, and panel-content-resolver (our importer) must stay light.
const Preferences = React.lazy(async () => ({ default: (await import("../../preferences/renderer/preferences")).Preferences }));

// SettingLayout is position: fixed; a transform makes this box its containing block, so it fills the panel only.
export const rootViewBoxStyle: React.CSSProperties = { position: "relative", height: "100%", minHeight: 0, overflow: "hidden", transform: "translateZ(0)" };

/**
 * H7.6.4: the real Settings view inside a panel. The tab still comes from the preferences route
 * (and falls back to the first tab when another root view owns the route); nothing here navigates.
 */
export const BoundSettings = () => (
  <div
    className="BoundSettings"
    style={rootViewBoxStyle}
    data-testid="bound-settings">
    <React.Suspense fallback={null}>
      <Preferences />
    </React.Suspense>
  </div>
);
