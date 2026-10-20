/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { McpSettings } from "./mcp-settings";
import mcpRouteInjectable from "../../../common/front-end-routing/routes/cluster/config/mcp/mcp-route.injectable";
import { routeSpecificComponentInjectionToken } from "../../routes/route-specific-component-injection-token";

const mcpRouteComponentInjectable = getInjectable({
  id: "mcp-route-component",

  instantiate: (di) => ({
    route: di.inject(mcpRouteInjectable),
    Component: McpSettings,
  }),

  injectionToken: routeSpecificComponentInjectionToken,
});

export default mcpRouteComponentInjectable;
