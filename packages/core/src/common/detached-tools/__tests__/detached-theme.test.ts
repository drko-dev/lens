/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { DETACHED_THEME_TOKENS, isSafeColorValue, sanitizeDetachedTheme } from "../detached-theme";

describe("R5-07 detached theme sanitizer", () => {
  it.each(["#fff", "#ffff", "#1e2124", "#1e2124ff", "rgb(0, 255, 3)", "rgba(239, 68, 68, 0.16)", "rgba(1,2,3,.5)", "transparent"])("accepts %s", (v) => {
    expect(isSafeColorValue(v)).toBe(true);
  });

  it.each([
    "url(http://x)", "red", "#12", "#12345", "rgb(256,0,0)", "rgba(0,0,0,1.5)", "#fff; background:url(x)", "var(--x)",
    "expression(1)", " #fff", `#${"a".repeat(40)}`, 1, null, {},
  ])("rejects %p", (v) => {
    expect(isSafeColorValue(v)).toBe(false);
  });

  it("keeps allowlisted safe colours and drops unknown keys and unsafe values", () => {
    expect(sanitizeDetachedTheme({
      type: "dark",
      colors: { mainBackground: "#000", primary: "url(x)", evil: "#fff", __proto__: { terminalRed: "#f00" }, kubeconfig: "#111" },
      extra: "x",
    })).toEqual({ type: "dark", colors: { mainBackground: "#000" }});
  });

  it("rejects bad type and non-objects", () => {
    expect(sanitizeDetachedTheme({ type: "blue", colors: {}})).toBeUndefined();

    for (const v of [undefined, null, "x", 1, [], [{ type: "dark" }]]) expect(sanitizeDetachedTheme(v)).toBeUndefined();
  });

  it("tolerates missing colours", () => {
    expect(sanitizeDetachedTheme({ type: "light" })).toEqual({ type: "light", colors: {}});
  });

  it("has unique tokens", () => {
    expect(new Set(DETACHED_THEME_TOKENS).size).toBe(DETACHED_THEME_TOKENS.length);
  });
});
