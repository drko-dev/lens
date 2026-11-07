/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import sqliteClientInjectable from "../incident-storage/sqlite-client.injectable";
import { SecureCredentialVault } from "./secure-credential-vault";

const secureCredentialVaultInjectable = getInjectable({
  id: "secure-credential-vault",

  instantiate: (di) => {
    const sqlite = di.inject(sqliteClientInjectable);

    return new SecureCredentialVault({ sqlite });
  },
});

export default secureCredentialVaultInjectable;
