/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { loggerInjectionToken } from "@openlens/logger";
import electronDialogInjectable from "../../electron-app/features/electron-dialog.injectable";
import getDialogParentWindowInjectable from "./get-dialog-parent-window.injectable";

export interface ProductionPortForwardRequest {
  clusterId: string;
  clusterName: string;
  environmentLabel: string;
  namespace: string;
  kind: string;
  name: string;
  port: number;
  forwardPort: number;
}

/**
 * Resolves `true` only when the user explicitly accepts. Cancel, close, a missing window or any error is a rejection.
 */
export type ConfirmProductionPortForward = (request: ProductionPortForwardRequest) => Promise<boolean>;

const CANCEL_BUTTON = 0;
const CONFIRM_BUTTON = 1;

const confirmProductionPortForwardInjectable = getInjectable({
  id: "confirm-production-port-forward",
  instantiate: (di): ConfirmProductionPortForward => {
    const dialog = di.inject(electronDialogInjectable);
    const getParentWindow = di.inject(getDialogParentWindowInjectable);
    const logger = di.inject(loggerInjectionToken);

    return async (request) => {
      try {
        const parent = getParentWindow();

        if (!parent || parent.isDestroyed()) {
          logger.warn("[PORT-FORWARD-SECURITY]: no window available for PROD confirmation, rejecting");

          return false;
        }

        if (parent.isMinimized()) {
          parent.restore();
        }

        parent.focus();

        const localPort = request.forwardPort > 0 ? String(request.forwardPort) : "random port";
        const { response } = await dialog.showMessageBox(parent, {
          type: "warning",
          title: "Production port-forward",
          message: `Start a port-forward on PRODUCTION cluster "${request.clusterName}"?`,
          detail: [
            `Cluster: ${request.clusterName} (${request.clusterId})`,
            `Environment: ${request.environmentLabel}`,
            `Resource: ${request.kind}/${request.name} in namespace ${request.namespace}`,
            `Ports: 127.0.0.1:${localPort} -> ${request.port}`,
          ].join("\n"),
          buttons: ["Cancel", "Start port-forward"],
          defaultId: CANCEL_BUTTON,
          cancelId: CANCEL_BUTTON,
          noLink: true,
        });

        return response === CONFIRM_BUTTON;
      } catch (error) {
        logger.error(`[PORT-FORWARD-SECURITY]: PROD confirmation failed, rejecting: ${error}`);

        return false;
      }
    };
  },
});

export default confirmProductionPortForwardInjectable;
