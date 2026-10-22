/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { Agent } from "https";
import type { RequestInit } from "@openlens/node-fetch";
import lensProxyCertificateInjectable from "../certificate/lens-proxy-certificate.injectable";
import fetchInjectable from "../fetch/fetch.injectable";
import { loggerInjectionToken } from "@openlens/logger";
import type { JsonApiConfig, JsonApiDependencies } from "@openlens/json-api";
import { KubeJsonApi } from "./kube-json-api";
import { getProxyAuthHeadersInjectionToken } from "../lens-proxy-auth/proxy-auth";
import { getClusterIdFromHost } from "../utils/cluster-id-url-parsing";

export type CreateKubeJsonApi = (config: JsonApiConfig, reqInit?: RequestInit) => KubeJsonApi;

const createKubeJsonApiInjectable = getInjectable({
  id: "create-kube-json-api",
  instantiate: (di): CreateKubeJsonApi => {
    const dependencies: JsonApiDependencies = {
      fetch: di.inject(fetchInjectable),
      logger: di.inject(loggerInjectionToken),
    };
    const lensProxyCert = di.inject(lensProxyCertificateInjectable);
    const getProxyAuthHeaders = di.inject(getProxyAuthHeadersInjectionToken);

    return (config, reqInit) => {
      // R4-08: the proxy token scope follows the Host the request targets (resolved per request so rotation is honoured)
      const hostHeader = Object.entries(reqInit?.headers ?? {}).find(([name]) => name.toLowerCase() === "host")?.[1];
      const clusterId = typeof hostHeader === "string" ? getClusterIdFromHost(hostHeader) : undefined;
      const customGetRequestOptions = config.getRequestOptions;

      const getRequestOptions = async () => {
        const custom = await customGetRequestOptions?.();

        return {
          agent: new Agent({
            ca: lensProxyCert.get().cert,
          }),
          ...custom,
          headers: {
            ...(custom?.headers as Record<string, string> | undefined),
            ...getProxyAuthHeaders(clusterId),
          },
        };
      };

      return new KubeJsonApi(dependencies, { ...config, getRequestOptions }, reqInit);
    };
  },
});

export default createKubeJsonApiInjectable;
