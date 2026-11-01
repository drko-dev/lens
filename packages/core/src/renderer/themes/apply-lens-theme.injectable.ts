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

export type ApplyLensTheme = (theme: LensTheme) => void;

const applyLensThemeInjectable = getInjectable({
  id: "apply-lens-theme",
  instantiate: (di): ApplyLensTheme => {
    const logger = di.inject(loggerInjectionToken);
    const resetTheme = di.inject(resetThemeInjectable);
    const state = di.inject(userPreferencesStateInjectable);

    return (theme) => {
      try {
        const colors = object.entries(theme.colors);

        for (const [name, value] of colors) {
          document.documentElement.style.setProperty(`--${name}`, value);
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
