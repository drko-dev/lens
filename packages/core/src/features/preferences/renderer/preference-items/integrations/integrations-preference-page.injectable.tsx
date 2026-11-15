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

const IntegrationsPage: PreferenceItemComponent<PreferencePage> = ({ children, item }) => (
  <PreferencePageComponent title="Integrations" id={item.id}>
    {children}
  </PreferencePageComponent>
);

const integrationsPreferencePageInjectable = getInjectable({
  id: "integrations-preference-page",

  instantiate: () => ({
    kind: "page" as const,
    id: "integrations-page",
    parentId: "integrations-tab",
    Component: IntegrationsPage,
    childSeparator: () => <HorizontalLine />,
  }),

  injectionToken: preferenceItemInjectionToken,
});

export default integrationsPreferencePageInjectable;
