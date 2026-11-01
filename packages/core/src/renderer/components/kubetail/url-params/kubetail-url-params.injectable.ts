/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import createPageParamInjectable from "../../../navigation/create-page-param.injectable";
import type { PageParam } from "../../../navigation/page-param";

export interface KubetailUrlParams {
  kind: PageParam<string>;
  name: PageParam<string>;
  namespace: PageParam<string>;
  uid: PageParam<string>;
}

const kubetailUrlParamsInjectable = getInjectable({
  id: "kubetail-url-params",
  instantiate: (di): KubetailUrlParams => {
    const createPageParam = di.inject(createPageParamInjectable);

    return {
      kind: createPageParam<string>({ name: "kind" }),
      name: createPageParam<string>({ name: "name" }),
      namespace: createPageParam<string>({ name: "namespace" }),
      uid: createPageParam<string>({ name: "uid" }),
    };
  },
});

export default kubetailUrlParamsInjectable;
