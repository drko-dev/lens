/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import activeEntityInternalClusterInjectable from "../../api/catalog/entity/get-active-cluster-entity.injectable";
import { isProductionEnvironment } from "../../../common/cluster/environment-types";

const isProductionClusterInjectable = getInjectable({
  id: "is-production-cluster",
  instantiate: (di) => {
    const activeCluster = di.inject(activeEntityInternalClusterInjectable);

    return computed(() => {
      const cluster = activeCluster.get();

      return isProductionEnvironment(cluster?.preferences);
    });
  },
});

export default isProductionClusterInjectable;
