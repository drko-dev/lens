/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import assert from "assert";
import { storesAndApisCanBeCreatedInjectionToken } from "../stores-apis-can-be-created.token";
import { ResourceClaimTemplateApi } from "./resource-dra.api";
import { kubeApiInjectionToken } from "../kube-api/kube-api-injection-token";
import { loggerInjectionToken } from "@openlens/logger";
import maybeKubeApiInjectable from "../maybe-kube-api.injectable";

const resourceClaimTemplateApiInjectable = getInjectable({
  id: "resource-claim-template-api",
  instantiate: (di) => {
    assert(di.inject(storesAndApisCanBeCreatedInjectionToken), "resourceClaimTemplateApi is only available in certain environments");

    return new ResourceClaimTemplateApi({
      logger: di.inject(loggerInjectionToken),
      maybeKubeApi: di.inject(maybeKubeApiInjectable),
    });
  },
  injectionToken: kubeApiInjectionToken,
});

export default resourceClaimTemplateApiInjectable;
