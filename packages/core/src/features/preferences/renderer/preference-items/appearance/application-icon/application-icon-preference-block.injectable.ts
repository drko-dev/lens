/** OpenLens DevOps Appearance preferences integration. */
import { getInjectable } from "@ogre-tools/injectable";
import { preferenceItemInjectionToken } from "../../preference-item-injection-token";
import { ApplicationIconPreferences } from "./application-icon-preferences";
const applicationIconPreferenceBlockInjectable = getInjectable({
  id: "application-icon-preference-block",
  instantiate: () => ({
    kind: "block" as const,
    id: "application-icon-preferences",
    parentId: "appearance-page",
    orderNumber: 30,
    Component: ApplicationIconPreferences,
  }),
  injectionToken: preferenceItemInjectionToken,
});
export default applicationIconPreferenceBlockInjectable;
