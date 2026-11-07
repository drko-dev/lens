/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import novakubeThemeInjectable, { novakubeThemeName, novakubeBrandColors } from "../novakube.injectable";
import cursorThemeInjectable, { cursorThemeName } from "../cursor.injectable";
import midnightGraphiteThemeInjectable, { midnightGraphiteThemeName } from "../midnight-graphite.injectable";
import defaultLensThemeInjectable from "../default-theme.injectable";
import activeThemeInjectable from "../active.injectable";
import applyLensThemeInjectable from "../apply-lens-theme.injectable";
import userPreferencesStateInjectable from "../../../features/user-preferences/common/state.injectable";
import { lensThemeDeclarationInjectionToken } from "../declaration";

describe("NovaKube — Concept A High-Contrast Theme", () => {
  it("registers NovaKube as a selectable dark theme without altering Cursor as the default", () => {
    const di = getDiForUnitTesting();
    const novakube = di.inject(novakubeThemeInjectable);
    const defaultTheme = di.inject(defaultLensThemeInjectable);
    const themes = di.injectMany(lensThemeDeclarationInjectionToken);

    expect(novakube.name).toBe(novakubeThemeName);
    expect(novakube.isDefault).toBe(false);
    expect(novakube.type).toBe("dark");

    // Cursor remains the ONLY default theme
    expect(defaultTheme.name).toBe(cursorThemeName);
    expect(themes.filter(t => t.isDefault)).toHaveLength(1);

    // Existing themes stay intact and selectable
    const themeNames = themes.map(t => t.name);
    expect(themeNames).toContain(cursorThemeName);
    expect(themeNames).toContain(midnightGraphiteThemeName);
    expect(themeNames).toContain("Cursor Team");
    expect(themeNames).toContain("NovaKube");
    expect(themeNames).toContain("Dark");
    expect(themeNames).toContain("Light");
  });

  it("maps the updated high-contrast runtime palette through the existing theme", () => {
    const di = getDiForUnitTesting();
    const novakube = di.inject(novakubeThemeInjectable);

    // Core brand background and surfaces
    expect(novakube.colors.mainBackground).toBe(novakubeBrandColors.background);
    expect(novakube.colors.secondaryBackground).toBe(novakubeBrandColors.app);
    expect(novakube.colors.surfaceRaised).toBe(novakubeBrandColors.surface);
    expect(novakube.colors.borderColor).toBe(novakubeBrandColors.border);

    // Typography
    expect(novakube.colors.textColorPrimary).toBe(novakubeBrandColors.textPrimary);
    expect(novakube.colors.textColorSecondary).toBe(novakubeBrandColors.textSecondary);
    expect(novakube.colors.textColorTertiary).toBe(novakubeBrandColors.textMuted);

    // Accents & Actions
    expect(novakube.colors.primary).toBe(novakubeBrandColors.accent);
    expect(novakube.colors.primaryHover).toBe(novakubeBrandColors.accentHover);
    expect(novakube.colors.actionPrimary).toBe(novakubeBrandColors.accent);
    expect(novakube.colors.actionPrimaryHover).toBe(novakubeBrandColors.accentHover);
    expect(novakube.colors.actionSecondary).toBe(novakubeBrandColors.surface);

    expect(novakube.colors.tableBgcSelected).toBe(novakubeBrandColors.selectionBackground);
    expect(novakube.colors.menuSelectedOptionBgc).toBe(novakubeBrandColors.selectionBackground);
    expect(novakube.colors.navSelectedBackground).toBe(novakubeBrandColors.selectionBackground);
    expect(novakube.colors.linkColor).toBe(novakubeBrandColors.linkText);
    expect(novakube.colors.sidebarSubmenuActiveColor).toBe(novakubeBrandColors.linkText);
    expect(novakube.colors.buttonPrimaryForeground).toBe("#FFFFFF");
    expect(novakube.colors.actionPrimaryForeground).toBe("#FFFFFF");

    // Semantics & Safety
    expect(novakube.colors.colorSuccess).toBe(novakubeBrandColors.success);
    expect(novakube.colors.colorWarning).toBe(novakubeBrandColors.warning);
    expect(novakube.colors.colorError).toBe(novakubeBrandColors.danger);
    expect(novakube.colors.envProduction).toBe("#EF4444");
    expect(novakube.colors.envStaging).toBe("#F59E0B");
    expect(novakube.colors.envDevelopment).toBe("#10B981");

    // Terminal Colors
    expect(novakube.terminalColors.background).toBe(novakubeBrandColors.background);
    expect(novakube.terminalColors.foreground).toBe(novakubeBrandColors.textPrimary);
    expect(novakube.terminalColors.blue).toBe(novakubeBrandColors.accent);
    expect(novakube.terminalColors.green).toBe(novakubeBrandColors.success);
    expect(novakube.terminalColors.yellow).toBe(novakubeBrandColors.warning);
    expect(novakube.terminalColors.red).toBe(novakubeBrandColors.danger);
  });

  it("provides WCAG AA contrast for normal text, primary actions, and selected states", () => {
    const luminance = (hex: string): number => {
      const rgb = [1, 3, 5].map(position => {
        const value = parseInt(hex.slice(position, position + 2), 16) / 255;

        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });

      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    };
    const contrast = (foreground: string, background: string): number => {
      const f = luminance(foreground);
      const b = luminance(background);

      return (Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05);
    };
    const colors = getDiForUnitTesting().inject(novakubeThemeInjectable).colors;
    const pairs = [
      [colors.textColorPrimary, colors.mainBackground],
      [colors.textColorSecondary, colors.secondaryBackground],
      [colors.textColorTertiary, colors.mainBackground],
      [colors.buttonPrimaryForeground, colors.buttonPrimaryBackground],
      [colors.actionPrimaryForeground, colors.actionPrimaryHover],
      [colors.tableSelectedRowColor, colors.tableBgcSelected],
      [colors.textColorPrimary, colors.menuSelectedOptionBgc],
      [colors.textColorPrimary, colors.navSelectedBackground],
      [colors.linkColor, colors.mainBackground],
      [colors.colorSuccess, colors.mainBackground],
      ["#0B0D10", colors.colorSuccess],
    ];

    for (const [foreground, background] of pairs) {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("toggles the theme-novakube body class and clears it when switching to other themes", () => {
    const di = getDiForUnitTesting();
    di.override(applyLensThemeInjectable, inner => applyLensThemeInjectable.instantiate(inner));
    const apply = di.inject(applyLensThemeInjectable);
    const cursor = di.inject(cursorThemeInjectable);
    const novakube = di.inject(novakubeThemeInjectable);
    const midnight = di.inject(midnightGraphiteThemeInjectable);
    const state = di.inject(userPreferencesStateInjectable);
    const activeTheme = di.inject(activeThemeInjectable);

    document.body.className = "";

    // Apply Cursor first
    apply(cursor);
    expect(document.body.classList.contains("theme-cursor")).toBe(true);
    expect(document.body.classList.contains("theme-novakube")).toBe(false);

    // Switch to NovaKube
    apply(novakube);
    expect(document.body.classList.contains("theme-novakube")).toBe(true);
    expect(document.body.classList.contains("theme-cursor")).toBe(false);
    expect(document.body.classList.contains("theme-midnight-graphite")).toBe(false);

    // Verify root CSS variables updated
    const root = document.documentElement.style;
    expect(root.getPropertyValue("--mainBackground")).toBe(novakubeBrandColors.background);
    expect(root.getPropertyValue("--surface")).toBe(novakubeBrandColors.background);
    expect(root.getPropertyValue("--surface-raised")).toBe(novakubeBrandColors.surface);
    expect(root.getPropertyValue("--action-primary")).toBe(novakubeBrandColors.accent);
    expect(root.getPropertyValue("--border-color")).toBe(novakubeBrandColors.border);

    // Switch to Midnight Graphite
    apply(midnight);
    expect(document.body.classList.contains("theme-novakube")).toBe(false);
    expect(document.body.classList.contains("theme-midnight-graphite")).toBe(true);

    // User preference integration
    state.colorTheme = novakubeThemeName;
    expect(activeTheme.get().name).toBe(novakubeThemeName);
  });
});
