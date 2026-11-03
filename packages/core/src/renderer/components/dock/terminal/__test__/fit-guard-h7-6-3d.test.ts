/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { canFitTerminal } from "../terminal";

const host = (w: number, h: number) => {
  const el = document.createElement("div");

  Object.defineProperty(el, "clientWidth", { value: w });
  Object.defineProperty(el, "clientHeight", { value: h });

  return el;
};

describe("H7.6.3D: canFitTerminal", () => {
  const pool = host(100, 100);

  it("fits in a sized host", () => expect(canFitTerminal(host(300, 200), pool)).toBe(true));
  it("rejects a collapsed (0-size) host", () => {
    expect(canFitTerminal(host(0, 200), pool)).toBe(false);
    expect(canFitTerminal(host(300, 0), pool)).toBe(false);
  });
  it("rejects the spawning pool and a missing parent", () => {
    expect(canFitTerminal(pool, pool)).toBe(false);
    expect(canFitTerminal(null, pool)).toBe(false);
  });
});
