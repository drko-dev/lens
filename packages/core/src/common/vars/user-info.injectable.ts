/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { userInfo } from "os";

const userInfoInjectable = getInjectable({
  id: "user-info",
  instantiate: () => {
    const user = userInfo();

    // Integration smoke tests must not discover the host user's ~/.kube or extensions.
    // os.userInfo().homedir ignores HOME on macOS, so honor the isolated test HOME.
    if (process.env.CICD && process.env.HOME) {
      return { ...user, homedir: process.env.HOME };
    }

    return user;
  },
  causesSideEffects: true,
});

export default userInfoInjectable;
