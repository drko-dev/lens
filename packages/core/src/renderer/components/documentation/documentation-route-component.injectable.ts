/** OpenLens DevOps H8.7 — offline documentation page. */
import { getInjectable } from "@ogre-tools/injectable";
import { routeSpecificComponentInjectionToken } from "../../routes/route-specific-component-injection-token";
import documentationRouteInjectable from "../../../common/front-end-routing/routes/documentation/documentation-route.injectable";
import { Documentation } from "./documentation";

const documentationRouteComponentInjectable = getInjectable({
  id: "documentation-route-component",
  instantiate: (di) => ({
    route: di.inject(documentationRouteInjectable),
    Component: Documentation,
  }),
  injectionToken: routeSpecificComponentInjectionToken,
});

export default documentationRouteComponentInjectable;
