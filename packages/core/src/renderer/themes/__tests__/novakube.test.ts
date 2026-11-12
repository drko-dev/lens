/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import novakubeThemeInjectable, { novakubeThemeName, novakubeBrandColors } from "../novakube.injectable";
import cursorThemeInjectable, { cursorThemeName } from "../cursor.injectable";
import midnightGraphiteThemeInjectable, { midnightGraphiteThemeName } from "../midnight-graphite.injectable";
import defaultLensThemeInjectable from "../default-theme.injectable";
import lensOfficialDarkThemeInjectable from "../lens-official-dark.injectable";
import activeThemeInjectable from "../active.injectable";
import applyLensThemeInjectable from "../apply-lens-theme.injectable";
import userPreferencesStateInjectable from "../../../features/user-preferences/common/state.injectable";
import { lensThemeDeclarationInjectionToken } from "../declaration";

describe("NovaKube — Lens 2026 Dark parity with NovaKube safety tokens", () => {
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

  it("maps the common runtime palette to Lens Dark while preserving NovaKube-specific safety tokens", () => {
    const di = getDiForUnitTesting();
    const novakube = di.inject(novakubeThemeInjectable);
    const reference = di.inject(lensOfficialDarkThemeInjectable);

    const lensVisualTokens = [
      "mainBackground", "secondaryBackground", "backgroundPrimary", "backgroundSecondary",
      "contentColor", "layoutBackground", "layoutTabsBackground", "layoutTabsActiveColor",
      "sidebarBackground", "sidebarLogoBackground", "sidebarSubmenuActiveColor",
      "borderColor", "textColorPrimary", "textColorSecondary", "textColorTertiary",
      "textColorAccent", "tableHeaderBackground", "tableBgcStripe", "tableBgcSelected",
      "tableSelectedRowColor", "primary", "blue", "buttonPrimaryBackground",
      "buttonDefaultBackground", "dialogBackground", "dialogHeaderBackground",
      "itemListBackground", "inputControlBackground", "navSelectedBackground",
    ];

    for (const token of lensVisualTokens) {
      // Optional properties in legacy themes may be undefined in the reference.
      const expected = reference.colors[token] ?? (token === "itemListBackground" ? reference.colors.mainBackground : undefined);
      expect(novakube.colors[token]).toBe(expected);
    }

    expect(novakube.colors.actionPrimary).toBe(reference.colors.buttonPrimaryBackground);
    expect(novakube.colors.buttonPrimaryForeground).toBe("#FFFFFF");
    expect(novakube.colors.actionPrimaryForeground).toBe("#FFFFFF");

    // Security/cluster semantics and terminal palette are intentionally unchanged.
    expect(novakube.colors.colorSuccess).toBe(novakubeBrandColors.success);
    expect(novakube.colors.colorWarning).toBe(novakubeBrandColors.warning);
    expect(novakube.colors.colorError).toBe(novakubeBrandColors.danger);
    expect(novakube.colors.envProduction).toBe("#EF4444");
    expect(novakube.colors.envStaging).toBe("#F59E0B");
    expect(novakube.colors.envDevelopment).toBe("#10B981");
    expect(novakube.terminalColors.background).toBe(novakubeBrandColors.background);
    expect(novakube.terminalColors.foreground).toBe(novakubeBrandColors.textPrimary);
    expect(novakube.terminalColors.blue).toBe(novakubeBrandColors.accent);
    expect(novakube.terminalColors.green).toBe(novakubeBrandColors.success);
    expect(novakube.terminalColors.yellow).toBe(novakubeBrandColors.warning);
    expect(novakube.terminalColors.red).toBe(novakubeBrandColors.danger);
  });

  it("keeps interaction, focus, link and icon states in parity with scoped Lens CSS", () => {
    const di = getDiForUnitTesting();
    const theme = di.inject(novakubeThemeInjectable);
    const reference = di.inject(lensOfficialDarkThemeInjectable);

    expect(theme.colors.primaryHover).toBe("#337DB5");
    expect(theme.colors.actionPrimaryHover).toBe("#337DB5");
    expect(theme.colors.focusRing).toBe(reference.colors.primary);
    expect(theme.colors.focusRingSoft).toBe("rgba(61, 144, 206, 0.30)");
    expect(theme.colors.linkColor).toBe(reference.colors.primary);
    expect(theme.colors.linkHoverColor).toBe("#75BEFF");
    expect(theme.colors.iconActiveBackground).toBe(reference.colors.iconActiveBackground);
    expect(theme.colors.magenta).toBe(reference.colors.magenta);
  });

  it("verifies normal-text contrast and documents Lens blue-button exception", () => {
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

    // Mirantis Lens uses white on #3D90CE (~3.45:1): sufficient for large text
    // but NOT WCAG AA for normal-size text. Preserve requested fidelity and
    // explicitly record that accessibility exception instead of hiding it.
    const lensBlueButtonContrast = contrast(colors.buttonPrimaryForeground, colors.buttonPrimaryBackground);
    expect(lensBlueButtonContrast).toBeGreaterThanOrEqual(3);
    expect(lensBlueButtonContrast).toBeLessThan(4.5);
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
    expect(root.getPropertyValue("--mainBackground")).toBe(novakube.colors.mainBackground);
    expect(root.getPropertyValue("--surface")).toBe(novakube.colors.surface);
    expect(root.getPropertyValue("--surface-raised")).toBe(novakube.colors.surfaceRaised);
    expect(root.getPropertyValue("--action-primary")).toBe(novakube.colors.actionPrimary);
    expect(root.getPropertyValue("--border-color")).toBe(novakube.colors.borderColor);

    // Switch to Midnight Graphite
    apply(midnight);
    expect(document.body.classList.contains("theme-novakube")).toBe(false);
    expect(document.body.classList.contains("theme-midnight-graphite")).toBe(true);

    // User preference integration
    state.colorTheme = novakubeThemeName;
    expect(activeTheme.get().name).toBe(novakubeThemeName);
  });
});
