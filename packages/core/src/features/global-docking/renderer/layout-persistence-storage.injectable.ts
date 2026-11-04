/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { runInAction } from "mobx";
import lensLocalStorageStateInjectable from "../../../renderer/utils/create-storage/state.injectable";

/**
 * H7.7: the layout must survive a full restart. A cluster frame's window.localStorage is keyed by an origin
 * that includes the per-launch proxy port, so it is NOT stable. The app's own lens-local-storage state is
 * stored on disk per hosted cluster ("<clusterId>.json", root frame: "app.json") and loaded before the UI starts.
 */
const layoutPersistenceStorageInjectable = getInjectable({
  id: "global-docking-layout-persistence-storage",
  instantiate: (di) => {
    const state = di.inject(lensLocalStorageStateInjectable) as Record<string, unknown>;

    return {
      getItem: (key: string) => (typeof state[key] === "string" ? state[key] as string : null),
      setItem: (key: string, value: string) => runInAction(() => {
        state[key] = value;
      }),
      removeItem: (key: string) => runInAction(() => {
        delete state[key];
      }),
    };
  },
});

export default layoutPersistenceStorageInjectable;
