/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import deploymentStoreInjectable from "../workloads-deployments/store.injectable";
import podStoreInjectable from "../workloads-pods/store.injectable";
import kubetailStreamClientInjectable from "./kubetail-stream-client.injectable";
import { KubetailStore } from "./kubetail-store";

const kubetailStoreInjectable = getInjectable({
  id: "kubetail-store",
  instantiate: (di) => new KubetailStore({
    deploymentStore: di.inject(deploymentStoreInjectable),
    podStore: di.inject(podStoreInjectable),
    streamClient: di.inject(kubetailStreamClientInjectable),
  }),
});

export default kubetailStoreInjectable;
