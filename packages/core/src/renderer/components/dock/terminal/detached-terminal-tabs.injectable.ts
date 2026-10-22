/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { observable } from "mobx";

/**
 * R4-06B: Terminal dock tabs whose PTY is owned by a detached window.
 * "ended": the shell exited while detached (the window stays open until redocked).
 */
const detachedTerminalTabsInjectable = getInjectable({
  id: "detached-terminal-tabs",
  instantiate: () => observable.map<string, "detached" | "ended">(),
});

export default detachedTerminalTabsInjectable;
