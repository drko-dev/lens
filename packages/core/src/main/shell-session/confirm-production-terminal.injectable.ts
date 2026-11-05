/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { loggerInjectionToken } from "@openlens/logger";
import electronDialogInjectable from "../electron-app/features/electron-dialog.injectable";
import getDialogParentWindowInjectable from "../routes/port-forward/get-dialog-parent-window.injectable";
import type { ProductionTerminalRequest } from "./terminal-prod-authorization-handler";

export type ConfirmProductionTerminal = (request: ProductionTerminalRequest) => Promise<boolean>;

const CANCEL_BUTTON = 0;
const CONFIRM_BUTTON = 1;

const confirmProductionTerminalInjectable = getInjectable({
  id: "confirm-production-terminal",
  instantiate: (di): ConfirmProductionTerminal => {
    const dialog = di.inject(electronDialogInjectable);
    const getParentWindow = di.inject(getDialogParentWindowInjectable);
    const logger = di.inject(loggerInjectionToken);

    return async (request) => {
      try {
        const parent = getParentWindow();

        if (!parent || parent.isDestroyed()) {
          logger.warn("[TERMINAL-SECURITY]: no window available for PROD confirmation, rejecting");

          return false;
        }

        if (parent.isMinimized()) {
          parent.restore();
        }

        parent.focus();

        const { response } = await dialog.showMessageBox(parent, {
          type: "warning",
          title: "Production Terminal",
          message: `Open a terminal on PRODUCTION cluster "${request.clusterName}"?`,
          detail: [
            `Cluster: ${request.clusterName} (${request.clusterId})`,
            `Environment: ${request.environmentLabel}`,
            `Commands run directly against live production infrastructure.`,
          ].join("\n"),
          buttons: ["Cancel", "Open Terminal"],
          defaultId: CANCEL_BUTTON,
          cancelId: CANCEL_BUTTON,
          noLink: true,
        });

        return response === CONFIRM_BUTTON;
      } catch (error) {
        logger.error(`[TERMINAL-SECURITY]: PROD confirmation failed, rejecting: ${error}`);

        return false;
      }
    };
  },
});

export default confirmProductionTerminalInjectable;
