/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import type { IComputedValue } from "mobx";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { SplitPanelStore } from "../../../renderer/components/split-panel/split-panel-store";
import { PanelHostView } from "./global-panel-host";
import rootPanelStoreInjectable from "./root-panel-store.injectable";
import activeRootPanelKindInjectable from "./active-root-panel-kind.injectable";
import type { RootPanelKind } from "./root-panel-store";

interface Dependencies {
  store: SplitPanelStore;
  activeKind: IComputedValue<RootPanelKind | undefined>;
}

/**
 * H7.6.4: the same docking engine as GlobalPanelHost for the root frame views.
 * No cluster identity, no detach, no terminal/kubetail entries in its catalog.
 */
export const NonInjectedRootPanelHost = ({ store, activeKind }: Dependencies) => (
  <PanelHostView
    store={store}
    activeKind={activeKind}
    testId="root-panel-host"
    onSelectPanel={(kind, orientation) => store.addPanel(kind, undefined, orientation)}
    isKindAllowed={(kind) => store.canAddPanelKind(kind)}
  />
);

export const RootPanelHost = withInjectables<Dependencies>(NonInjectedRootPanelHost, {
  getProps: (di, props) => ({
    ...props,
    store: di.inject(rootPanelStoreInjectable),
    activeKind: di.inject(activeRootPanelKindInjectable),
  }),
});
