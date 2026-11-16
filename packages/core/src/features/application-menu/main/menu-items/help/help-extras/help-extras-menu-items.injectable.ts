/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { app, shell } from "electron";
import applicationMenuItemInjectionToken from "../../application-menu-item-injection-token";
import navigateToWelcomeInjectable from "../../../../../../common/front-end-routing/routes/welcome/navigate-to-welcome.injectable";

export const releaseNotesMenuItemInjectable = getInjectable({
  id: "help-release-notes-menu-item",

  instantiate: (di) => {
    const navigateToWelcome = di.inject(navigateToWelcomeInjectable);

    return {
      kind: "clickable-menu-item" as const,
      parentId: "help",
      id: "release-notes",
      orderNumber: 25,
      label: "Release Notes",
      onClick: () => {
        navigateToWelcome();
      },
    };
  },

  injectionToken: applicationMenuItemInjectionToken,
});

export const exportSupportLogsMenuItemInjectable = getInjectable({
  id: "help-export-support-logs-menu-item",

  instantiate: () => ({
    kind: "clickable-menu-item" as const,
    parentId: "help",
    id: "export-support-logs",
    orderNumber: 35,
    label: "Export Support Logs",
    onClick: () => {
      try {
        void shell.openPath(app.getPath("logs"));
      } catch {
        // Ignore in unit test environments
      }
    },
  }),

  injectionToken: applicationMenuItemInjectionToken,
});

export const restartInSafeModeMenuItemInjectable = getInjectable({
  id: "help-restart-safe-mode-menu-item",

  instantiate: () => ({
    kind: "clickable-menu-item" as const,
    parentId: "help",
    id: "restart-in-safe-mode",
    orderNumber: 37,
    label: "Restart in Safe Mode",
    onClick: () => {
      try {
        app.relaunch({ args: [...process.argv.slice(1), "--safe-mode"] });
        app.exit(0);
      } catch {
        // Ignore in unit test environments
      }
    },
  }),

  injectionToken: applicationMenuItemInjectionToken,
});
