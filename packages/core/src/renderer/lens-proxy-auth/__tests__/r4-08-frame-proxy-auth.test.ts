/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { proxyAuthHeaderName } from "../../../common/lens-proxy-auth/proxy-auth";
import { FrameProxyAuth } from "../frame-proxy-auth";

describe("R4-08 renderer frame proxy auth", () => {
  it("returns {} until a token has been received", () => {
    expect(new FrameProxyAuth("a").getHeaders("a")).toEqual({});
    expect(new FrameProxyAuth(undefined).getHeaders(undefined)).toEqual({});
  });

  it("cluster frame serves only its own cluster", () => {
    const auth = new FrameProxyAuth("a");

    auth.setToken("tok-a");

    expect(auth.getHeaders("a")).toEqual({ [proxyAuthHeaderName]: "tok-a" });
    expect(auth.getHeaders("b")).toEqual({});
    // generic apiBase requests (`/api` routes) go to the frame's own host
    expect(auth.getHeaders(undefined)).toEqual({ [proxyAuthHeaderName]: "tok-a" });
  });

  it("root frame serves only the app scope", () => {
    const auth = new FrameProxyAuth(undefined);

    auth.setToken("tok-app");

    expect(auth.getHeaders(undefined)).toEqual({ [proxyAuthHeaderName]: "tok-app" });
    expect(auth.getHeaders("a")).toEqual({});
  });

  it("rotation replaces the cached token", () => {
    const auth = new FrameProxyAuth("a");

    auth.setToken("old");
    auth.setToken("new");

    expect(auth.getHeaders("a")).toEqual({ [proxyAuthHeaderName]: "new" });
  });

  it.each([undefined, null, 5, "", {}])("ignores invalid rotated payload %p", (bad) => {
    const auth = new FrameProxyAuth("a");

    auth.setToken("good");
    auth.setToken(bad);

    expect(auth.getHeaders("a")).toEqual({ [proxyAuthHeaderName]: "good" });
  });
});
