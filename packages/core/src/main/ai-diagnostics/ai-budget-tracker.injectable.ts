/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import aiDiagnosisRepositoryInjectable from "./ai-diagnosis-repository.injectable";
import { AiBudgetTracker } from "./ai-budget-tracker";

const aiBudgetTrackerInjectable = getInjectable({
  id: "ai-budget-tracker",

  instantiate: (di) => {
    const diagnosisRepo = di.inject(aiDiagnosisRepositoryInjectable);

    return new AiBudgetTracker(diagnosisRepo);
  },
});

export default aiBudgetTrackerInjectable;
