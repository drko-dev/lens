/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { KubeObjectMenuItemComponent } from "../kube-object-menu-item-injection-token";
import { kubeObjectMenuItemInjectionToken } from "../kube-object-menu-item-injection-token";
import { computed } from "mobx";
import { VolumeClaimMenu } from "../../storage-volume-claims/volume-claim-menu";

const volumeClaimMenuInjectable = getInjectable({
  id: "volume-claim-menu-kube-object-menu",

  instantiate: () => ({
    kind: "PersistentVolumeClaim",
    apiVersions: ["v1"],
    Component: VolumeClaimMenu as KubeObjectMenuItemComponent,
    enabled: computed(() => true),
    orderNumber: 20,
  }),

  injectionToken: kubeObjectMenuItemInjectionToken,
});

export default volumeClaimMenuInjectable;
