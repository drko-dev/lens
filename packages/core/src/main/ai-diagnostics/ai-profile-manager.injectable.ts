/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import sqliteClientInjectable from "../incident-storage/sqlite-client.injectable";
import secureCredentialVaultInjectable from "./secure-credential-vault.injectable";
import { AiProfileManager } from "./ai-profile-manager";

const aiProfileManagerInjectable = getInjectable({
  id: "ai-profile-manager",

  instantiate: (di) => {
    const sqlite = di.inject(sqliteClientInjectable);
    const vault = di.inject(secureCredentialVaultInjectable);

    return new AiProfileManager(sqlite, vault);
  },
});

export default aiProfileManagerInjectable;
