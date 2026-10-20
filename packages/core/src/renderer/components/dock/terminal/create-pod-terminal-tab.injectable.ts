/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { Pod, Container } from "@openlens/kube-object";
import dockStoreInjectable from "../dock/store.injectable";
import type { TabId } from "../dock/store";
import { TabKind } from "../dock/store";

export interface PodTerminalTabData {
  selectedPod: Pod;
  selectedContainer: Container | { name: string };
}

export type CreatePodTerminalTab = (data: PodTerminalTabData) => TabId;

const createPodTerminalTabInjectable = getInjectable({
  id: "create-pod-terminal-tab",

  instantiate: (di): CreatePodTerminalTab => {
    const dockStore = di.inject(dockStoreInjectable);

    return ({ selectedPod, selectedContainer }): TabId => {
      const podName = selectedPod.getName();
      const namespace = selectedPod.getNs();
      const containerName = selectedContainer.name;

      const tab = dockStore.createTab({
        title: `Pod: ${podName} (${containerName})`,
        kind: TabKind.TERMINAL,
        pod: podName,
        namespace,
        container: containerName,
      });

      return tab.id;
    };
  },
});

export default createPodTerminalTabInjectable;
