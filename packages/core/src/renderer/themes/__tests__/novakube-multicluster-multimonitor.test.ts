/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import novakubeThemeInjectable, { novakubeThemeName, novakubeBrandColors } from "../novakube.injectable";
import activeThemeInjectable from "../active.injectable";
import userPreferencesStateInjectable from "../../../features/user-preferences/common/state.injectable";
import terminalColorsInjectable from "../terminal-colors.injectable";
import { DETACHED_THEME_TOKENS, isSafeColorValue } from "../../../common/detached-tools/detached-theme";
import type { DetachedThemePayload } from "../../../common/detached-tools/detached-theme";

describe("H9-05: NovaKube Multi-cluster & Multimonitor Isolation", () => {
  it("preserves individual cluster environment colors without substituting NovaKube accent", () => {
    const di = getDiForUnitTesting();
    const novakube = di.inject(novakubeThemeInjectable);

    // Production safety colors MUST never be substituted with brand blue/accent
    expect(novakube.colors.envProduction).toBe("#EF4444");
    expect(novakube.colors.envStaging).toBe("#F59E0B");
    expect(novakube.colors.envDevelopment).toBe("#10B981");
    expect(novakube.colors.primary).not.toBe("#EF4444");
    expect(novakube.colors.primary).not.toBe("#F59E0B");

    // Semantic status colors must remain authentic
    expect(novakube.colors.statusSuccess).toBe(novakubeBrandColors.success);
    expect(novakube.colors.statusWarning).toBe(novakubeBrandColors.warning);
    expect(novakube.colors.statusError).toBe(novakubeBrandColors.danger);
  });

  it("broadcasts safe allowlisted NovaKube tokens to detached tool windows", () => {
    const di = getDiForUnitTesting();
    const state = di.inject(userPreferencesStateInjectable);
    const activeTheme = di.inject(activeThemeInjectable);
    const terminalColors = di.inject(terminalColorsInjectable);

    state.colorTheme = novakubeThemeName;
    const currentTheme = activeTheme.get();
    expect(currentTheme.name).toBe(novakubeThemeName);

    // Build the exact payload that syncThemeToDetachedWindowsInjectable sends
    const terminal = terminalColors.get() as Record<string, string | undefined>;
    const source = currentTheme.colors as Record<string, string | undefined>;
    const colors: DetachedThemePayload["colors"] = {};

    for (const token of DETACHED_THEME_TOKENS) {
      const raw = token.startsWith("terminal")
        ? terminal[token.charAt(8).toLowerCase() + token.slice(9)]
        : source[token];
      const value = typeof raw === "string" ? raw.trim() : undefined;

      if (isSafeColorValue(value)) colors[token] = value;
    }

    const payload: DetachedThemePayload = {
      type: currentTheme.type,
      colors,
    };

    expect(payload.type).toBe("dark");
    expect(payload.colors.mainBackground).toBe(novakubeBrandColors.background);
    expect(payload.colors.primary).toBe(novakubeBrandColors.accent);
    expect(payload.colors.textColorPrimary).toBe(novakubeBrandColors.textPrimary);
    expect(payload.colors.terminalBackground).toBe(novakubeBrandColors.background);
    expect(payload.colors.terminalForeground).toBe(novakubeBrandColors.textPrimary);
  });
});
