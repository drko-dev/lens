/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { loggerInjectionToken } from "@openlens/logger";
import electronDialogInjectable from "../../electron-app/features/electron-dialog.injectable";
import getDialogParentWindowInjectable from "../../routes/port-forward/get-dialog-parent-window.injectable";
import type { ProductionTerminalDetachRequest } from "./detached-terminal-manager";

/**
 * Resolves `true` only when the user explicitly accepts. Cancel, close, a missing window or any error is a rejection.
 */
export type ConfirmProductionTerminalDetach = (request: ProductionTerminalDetachRequest) => Promise<boolean>;

const CANCEL_BUTTON = 0;
const CONFIRM_BUTTON = 1;

const confirmProductionTerminalDetachInjectable = getInjectable({
  id: "confirm-production-terminal-detach",
  instantiate: (di): ConfirmProductionTerminalDetach => {
    const dialog = di.inject(electronDialogInjectable);
    const getParentWindow = di.inject(getDialogParentWindowInjectable);
    const logger = di.inject(loggerInjectionToken);

    return async (request) => {
      try {
        const parent = getParentWindow();

        if (!parent || parent.isDestroyed()) {
          logger.warn("[DETACHED-TERMINAL]: no window available for PROD confirmation, rejecting");

          return false;
        }

        if (parent.isMinimized()) {
          parent.restore();
        }

        parent.focus();

        const { response } = await dialog.showMessageBox(parent, {
          type: "warning",
          title: "Production terminal",
          message: `Open a PRODUCTION terminal of cluster "${request.clusterName}" in a separate window?`,
          detail: [
            `Cluster: ${request.clusterName} (${request.clusterId})`,
            `Environment: ${request.environmentLabel}`,
            "The same shell session moves to the new window; closing the window returns it to the dock.",
          ].join("\n"),
          buttons: ["Cancel", "Detach terminal"],
          defaultId: CANCEL_BUTTON,
          cancelId: CANCEL_BUTTON,
          noLink: true,
        });

        return response === CONFIRM_BUTTON;
      } catch (error) {
        logger.error(`[DETACHED-TERMINAL]: PROD confirmation failed, rejecting: ${error}`);

        return false;
      }
    };
  },
});

export default confirmProductionTerminalDetachInjectable;
