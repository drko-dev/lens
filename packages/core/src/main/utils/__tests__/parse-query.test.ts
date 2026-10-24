/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getBoolean, getInteger } from "../parse-query";

describe("parse-query", () => {
  describe("getBoolean", () => {
    it("reads explicit truthy and falsy values", () => {
      expect(getBoolean(new URLSearchParams("all=true"), "all")).toBe(true);
      expect(getBoolean(new URLSearchParams("all=false"), "all")).toBe(false);
      expect(getBoolean(new URLSearchParams("all=0"), "all")).toBe(false);
    });

    it("is false when the parameter is absent", () => {
      expect(getBoolean(new URLSearchParams(""), "all")).toBe(false);
    });
  });

  describe("getInteger", () => {
    it("reads a positive integer", () => {
      expect(getInteger(new URLSearchParams("revision=7"), "revision")).toBe(7);
    });

    it("is undefined when the parameter is absent", () => {
      expect(getInteger(new URLSearchParams(""), "revision")).toBeUndefined();
      expect(getInteger(new URLSearchParams("all=true"), "revision")).toBeUndefined();
    });

    it("is undefined for an empty or blank value", () => {
      expect(getInteger(new URLSearchParams("revision="), "revision")).toBeUndefined();
      expect(getInteger(new URLSearchParams("revision=%20"), "revision")).toBeUndefined();
    });

    it("is undefined for values that are not positive integers", () => {
      expect(getInteger(new URLSearchParams("revision=abc"), "revision")).toBeUndefined();
      expect(getInteger(new URLSearchParams("revision=0"), "revision")).toBeUndefined();
      expect(getInteger(new URLSearchParams("revision=-3"), "revision")).toBeUndefined();
      expect(getInteger(new URLSearchParams("revision=1.5"), "revision")).toBeUndefined();
      expect(getInteger(new URLSearchParams("revision=3garbage"), "revision")).toBeUndefined();
      expect(getInteger(new URLSearchParams("revision=1e2"), "revision")).toBeUndefined();
      expect(getInteger(new URLSearchParams("revision=9007199254740992"), "revision")).toBeUndefined();
    });
  });
});
