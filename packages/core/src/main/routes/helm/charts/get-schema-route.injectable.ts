/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { apiPrefix } from "../../../../common/vars";
import { getRouteInjectable } from "../../../router/router.injectable";
import { route } from "../../../router/route";
import type { HelmChartSchemaResult } from "../../../../common/helm/helm-chart-schema";
import getHelmChartSchemaInjectable from "../../../helm/get-helm-chart-schema.injectable";

/**
 * Returns the `values.schema.json` of a chart.
 *
 * The chart reference is passed as a query parameter (and not as a path segment) because a chart
 * reference may be prefixed with its repository (`repo/chart`), which would not survive being
 * used as a single path segment.
 */
const getHelmChartSchemaRouteInjectable = getRouteInjectable({
  id: "get-helm-chart-schema-route",

  instantiate: (di) => {
    const getHelmChartSchema = di.inject(getHelmChartSchemaInjectable);

    return route({
      method: "get",
      path: `${apiPrefix}/v2/charts/schema`,
    })(async ({ query }): Promise<{ response: HelmChartSchemaResult }> => {
      const chart = query.get("chart");
      const version = query.get("version") ?? undefined;

      if (!chart) {
        return {
          response: {
            status: "unavailable",
            reason: "The chart reference is required to look up its schema",
          },
        };
      }

      return {
        response: await getHelmChartSchema({ chart, version }),
      };
    });
  },
});

export default getHelmChartSchemaRouteInjectable;
