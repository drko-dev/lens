/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { applyEnvironmentColors, hexToRgba } from "../apply-environment-colors";

describe("applyEnvironmentColors", () => {
  beforeEach(() => {
    document.documentElement.style.cssText = "";
  });

  it("calculates rgba from hex correctly", () => {
    expect(hexToRgba("#10B981", 0.16)).toBe("rgba(16, 185, 129, 0.16)");
    expect(hexToRgba("#FFF", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
    expect(hexToRgba("not-a-hex", 0.5)).toBe("not-a-hex");
  });

  it("applies customized environment colors and soft variants", () => {
    applyEnvironmentColors({
      staging: "#FF5500",
      development: "#00FFCC",
    });

    expect(document.documentElement.style.getPropertyValue("--envStaging")).toBe("#FF5500");
    expect(document.documentElement.style.getPropertyValue("--envStagingSoft")).toContain("rgba(255, 85, 0,");
    expect(document.documentElement.style.getPropertyValue("--envDevelopment")).toBe("#00FFCC");
  });

  it("strictly enforces PROD safety guard and ignores any production override", () => {
    applyEnvironmentColors({
      production: "#00FF00", // Attempt to change PROD to green
    });

    expect(document.documentElement.style.getPropertyValue("--envProduction")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--envProductionSoft")).toBe("");
  });

  it("removes CSS variables when overrides are cleared", () => {
    applyEnvironmentColors({
      staging: "#FF5500",
    });
    expect(document.documentElement.style.getPropertyValue("--envStaging")).toBe("#FF5500");

    applyEnvironmentColors({});
    expect(document.documentElement.style.getPropertyValue("--envStaging")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--envStagingSoft")).toBe("");
  });
});
