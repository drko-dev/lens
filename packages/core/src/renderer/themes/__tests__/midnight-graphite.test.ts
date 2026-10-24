/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// OpenLens DevOps — opt-in theme regression checks.
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import midnightGraphiteThemeInjectable, { midnightGraphiteThemeName } from "../midnight-graphite.injectable";
import lensDarkThemeInjectable from "../lens-dark.injectable";
import lensLightThemeInjectable from "../lens-light.injectable";
import defaultLensThemeInjectable from "../default-theme.injectable";
import activeThemeInjectable from "../active.injectable";
import applyLensThemeInjectable from "../apply-lens-theme.injectable";
import systemThemeConfigurationInjectable from "../system-theme.injectable";
import userPreferencesStateInjectable from "../../../features/user-preferences/common/state.injectable";
import { lensThemeDeclarationInjectionToken } from "../declaration";

describe("Midnight Graphite preview theme", () => {
  it("registers as a selectable dark theme without replacing the default", () => {
    const di = getDiForUnitTesting();
    const newTheme = di.inject(midnightGraphiteThemeInjectable);
    const defaultTheme = di.inject(defaultLensThemeInjectable);
    const themes = di.injectMany(lensThemeDeclarationInjectionToken);

    expect(newTheme.name).toBe(midnightGraphiteThemeName);
    expect(newTheme.type).toBe("dark");
    expect(newTheme.isDefault).toBe(false);
    expect(defaultTheme.name).toBe("Dark");
    expect(themes.map(theme => theme.name)).toContain("Dark");
    expect(themes.map(theme => theme.name)).toContain("Light");
    expect(themes.map(theme => theme.name)).toContain(midnightGraphiteThemeName);
  });

  it("retains production safety colors and classic theme unchanged", () => {
    const di = getDiForUnitTesting();
    const newTheme = di.inject(midnightGraphiteThemeInjectable);
    const original = di.inject(lensDarkThemeInjectable);

    expect(original.colors.mainBackground).toBe("#1e2124");
    expect(newTheme.colors.mainBackground).toBe("#0D1117");
    expect(newTheme.colors.envProduction).toBe("#EF4444");
    expect(newTheme.colors.envProductionSoft).toBe(original.colors.envProductionSoft);
    expect(newTheme.colors.envStaging).toBe(original.colors.envStaging);
    expect(newTheme.colors.envDevelopment).toBe(original.colors.envDevelopment);
  });

  it("fuses official Lens neutral multi-tier scale and surface gradient tokens", () => {
    const di = getDiForUnitTesting();
    const newTheme = di.inject(midnightGraphiteThemeInjectable);

    expect(newTheme.colors.grey100).toBe("#0D1117");
    expect(newTheme.colors.grey80).toBe("#111923");
    expect(newTheme.colors.grey70).toBe("#151B23");
    expect(newTheme.colors.grey60).toBe("#324052");
    expect(newTheme.colors.grey40).toBe("#1A2533");
    expect(newTheme.colors.grey30).toBe("#263446");
    expect(newTheme.colors.grey20).toBe("#A2AEC0");
    expect(newTheme.colors.grey10).toBe("#F0F4F9");
    expect(newTheme.colors.surfaceGradient).toBe(
      "linear-gradient(180deg, rgba(113, 150, 210, 0.12) 0%, rgba(13, 17, 23, 0) 50%)",
    );
    expect(newTheme.colors.successTint).toBe("rgba(75, 199, 138, 0.12)");
    expect(newTheme.colors.modalHeaderBg).toBe("#111923");
    expect(newTheme.colors.modalContentBg).toBe("#151B23");
  });

  it("deterministically resolves active theme for explicit selection and system sync", () => {
    const di = getDiForUnitTesting();
    const state = di.inject(userPreferencesStateInjectable);
    const systemTheme = di.inject(systemThemeConfigurationInjectable);
    const activeTheme = di.inject(activeThemeInjectable);

    // 1. Explicit selection of Midnight Graphite
    state.colorTheme = midnightGraphiteThemeName;
    expect(activeTheme.get().name).toBe(midnightGraphiteThemeName);

    // 2. Explicit selection of Dark
    state.colorTheme = "Dark";
    expect(activeTheme.get().name).toBe("Dark");

    // 3. Explicit selection of Light
    state.colorTheme = "Light";
    expect(activeTheme.get().name).toBe("Light");

    // 4. System sync when system is dark -> classic "Dark" (never accidentally Midnight Graphite)
    state.colorTheme = "system";
    systemTheme.set("dark");
    expect(activeTheme.get().name).toBe("Dark");

    // 5. System sync when system is light -> classic "Light"
    systemTheme.set("light");
    expect(activeTheme.get().name).toBe("Light");
  });

  it("applies and cleanly reverts DOM classes and CSS variables without residue", () => {
    const di = getDiForUnitTesting();

    di.override(applyLensThemeInjectable, (di) => applyLensThemeInjectable.instantiate(di));

    const applyLensTheme = di.inject(applyLensThemeInjectable);
    const midnightTheme = di.inject(midnightGraphiteThemeInjectable);
    const darkTheme = di.inject(lensDarkThemeInjectable);
    const lightTheme = di.inject(lensLightThemeInjectable);

    // Initial state cleanup
    document.body.className = "";
    document.documentElement.style.cssText = "";

    // 1. Apply Midnight Graphite
    applyLensTheme(midnightTheme);
    expect(document.body.classList.contains("theme-midnight-graphite")).toBe(true);
    expect(document.body.classList.contains("theme-light")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--mainBackground")).toBe("#0D1117");
    expect(document.documentElement.style.getPropertyValue("--grey100")).toBe("#0D1117");
    expect(document.documentElement.style.getPropertyValue("--grey80")).toBe("#111923");
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#7196D2");
    expect(document.documentElement.style.getPropertyValue("--envProduction")).toBe("#EF4444");

    // 2. Revert to classic Dark
    applyLensTheme(darkTheme);
    expect(document.body.classList.contains("theme-midnight-graphite")).toBe(false);
    expect(document.body.classList.contains("theme-light")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--mainBackground")).toBe("#1e2124");
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#3d90ce");
    expect(document.documentElement.style.getPropertyValue("--envProduction")).toBe("#EF4444");

    // 3. Revert to classic Light
    applyLensTheme(lightTheme);
    expect(document.body.classList.contains("theme-midnight-graphite")).toBe(false);
    expect(document.body.classList.contains("theme-light")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--mainBackground")).toBe("#f1f1f1");
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#3d90ce");
  });
});
