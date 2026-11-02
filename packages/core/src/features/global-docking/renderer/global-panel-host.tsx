/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./global-panel-host.module.scss";
import React from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { DynamicLayoutRenderer } from "../../../renderer/components/split-panel/dynamic-layout-renderer";
import type { SplitPanelStore } from "../../../renderer/components/split-panel/split-panel-store";
import globalPanelStoreInjectable from "./global-panel-store.injectable";

interface Dependencies {
  store: SplitPanelStore;
}

// Each leaf mounts its route view exactly once; the classic route component is not rendered alongside.
const NonInjectedGlobalPanelHost = observer(({ store }: Dependencies) => (
  <div className={styles.globalPanelHost} data-testid="global-panel-host" data-cluster-id={store.clusterId}>
    <DynamicLayoutRenderer node={store.rootNode} splitPanelStore={store} />
  </div>
));

export const GlobalPanelHost = withInjectables<Dependencies>(NonInjectedGlobalPanelHost, {
  getProps: (di, props) => ({
    ...props,
    store: di.inject(globalPanelStoreInjectable),
  }),
});
