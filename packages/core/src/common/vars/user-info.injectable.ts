/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import * as os from "os";

export type HostUserInfo = os.UserInfo;

export const resolveUserInfo = (
  env: NodeJS.ProcessEnv,
  readUserInfo: () => HostUserInfo = () => os.userInfo(),
  readHomedir: () => string = () => os.homedir(),
): HostUserInfo => {
  let user: HostUserInfo;

  try {
    user = readUserInfo();
  } catch {
    // Some sandboxed / CI hosts have no passwd entry (uv_os_get_passwd ENOENT).
    user = {
      uid: -1,
      gid: -1,
      username: "unknown",
      homedir: env.HOME || readHomedir(),
      shell: null,
    };
  }

  // Integration smoke tests must not discover the host user's ~/.kube or extensions.
  // os.userInfo().homedir ignores HOME on macOS, so honor the isolated test HOME.
  if (env.CICD && env.HOME) {
    return { ...user, homedir: env.HOME };
  }

  return user;
};

const userInfoInjectable = getInjectable({
  id: "user-info",
  instantiate: () => resolveUserInfo(process.env),
  causesSideEffects: true,
});

export default userInfoInjectable;
