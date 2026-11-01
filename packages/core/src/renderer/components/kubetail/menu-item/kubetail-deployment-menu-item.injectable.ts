/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import type { KubeObjectMenuItemComponent } from "../../kube-object-menu/kube-object-menu-item-injection-token";
import { kubeObjectMenuItemInjectionToken } from "../../kube-object-menu/kube-object-menu-item-injection-token";
import { KubetailMenuItem } from "./kubetail-menu-item";

const kubetailDeploymentMenuItemInjectable = getInjectable({
  id: "kubetail-deployment-menu-item",
  instantiate: () => ({
    kind: "Deployment",
    apiVersions: ["apps/v1"],
    Component: KubetailMenuItem as KubeObjectMenuItemComponent,
    enabled: computed(() => true),
    orderNumber: 25,
  }),
  injectionToken: kubeObjectMenuItemInjectionToken,
});

export default kubetailDeploymentMenuItemInjectable;
