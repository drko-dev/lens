/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import sqliteClientInjectable from "../incident-storage/sqlite-client.injectable";
import aiProfileManagerInjectable from "./ai-profile-manager.injectable";
import secureAiTransportInjectable from "./transport/secure-ai-transport.injectable";
import aiDiagnosisEngineInjectable from "./ai-diagnosis-engine.injectable";
import { AiDefaultProfileService } from "./ai-default-profile-service";

const aiDefaultProfileServiceInjectable = getInjectable({
  id: "ai-default-profile-service",

  instantiate: (di) => new AiDefaultProfileService(
    di.inject(sqliteClientInjectable),
    di.inject(aiProfileManagerInjectable),
    di.inject(secureAiTransportInjectable),
    di.inject(aiDiagnosisEngineInjectable),
  ),
});

export default aiDefaultProfileServiceInjectable;
