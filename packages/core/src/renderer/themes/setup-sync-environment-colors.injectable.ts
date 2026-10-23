/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { reaction } from "mobx";
import { beforeFrameStartsSecondInjectionToken } from "../before-frame-starts/tokens";
import initUserStoreInjectable from "../../features/user-preferences/renderer/load-storage.injectable";
import activeThemeInjectable from "./active.injectable";
import setupApplyActiveThemeInjectable from "./setup-apply-active-theme.injectable";
import userPreferencesStateInjectable from "../../features/user-preferences/common/state.injectable";
import { applyEnvironmentColors } from "./apply-environment-colors";

const setupSyncEnvironmentColorsInjectable = getInjectable({
  id: "setup-sync-environment-colors",
  instantiate: (di) => ({
    run: () => {
      const state = di.inject(userPreferencesStateInjectable);
      const activeTheme = di.inject(activeThemeInjectable);

      reaction(
        () => ({
          colors: state.environmentColors ? { ...state.environmentColors } : undefined,
          isLight: activeTheme.get()?.type === "light",
        }),
        ({ colors, isLight }) => {
          applyEnvironmentColors(colors, isLight);
        },
        {
          fireImmediately: true,
        },
      );
    },
    runAfter: [
      initUserStoreInjectable,
      setupApplyActiveThemeInjectable,
    ],
  }),
  injectionToken: beforeFrameStartsSecondInjectionToken,
});

export default setupSyncEnvironmentColorsInjectable;
