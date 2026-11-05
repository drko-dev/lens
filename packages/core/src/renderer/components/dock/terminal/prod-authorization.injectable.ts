/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { TerminalProdAuthorization } from "./prod-authorization";

const terminalProdAuthorizationInjectable = getInjectable({
  id: "terminal-prod-authorization",
  instantiate: () => new TerminalProdAuthorization(),
});

export default terminalProdAuthorizationInjectable;
