/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import type { KubeObjectMenuItemComponent } from "../kube-object-menu-item-injection-token";
import { kubeObjectMenuItemInjectionToken } from "../kube-object-menu-item-injection-token";
import { NodeMenu } from "../../nodes/node-menu";

const nodeMenuInjectable = getInjectable({
  id: "node-menu-kube-object-menu",
  instantiate: () => ({
    kind: "Node",
    apiVersions: ["v1"],
    Component: NodeMenu as KubeObjectMenuItemComponent,
    enabled: computed(() => true),
    orderNumber: 20,
  }),
  injectionToken: kubeObjectMenuItemInjectionToken,
});

export default nodeMenuInjectable;
