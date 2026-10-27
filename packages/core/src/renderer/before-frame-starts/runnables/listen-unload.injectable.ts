/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import currentlyInClusterFrameInjectable from "../../routes/currently-in-cluster-frame.injectable";
import { beforeFrameStartsSecondInjectionToken } from "../tokens";
import { loggerInjectionToken } from "@openlens/logger";
import hostedClusterInjectable from "../../cluster-frame-context/hosted-cluster.injectable";
import frameRoutingIdInjectable from "../../frames/cluster-frame/init-cluster-frame/frame-routing-id/frame-routing-id.injectable";
import closeRendererLogFileInjectable from "../../../features/population-of-logs-to-a-file/renderer/close-renderer-log-file.injectable";

const listenUnloadInjectable = getInjectable({
  id: "listen-unload",
  instantiate: (di) => ({
    run: () => {
      const closeRendererLogFile = di.inject(closeRendererLogFileInjectable);
      const isClusterFrame = di.inject(currentlyInClusterFrameInjectable);
      const logger = di.inject(loggerInjectionToken);

      window.addEventListener("beforeunload", () => {
        if (isClusterFrame) {
          const hostedCluster = di.inject(hostedClusterInjectable);
          const frameRoutingId = di.inject(frameRoutingIdInjectable);

          logger.info(
            `[CLUSTER-FRAME] Unload dashboard, clusterId=${hostedCluster?.id}, frameId=${frameRoutingId}`,
          );
        } else {
          logger.info("[ROOT-FRAME]: Unload app");
        }

        closeRendererLogFile();
        // The React root is deliberately NOT unmounted here. Both frame kinds are discarded right after this handler
        // (cluster frame: navigated to about:blank on tab close / disconnect; root frame: app quit, which the main process
        // finishes with app.exit()). Unmounting inside beforeunload made the engine throw the string "illegal access"
        // from a DOM operation in React's commit, and React's pending commits rethrew it asynchronously. Measured on the
        // packaged app: 3 uncaught exceptions per cycling run with the unmount, 0 in 116 cycles without it.
      });
    },
  }),
  injectionToken: beforeFrameStartsSecondInjectionToken,
});

export default listenUnloadInjectable;
