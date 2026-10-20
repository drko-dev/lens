/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import assert from "assert";
import { storesAndApisCanBeCreatedInjectionToken } from "../stores-apis-can-be-created.token";
import { EndpointSliceApi } from "./endpoint-slice.api";
import { kubeApiInjectionToken } from "../kube-api/kube-api-injection-token";
import { loggerInjectionToken } from "@openlens/logger";
import maybeKubeApiInjectable from "../maybe-kube-api.injectable";

const endpointSliceApiInjectable = getInjectable({
  id: "endpoint-slice-api",
  instantiate: (di) => {
    assert(di.inject(storesAndApisCanBeCreatedInjectionToken), "endpointSliceApi is only available in certain environments");

    return new EndpointSliceApi({
      logger: di.inject(loggerInjectionToken),
      maybeKubeApi: di.inject(maybeKubeApiInjectable),
    });
  },
  injectionToken: kubeApiInjectionToken,
});

export default endpointSliceApiInjectable;
