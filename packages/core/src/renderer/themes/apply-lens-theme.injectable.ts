/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { loggerInjectionToken } from "@openlens/logger";
import { object } from "@openlens/utilities";
import type { LensTheme } from "./lens-theme";
import resetThemeInjectable from "../../features/user-preferences/common/reset-theme.injectable";
import userPreferencesStateInjectable from "../../features/user-preferences/common/state.injectable";
import { applyEnvironmentColors } from "./apply-environment-colors";
import { midnightGraphiteThemeName } from "./midnight-graphite.injectable";
import { cursorMonoThemeName } from "./cursor-mono.injectable";
import { cursorThemeName } from "./cursor.injectable";
import { lensOfficialDarkThemeName } from "./lens-official-dark.injectable";
import { lensOfficialLightThemeName } from "./lens-official-light.injectable";

/**
 * Provide H1-H6 semantic design tokens for ALL Lens themes, including classic
 * Light/Dark and Cursor. Never let a previous theme's token survive switching.
 * Specific theme contracts override these compatibility defaults.
 */
export function resolveThemeDesignTokens(theme: LensTheme): Record<string, string> {
  const c = theme.colors;
  return {
    surface: c.surface ?? c.mainBackground,
    surfaceRaised: c.surfaceRaised ?? c.layoutTabsBackground ?? c.secondaryBackground,
    surfaceElevated: c.surfaceElevated ?? c.dialogBackground,
    surfaceHover: c.surfaceHover ?? c.navSelectedBackground,
    surfaceActive: c.surfaceActive ?? c.tableBgcSelected,
    textPrimary: c.textPrimary ?? c.textColorPrimary,
    textSecondary: c.textSecondary ?? c.textColorSecondary,
    textMuted: c.textMuted ?? c.textColorDimmed,
    borderDefault: c.borderDefault ?? c.borderColor,
    borderSubtle: c.borderSubtle ?? c.borderFaintColor,
    borderStrong: c.borderStrong ?? c.inputControlHoverBorder ?? c.borderColor,
    actionPrimary: c.actionPrimary ?? c.buttonPrimaryBackground,
    actionPrimaryHover: c.actionPrimaryHover ?? c.primary,
    actionPrimaryForeground: c.actionPrimaryForeground ?? "#FFFFFF",
    buttonPrimaryForeground: c.buttonPrimaryForeground ?? "#FFFFFF",
    actionSecondary: c.actionSecondary ?? c.buttonDefaultBackground,
    actionSecondaryHover: c.actionSecondaryHover ?? c.navSelectedBackground,
    actionDanger: c.actionDanger ?? c.colorError,
    actionDangerHover: c.actionDangerHover ?? c.colorSoftError ?? c.colorError,
    actionDisabled: c.actionDisabled ?? c.buttonDisabledBackground ?? c.buttonDefaultBackground,
    focusRing: c.focusRing ?? c.primary,
    focusRingSoft: c.focusRingSoft ?? c.iconActiveBackground ?? c.tableBgcSelected,
    primaryMuted: c.primaryMuted ?? c.iconActiveBackground ?? c.tableBgcSelected,
    warningTint: c.warningTint ?? c.tableBgcSelected,
    statusSuccess: c.statusSuccess ?? c.colorSuccess,
    statusWarning: c.statusWarning ?? c.colorWarning,
    statusError: c.statusError ?? c.colorError,
    statusInfo: c.statusInfo ?? c.colorInfo,
    graphiteBorder: c.graphiteBorder ?? c.borderColor,
    graphiteAccent: c.graphiteAccent ?? c.primary,
    graphiteSurface: c.graphiteSurface ?? c.secondaryBackground,
    graphiteSurfaceRaised: c.graphiteSurfaceRaised ?? c.dialogBackground,
  };
}

export type ApplyLensTheme = (theme: LensTheme) => void;

const applyLensThemeInjectable = getInjectable({
  id: "apply-lens-theme",
  instantiate: (di): ApplyLensTheme => {
    const logger = di.inject(loggerInjectionToken);
    const resetTheme = di.inject(resetThemeInjectable);
    const state = di.inject(userPreferencesStateInjectable);

    return (theme) => {
      try {
        const colors = object.entries({ ...resolveThemeDesignTokens(theme), ...theme.colors });

        for (const [name, value] of colors) {
          document.documentElement.style.setProperty(`--${name}`, value);
          const kebab = name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
          if (kebab !== name) {
            document.documentElement.style.setProperty(`--${kebab}`, value);
          }
        }

        // Apply customized environment colors over theme defaults
        applyEnvironmentColors(state.environmentColors, theme.type === "light");

        // Adding universal theme flag which can be used in component styles
        document.body.classList.toggle("theme-light", theme.type === "light");
        document.body.classList.toggle("theme-midnight-graphite", theme.name === midnightGraphiteThemeName);
        document.body.classList.toggle("theme-cursor-mono", theme.name === cursorMonoThemeName);
        document.body.classList.toggle("theme-cursor", theme.name === cursorThemeName);
        document.body.classList.toggle("theme-lens-official-dark", theme.name === lensOfficialDarkThemeName);
        document.body.classList.toggle("theme-lens-official-light", theme.name === lensOfficialLightThemeName);
      } catch (error) {
        logger.error("[THEME]: Failed to apply active theme", error);
        resetTheme();
      }
    };
  },
  causesSideEffects: true,
});

export default applyLensThemeInjectable;
