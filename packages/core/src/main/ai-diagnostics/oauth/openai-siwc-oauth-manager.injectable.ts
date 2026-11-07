/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import aiProfileManagerInjectable from "../ai-profile-manager.injectable";
import secureAiTransportInjectable from "../transport/secure-ai-transport.injectable";
import { OpenAiSiwcOAuthManager } from "./openai-siwc-oauth-manager";

const openAiSiwcOAuthManagerInjectable = getInjectable({
  id: "openai-siwc-oauth-manager",

  instantiate: (di) => {
    const profileManager = di.inject(aiProfileManagerInjectable);
    const transport = di.inject(secureAiTransportInjectable);

    return new OpenAiSiwcOAuthManager(profileManager, transport);
  },
});

export default openAiSiwcOAuthManagerInjectable;
