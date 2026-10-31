/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { resolveUserInfo, type HostUserInfo } from "./user-info.injectable";

const hostUser: HostUserInfo = {
  uid: 501,
  gid: 20,
  username: "host-user",
  homedir: "/var/host-home",
  shell: "/bin/zsh",
};

describe("user info isolation for integration smoke tests", () => {
  it("keeps the actual user home in normal operation", () => {
    const result = resolveUserInfo(
      { HOME: "/tmp/test-home-override" },
      () => hostUser,
    );

    expect(result.homedir).toBe("/var/host-home");
  });

  it("respects HOME only for isolated CICD integration runs", () => {
    const result = resolveUserInfo(
      { CICD: "/tmp/test-appdata", HOME: "/tmp/test-home-override" },
      () => hostUser,
    );

    expect(result.homedir).toBe("/tmp/test-home-override");
  });

  it("falls back when os.userInfo has no passwd entry", () => {
    const result = resolveUserInfo(
      { HOME: "/tmp/fallback-home" },
      () => {
        throw Object.assign(new Error("uv_os_get_passwd returned ENOENT"), { code: "ENOENT" });
      },
      () => "/tmp/os-homedir",
    );

    expect(result.homedir).toBe("/tmp/fallback-home");
  });
});
