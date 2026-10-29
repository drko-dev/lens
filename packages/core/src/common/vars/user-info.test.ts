/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { userInfo } from "os";
import userInfoInjectable from "./user-info.injectable";

describe("user info isolation for integration smoke tests", () => {
  const previousCicd = process.env.CICD;
  const previousHome = process.env.HOME;

  afterEach(() => {
    if (previousCicd === undefined) delete process.env.CICD;
    else process.env.CICD = previousCicd;

    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  });

  it("keeps the actual user home in normal operation", () => {
    delete process.env.CICD;
    process.env.HOME = "/tmp/test-home-override";

    expect(userInfoInjectable.instantiate({} as never).homedir).toBe(userInfo().homedir);
  });

  it("respects HOME only for isolated CICD integration runs", () => {
    process.env.CICD = "/tmp/test-appdata";
    process.env.HOME = "/tmp/test-home-override";

    expect(userInfoInjectable.instantiate({} as never).homedir).toBe("/tmp/test-home-override");
  });
});
