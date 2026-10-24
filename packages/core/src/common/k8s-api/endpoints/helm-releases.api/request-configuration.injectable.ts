/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { urlBuilderFor } from "@openlens/utilities";
import apiBaseInjectable from "../../api-base.injectable";

export type RequestHelmReleaseConfiguration = (
  name: string,
  namespace: string,
  all: boolean,
  /**
   * Optional revision to read the values from. When omitted the current revision is used,
   * which keeps the previous behaviour of every existing consumer untouched.
   */
  revision?: number,
) => Promise<string>;

const requestConfigurationEnpoint = urlBuilderFor("/v2/releases/:namespace/:name/values");

const requestHelmReleaseConfigurationInjectable = getInjectable({
  id: "request-helm-release-configuration",

  instantiate: (di): RequestHelmReleaseConfiguration => {
    const apiBase = di.inject(apiBaseInjectable);

    return (name: string, namespace: string, all: boolean, revision?: number) => (
      apiBase.get(requestConfigurationEnpoint.compile(
        { name, namespace },
        { all, ...(revision !== undefined ? { revision } : {}) },
      ))
    );
  },
});

export default requestHelmReleaseConfigurationInjectable;
