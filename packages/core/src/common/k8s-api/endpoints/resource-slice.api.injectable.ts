/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import assert from "assert";
import { storesAndApisCanBeCreatedInjectionToken } from "../stores-apis-can-be-created.token";
import { ResourceSliceApi } from "./resource-dra.api";
import { kubeApiInjectionToken } from "../kube-api/kube-api-injection-token";
import { loggerInjectionToken } from "@openlens/logger";
import maybeKubeApiInjectable from "../maybe-kube-api.injectable";

const resourceSliceApiInjectable = getInjectable({
  id: "resource-slice-api",
  instantiate: (di) => {
    assert(di.inject(storesAndApisCanBeCreatedInjectionToken), "resourceSliceApi is only available in certain environments");

    return new ResourceSliceApi({
      logger: di.inject(loggerInjectionToken),
      maybeKubeApi: di.inject(maybeKubeApiInjectable),
    });
  },
  injectionToken: kubeApiInjectionToken,
});

export default resourceSliceApiInjectable;
