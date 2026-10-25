/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import lensOfficialDarkThemeInjectable, { lensOfficialDarkThemeName } from "../lens-official-dark.injectable";
import lensOfficialLightThemeInjectable, { lensOfficialLightThemeName } from "../lens-official-light.injectable";
import lensDarkThemeInjectable from "../lens-dark.injectable";
import defaultLensThemeInjectable from "../default-theme.injectable";
import activeThemeInjectable from "../active.injectable";
import applyLensThemeInjectable from "../apply-lens-theme.injectable";
import userPreferencesStateInjectable from "../../../features/user-preferences/common/state.injectable";
import { lensThemeDeclarationInjectionToken } from "../declaration";

describe("Official Lens Themes (Dark & Light)", () => {
  it("registers both official themes as selectable options via DI token", () => {
    const di = getDiForUnitTesting();
    const darkTheme = di.inject(lensOfficialDarkThemeInjectable);
    const lightTheme = di.inject(lensOfficialLightThemeInjectable);
    const defaultTheme = di.inject(defaultLensThemeInjectable);
    const registeredThemes = di.injectMany(lensThemeDeclarationInjectionToken);

    expect(darkTheme.name).toBe(lensOfficialDarkThemeName);
    expect(darkTheme.type).toBe("dark");
    expect(darkTheme.isDefault).toBe(false);

    expect(lightTheme.name).toBe(lensOfficialLightThemeName);
    expect(lightTheme.type).toBe("light");
    expect(lightTheme.isDefault).toBe(false);

    // Default is Midnight Graphite for OpenLens DevOps
    expect(defaultTheme.name).toBe("Midnight Graphite");

    const names = registeredThemes.map(t => t.name);

    expect(names).toContain("Dark");
    expect(names).toContain("Light");
    expect(names).toContain("Midnight Graphite");
    expect(names).toContain(lensOfficialDarkThemeName);
    expect(names).toContain(lensOfficialLightThemeName);
  });

  it("provides authentic official Lens dark color palette and surface tokens", () => {
    const di = getDiForUnitTesting();
    const darkTheme = di.inject(lensOfficialDarkThemeInjectable);

    expect(darkTheme.colors.mainBackground).toBe("#181A1C");
    expect(darkTheme.colors.layoutBackground).toBe("#1F2123");
    expect(darkTheme.colors.sidebarBackground).toBe("#26292B");
    expect(darkTheme.colors.dialogBackground).toBe("#26292B");
    expect(darkTheme.colors.borderColor).toBe("#2D2F31");
    expect(darkTheme.colors.primary).toBe("#3d90ce");
    expect(darkTheme.colors.grey100).toBe("#181A1C");
    expect(darkTheme.colors.grey80).toBe("#1F2123");
    expect(darkTheme.colors.grey70).toBe("#26292B");
    expect(darkTheme.colors.grey60).toBe("#2D2F31");
    expect(darkTheme.colors.grey40).toBe("#26292B");
    expect(darkTheme.colors.grey30).toBe("#414348");
    expect(darkTheme.colors.grey20).toBe("#AAACAE");
    expect(darkTheme.colors.grey10).toBe("#F1F3F5");
    expect(darkTheme.colors.surfaceGradient).toBe(
      "linear-gradient(180deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0) 50%)",
    );
    // Preserves environment safety colors
    expect(darkTheme.colors.envProduction).toBe("#EF4444");
    expect(darkTheme.colors.envStaging).toBe("#F59E0B");
    expect(darkTheme.colors.envDevelopment).toBe("#10B981");
  });

  it("provides authentic official Lens light color palette", () => {
    const di = getDiForUnitTesting();
    const lightTheme = di.inject(lensOfficialLightThemeInjectable);

    expect(lightTheme.colors.mainBackground).toBe("#ededed");
    expect(lightTheme.colors.backgroundPrimary).toBe("#f8f8f8");
    expect(lightTheme.colors.sidebarBackground).toBe("#ffffff");
    expect(lightTheme.colors.borderColor).toBe("#c3c3c3");
    expect(lightTheme.colors.primary).toBe("#3d90ce");
    expect(lightTheme.colors.grey100).toBe("#ededed");
    expect(lightTheme.colors.grey80).toBe("#F8F8F8");
    expect(lightTheme.colors.grey70).toBe("#E0E0E0");
    expect(lightTheme.colors.grey20).toBe("#555555");
    expect(lightTheme.colors.grey10).toBe("#4b4b4b");
    // Preserves environment safety colors (high contrast light variant)
    expect(lightTheme.colors.envProduction).toBe("#DC2626");
  });

  it("preserves classic Dark theme colors without regression", () => {
    const di = getDiForUnitTesting();
    const classicDark = di.inject(lensDarkThemeInjectable);

    expect(classicDark.colors.mainBackground).toBe("#1e2124");
    expect(classicDark.colors.sidebarBackground).toBe("#36393e");
    expect(classicDark.colors.primary).toBe("#3d90ce");
  });

  it("dynamically resolves active theme when user selects official themes", () => {
    const di = getDiForUnitTesting();
    const state = di.inject(userPreferencesStateInjectable);
    const activeTheme = di.inject(activeThemeInjectable);

    state.colorTheme = lensOfficialDarkThemeName;
    expect(activeTheme.get().name).toBe(lensOfficialDarkThemeName);
    expect(activeTheme.get().type).toBe("dark");

    state.colorTheme = lensOfficialLightThemeName;
    expect(activeTheme.get().name).toBe(lensOfficialLightThemeName);
    expect(activeTheme.get().type).toBe("light");
  });

  it("applies theme classes and CSS custom properties to DOM", () => {
    const di = getDiForUnitTesting();

    di.override(applyLensThemeInjectable, (di) => applyLensThemeInjectable.instantiate(di));

    const applyLensTheme = di.inject(applyLensThemeInjectable);
    const officialDark = di.inject(lensOfficialDarkThemeInjectable);
    const officialLight = di.inject(lensOfficialLightThemeInjectable);
    const classicDark = di.inject(lensDarkThemeInjectable);

    document.body.className = "";
    document.documentElement.style.cssText = "";

    // 1. Apply Official Dark
    applyLensTheme(officialDark);
    expect(document.body.classList.contains("theme-lens-official-dark")).toBe(true);
    expect(document.body.classList.contains("theme-lens-official-light")).toBe(false);
    expect(document.body.classList.contains("theme-light")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--mainBackground")).toBe("#181A1C");
    expect(document.documentElement.style.getPropertyValue("--grey100")).toBe("#181A1C");
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#3d90ce");

    // 2. Apply Official Light
    applyLensTheme(officialLight);
    expect(document.body.classList.contains("theme-lens-official-dark")).toBe(false);
    expect(document.body.classList.contains("theme-lens-official-light")).toBe(true);
    expect(document.body.classList.contains("theme-light")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--mainBackground")).toBe("#ededed");
    expect(document.documentElement.style.getPropertyValue("--grey100")).toBe("#ededed");

    // 3. Revert to classic Dark
    applyLensTheme(classicDark);
    expect(document.body.classList.contains("theme-lens-official-dark")).toBe(false);
    expect(document.body.classList.contains("theme-lens-official-light")).toBe(false);
    expect(document.body.classList.contains("theme-light")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--mainBackground")).toBe("#1e2124");
  });
});
