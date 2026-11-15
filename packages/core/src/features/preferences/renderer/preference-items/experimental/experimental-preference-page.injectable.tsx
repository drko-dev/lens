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

const ExperimentalPage: PreferenceItemComponent<PreferencePage> = ({ children, item }) => (
  <PreferencePageComponent title="Experimental" id={item.id}>
    {children}
  </PreferencePageComponent>
);

const experimentalPreferencePageInjectable = getInjectable({
  id: "experimental-preference-page",

  instantiate: () => ({
    kind: "page" as const,
    id: "experimental-page",
    parentId: "experimental-tab",
    Component: ExperimentalPage,
    childSeparator: () => <HorizontalLine />,
  }),

  injectionToken: preferenceItemInjectionToken,
});

export default experimentalPreferencePageInjectable;
