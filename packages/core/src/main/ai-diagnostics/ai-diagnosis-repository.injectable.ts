/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import sqliteClientInjectable from "../incident-storage/sqlite-client.injectable";
import { AiDiagnosisRepository } from "./ai-diagnosis-repository";

const aiDiagnosisRepositoryInjectable = getInjectable({
  id: "ai-diagnosis-repository",

  instantiate: (di) => {
    const sqlite = di.inject(sqliteClientInjectable);

    return new AiDiagnosisRepository(sqlite);
  },
});

export default aiDiagnosisRepositoryInjectable;
