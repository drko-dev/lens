/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { DefaultSecureAiTransport } from "./secure-ai-transport";
import type { SecureAiTransport } from "./ai-transport-types";

const secureAiTransportInjectable = getInjectable({
  id: "secure-ai-transport",

  instantiate: (): SecureAiTransport => {
    // Defaults to fail-closed DisabledRealNetworkEngine in H8.8-01a
    return new DefaultSecureAiTransport();
  },
});

export default secureAiTransportInjectable;
