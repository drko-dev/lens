/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { reaction } from "mobx";
import ipcRendererInjectable from "../utils/channel/ipc-renderer.injectable";
import { beforeMainFrameStartsSecondInjectionToken } from "../before-frame-starts/tokens";
import { DETACHED_THEME_TOKENS, isSafeColorValue } from "../../common/detached-tools/detached-theme";
import type { DetachedThemePayload } from "../../common/detached-tools/detached-theme";
import { detachedThemeChannels } from "../../common/detached-tools/detached-tool-channels";
import activeThemeInjectable from "./active.injectable";
import terminalColorsInjectable from "./terminal-colors.injectable";

/** R5-07: root (app) frame only. Sends allowlisted colours + type, read from theme objects, never computed CSS. */
const syncThemeToDetachedWindowsInjectable = getInjectable({
  id: "sync-theme-to-detached-windows",

  instantiate: (di) => ({
    run: () => {
      const ipcRenderer = di.inject(ipcRendererInjectable);
      const activeTheme = di.inject(activeThemeInjectable);
      const terminalColors = di.inject(terminalColorsInjectable);

      reaction(
        () => {
          const theme = activeTheme.get();
          const terminal = terminalColors.get() as Record<string, string | undefined>;
          const source = theme.colors as Record<string, string | undefined>;
          const colors: DetachedThemePayload["colors"] = {};

          for (const token of DETACHED_THEME_TOKENS) {
            const raw = token.startsWith("terminal")
              ? terminal[token.charAt(8).toLowerCase() + token.slice(9)]
              : source[token];
            const value = typeof raw === "string" ? raw.trim() : undefined;

            if (isSafeColorValue(value)) colors[token] = value;
          }

          return { type: theme.type, colors } as DetachedThemePayload;
        },
        payload => ipcRenderer?.send?.(detachedThemeChannels.update, payload),
        { fireImmediately: true },
      );
    },
  }),

  injectionToken: beforeMainFrameStartsSecondInjectionToken,
});

export default syncThemeToDetachedWindowsInjectable;
