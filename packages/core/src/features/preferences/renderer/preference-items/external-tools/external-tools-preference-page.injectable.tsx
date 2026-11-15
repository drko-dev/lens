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

const ExternalToolsPage: PreferenceItemComponent<PreferencePage> = ({ children, item }) => (
  <PreferencePageComponent title="External Tools" id={item.id}>
    {children}
  </PreferencePageComponent>
);

const externalToolsPreferencePageInjectable = getInjectable({
  id: "external-tools-preference-page",

  instantiate: () => ({
    kind: "page" as const,
    id: "external-tools-page",
    parentId: "external-tools-tab",
    Component: ExternalToolsPage,
    childSeparator: () => <HorizontalLine />,
  }),

  injectionToken: preferenceItemInjectionToken,
});

export default externalToolsPreferencePageInjectable;
