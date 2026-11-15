/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { preferenceItemInjectionToken } from "../../preference-item-injection-token";
import { ColorizedClusters } from "./colorized-clusters";

const colorizedClustersPreferenceBlockInjectable = getInjectable({
  id: "colorized-clusters-preference-item",

  instantiate: () => ({
    kind: "block" as const,
    id: "colorized-clusters",
    parentId: "application-page",
    orderNumber: 25,
    Component: ColorizedClusters,
  }),

  injectionToken: preferenceItemInjectionToken,
});

export default colorizedClustersPreferenceBlockInjectable;
