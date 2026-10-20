/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import type { KubeObjectMenuItemComponent } from "../kube-object-menu-item-injection-token";
import { kubeObjectMenuItemInjectionToken } from "../kube-object-menu-item-injection-token";
import { PodDevOpsMenu } from "../../workloads-pods/pod-devops-menu";

const podDevOpsMenuInjectable = getInjectable({
  id: "pod-devops-menu-kube-object-menu",
  instantiate: () => ({
    kind: "Pod",
    apiVersions: ["v1"],
    Component: PodDevOpsMenu as KubeObjectMenuItemComponent,
    enabled: computed(() => true),
    orderNumber: 15,
  }),
  injectionToken: kubeObjectMenuItemInjectionToken,
});

export default podDevOpsMenuInjectable;
