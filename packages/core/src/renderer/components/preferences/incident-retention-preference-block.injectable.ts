/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { preferenceItemInjectionToken } from "../../../features/preferences/renderer/preference-items/preference-item-injection-token";
import { IncidentRetentionPreference } from "./incident-retention-preference";

const incidentRetentionPreferenceBlockInjectable = getInjectable({
  id: "incident-retention-preference-block",
  instantiate: () => ({
    kind: "block" as const,
    id: "incident-retention-preferences",
    parentId: "kubernetes-page",
    orderNumber: 45,
    Component: IncidentRetentionPreference,
  }),
  injectionToken: preferenceItemInjectionToken,
});

export default incidentRetentionPreferenceBlockInjectable;
