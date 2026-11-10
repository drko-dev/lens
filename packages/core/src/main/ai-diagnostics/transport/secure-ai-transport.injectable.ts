/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { DefaultSecureAiTransport, AuthorizedOpenAiNetworkEngine, DisabledRealNetworkEngine } from "./secure-ai-transport";
import type { SecureAiTransport } from "./ai-transport-types";

const secureAiTransportInjectable = getInjectable({
  id: "secure-ai-transport",

  instantiate: (): SecureAiTransport => {
    // Strictly offline until the Main process obtains explicit native approval.
    // The physical HTTP engine only permits TLS-pinned official OpenAI hosts.
    return new DefaultSecureAiTransport({
      engine: process.argv.includes("--offline")
        ? new DisabledRealNetworkEngine()
        : new AuthorizedOpenAiNetworkEngine(),
      allowSyntheticLocal: false,
    });
  },
});

export default secureAiTransportInjectable;
