/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { loggerInjectionToken } from "@openlens/logger";
import electronDialogInjectable from "../../electron-app/features/electron-dialog.injectable";
import getDialogParentWindowInjectable from "../../routes/port-forward/get-dialog-parent-window.injectable";

export interface ProductionNodeShellRequest {
  clusterId: string;
  clusterName: string;
  environmentLabel: string;
  nodeName: string;
}

export type ConfirmProductionNodeShell = (request: ProductionNodeShellRequest) => Promise<boolean>;

const CANCEL_BUTTON = 0;
const CONFIRM_BUTTON = 1;

const confirmProductionNodeShellInjectable = getInjectable({
  id: "confirm-production-node-shell",
  instantiate: (di): ConfirmProductionNodeShell => {
    const dialog = di.inject(electronDialogInjectable);
    const getParentWindow = di.inject(getDialogParentWindowInjectable);
    const logger = di.inject(loggerInjectionToken);

    return async (request) => {
      try {
        const parent = getParentWindow();

        if (!parent || parent.isDestroyed()) {
          logger.warn("[NODE-SHELL-SECURITY]: no window available for PROD confirmation, rejecting");

          return false;
        }

        if (parent.isMinimized()) {
          parent.restore();
        }

        parent.focus();

        const { response } = await dialog.showMessageBox(parent, {
          type: "warning",
          title: "Production Node Shell",
          message: `Open a privileged Node Shell on PRODUCTION cluster "${request.clusterName}"?`,
          detail: [
            `Cluster: ${request.clusterName} (${request.clusterId})`,
            `Environment: ${request.environmentLabel}`,
            `Target Node: ${request.nodeName}`,
            `Privilege: Host root access (nsenter -t 1)`,
            `Risk: Critical host-level access.`,
          ].join("\n"),
          buttons: ["Cancel", "Open Privileged Shell"],
          defaultId: CANCEL_BUTTON,
          cancelId: CANCEL_BUTTON,
          noLink: true,
        });

        return response === CONFIRM_BUTTON;
      } catch (error) {
        logger.error(`[NODE-SHELL-SECURITY]: PROD confirmation failed, rejecting: ${error}`);

        return false;
      }
    };
  },
});

export default confirmProductionNodeShellInjectable;
