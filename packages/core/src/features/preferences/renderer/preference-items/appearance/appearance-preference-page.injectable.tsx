/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { PreferenceItemComponent, PreferencePage } from "../preference-item-injection-token";
import { preferenceItemInjectionToken } from "../preference-item-injection-token";
import { PreferencePageComponent } from "../../preference-page-component";
import { HorizontalLine } from "../../../../../renderer/components/horizontal-line/horizontal-line";
import React from "react";

const AppearancePage: PreferenceItemComponent<PreferencePage> = ({ children, item }) => (
  <PreferencePageComponent title="Appearance" id={item.id}>
    {children}
  </PreferencePageComponent>
);

const appearancePreferencePageInjectable = getInjectable({
  id: "appearance-preference-page",

  instantiate: () => ({
    kind: "page" as const,
    id: "appearance-page",
    parentId: "appearance-tab",
    Component: AppearancePage,
    childSeparator: () => <HorizontalLine />,
  }),

  injectionToken: preferenceItemInjectionToken,
});

export default appearancePreferencePageInjectable;
