/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import React from "react";
import { computed } from "mobx";
import { noop } from "lodash/fp";
import { Icon } from "../icon";
import type { SidebarItemRegistration } from "../layout/sidebar-items.injectable";
import { sidebarItemsInjectionToken } from "../layout/sidebar-items.injectable";

export const devopsSidebarItemId = "devops";

const devopsSidebarItemsInjectable = getInjectable({
  id: "devops-sidebar-items",

  instantiate: () =>
    computed((): SidebarItemRegistration[] => [
      {
        id: devopsSidebarItemId,
        parentId: null,
        title: "DevOps",
        getIcon: () => <Icon material="build" />,
        onClick: noop,
        orderNumber: 95,
      },
    ]),

  injectionToken: sidebarItemsInjectionToken,
});

export default devopsSidebarItemsInjectable;
