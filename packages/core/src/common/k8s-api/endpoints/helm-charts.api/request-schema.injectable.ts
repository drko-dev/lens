/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { urlBuilderFor } from "@openlens/utilities";
import type { HelmChartSchemaResult } from "../../../helm/helm-chart-schema";
import apiBaseInjectable from "../../api-base.injectable";

export type RequestHelmChartSchema = (chart: string, version?: string) => Promise<HelmChartSchemaResult>;

const requestSchemaEndpoint = urlBuilderFor("/v2/charts/schema");

const requestHelmChartSchemaInjectable = getInjectable({
  id: "request-helm-chart-schema",

  instantiate: (di): RequestHelmChartSchema => {
    const apiBase = di.inject(apiBaseInjectable);

    return (chart: string, version?: string) => apiBase.get(requestSchemaEndpoint.compile(
      {},
      { chart, ...(version !== undefined ? { version } : {}) },
    ));
  },
});

export default requestHelmChartSchemaInjectable;
