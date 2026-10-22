/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { generate } from "selfsigned";
import { getInjectable } from "@ogre-tools/injectable";

/**
 * R4-09: client certificate that Main presents to every lens-k8s-proxy (mutual TLS).
 * Generated once per Main process and kept in memory only: lens-k8s-proxy receives just
 * the public certificate (on stdin) and rejects any TLS client that cannot prove this key.
 */
const kubeAuthProxyClientCertificateInjectable = getInjectable({
  id: "kube-auth-proxy-client-certificate",
  instantiate: () => generate(
    [
      { name: "commonName", value: "OpenLens kube-auth-proxy client" },
      { name: "organizationName", value: "Lens" },
    ],
    {
      keySize: 2048,
      algorithm: "sha256",
      days: 365,
      extensions: [
        { name: "basicConstraints", cA: true },
        { name: "keyUsage", digitalSignature: true, keyCertSign: true },
        { name: "extKeyUsage", clientAuth: true },
      ],
    },
  ),
});

export default kubeAuthProxyClientCertificateInjectable;
