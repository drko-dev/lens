/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import incidentRepositoryInjectable from "../incident-storage/incident-repository.injectable";
import evidenceRepositoryInjectable from "../incident-storage/evidence-repository.injectable";
import aiProfileManagerInjectable from "./ai-profile-manager.injectable";
import aiDiagnosisRepositoryInjectable from "./ai-diagnosis-repository.injectable";
import aiBudgetTrackerInjectable from "./ai-budget-tracker.injectable";
import ephemeralContextManagerInjectable from "./ephemeral-context-manager.injectable";
import { AiDiagnosisEngine } from "./ai-diagnosis-engine";

const aiDiagnosisEngineInjectable = getInjectable({
  id: "ai-diagnosis-engine",

  instantiate: (di) => {
    const incidentRepo = di.inject(incidentRepositoryInjectable);
    const evidenceRepo = di.inject(evidenceRepositoryInjectable);
    const profileManager = di.inject(aiProfileManagerInjectable);
    const diagnosisRepo = di.inject(aiDiagnosisRepositoryInjectable);
    const budgetTracker = di.inject(aiBudgetTrackerInjectable);
    const ephemeralContextManager = di.inject(ephemeralContextManagerInjectable);

    return new AiDiagnosisEngine(
      incidentRepo,
      evidenceRepo,
      profileManager,
      diagnosisRepo,
      budgetTracker,
      ephemeralContextManager,
    );
  },
});

export default aiDiagnosisEngineInjectable;
