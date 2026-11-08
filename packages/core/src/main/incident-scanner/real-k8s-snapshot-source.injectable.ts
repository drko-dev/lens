/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { Agent } from "https";
import fetchInjectable from "../../common/fetch/fetch.injectable";
import lensProxyCertificateInjectable from "../../common/certificate/lens-proxy-certificate.injectable";
import { getProxyAuthHeadersInjectionToken } from "../../common/lens-proxy-auth/proxy-auth";
import lensProxyPortInjectable from "../lens-proxy/lens-proxy-port.injectable";
import {
  RealK8sSnapshotSource,
  type RealK8sHttpClient,
  type RealK8sHttpClientOptions,
} from "./real-k8s-snapshot-source";

const realK8sSnapshotSourceInjectable = getInjectable({
  id: "real-k8s-snapshot-source",
  instantiate: (di) => {
    const lensProxyPort = di.inject(lensProxyPortInjectable);
    const lensProxyCert = di.inject(lensProxyCertificateInjectable);
    const getProxyAuthHeaders = di.inject(getProxyAuthHeadersInjectionToken);
    const fetch = di.inject(fetchInjectable);

    const httpClient: RealK8sHttpClient = {
      async get(url: string, options?: RealK8sHttpClientOptions) {
        const parsed = new URL(url);
        // Cluster ID is the first path segment of the loopback proxy URL: /:clusterId/...
        const clusterId = decodeURIComponent(parsed.pathname.split("/")[1] || "");
        const authHeaders = getProxyAuthHeaders ? getProxyAuthHeaders(clusterId) : {};

        const agent = new Agent({
          ca: lensProxyCert.get().cert,
          rejectUnauthorized: true,
        });

        const res = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            ...authHeaders,
          },
          agent,
          signal: options?.signal,
          redirect: "error",
        });

        if (!res.ok) {
          const bodyText = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${res.statusText}: ${bodyText}`);
        }

        return res.json();
      },
    };

    return new RealK8sSnapshotSource({
      // Fail-closed by default: live cluster collection strictly requires explicit operator authorization
      isRealK8sAuthorized: false,
      proxyUrlResolver: (clusterId: string) => {
        const port = lensProxyPort.get();
        return `https://127.0.0.1:${port}/${encodeURIComponent(clusterId)}`;
      },
      httpClient,
    });
  },
});

export default realK8sSnapshotSourceInjectable;
