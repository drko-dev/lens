/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { BrowserWindow, session, webContents } from "electron";
import { loggerInjectionToken } from "@openlens/logger";
import clusterFramesInjectable from "../../../common/cluster-frames.injectable";
import detachedToolWindowsFeatureFlagInjectable from "../../../common/detached-tools/detached-tool-windows-feature-flag.injectable";
import staticFilesDirectoryInjectable from "../../../common/vars/static-files-directory.injectable";
import joinPathsInjectable from "../../../common/path/join-paths.injectable";
import getClusterByIdInjectable from "../../../features/cluster/storage/common/get-by-id.injectable";
import { createToolContextFromCluster } from "../../../common/workspace/tool-context";
import { detachedTerminalEventChannel, detachedTerminalFrameChannels } from "../../../common/terminal/detached-terminal-channels";
import shellSessionProcessesInjectable from "../../shell-session/processes.injectable";
import shellSessionHandoverInjectable from "../../shell-session/shell-session-handover.injectable";
import detachedWindowRegistryInjectable from "../detached-window-registry.injectable";
import { isExpectedDocument } from "../detached-window-ipc";
import type { DetachedWindowRecord } from "../detached-window-registry";
import { DetachedTerminalBridge } from "./detached-terminal-bridge";
import { DetachedTerminalManager } from "./detached-terminal-manager";
import confirmProductionTerminalDetachInjectable from "./confirm-production-terminal-detach.injectable";

const detachedTerminalManagerInjectable = getInjectable({
  id: "detached-terminal-manager",

  instantiate: (di) => {
    const logger = di.inject(loggerInjectionToken);
    const registry = di.inject(detachedWindowRegistryInjectable);
    const flag = di.inject(detachedToolWindowsFeatureFlagInjectable);
    const clusterFrames = di.inject(clusterFramesInjectable);
    const getClusterById = di.inject(getClusterByIdInjectable);
    const processes = di.inject(shellSessionProcessesInjectable);
    const handover = di.inject(shellSessionHandoverInjectable);
    const htmlPath = di.inject(joinPathsInjectable)(di.inject(staticFilesDirectoryInjectable), "detached-terminal.html");
    const preloadPath = di.inject(joinPathsInjectable)(di.inject(staticFilesDirectoryInjectable), "detached-terminal-preload.js");
    const windows = new Map<number, BrowserWindow>();
    const hooksByWindow = new Map<number, { onClosed: (record: DetachedWindowRecord, reason: "redock" | "crash") => void }>();
    const crashed = new Set<number>();
    // eslint-disable-next-line prefer-const
    let manager: DetachedTerminalManager;

    const bridge = new DetachedTerminalBridge({
      processes,
      handover,
      logger,
      sendToWindow: (windowId, payload) => {
        const contents = webContents.fromId(windowId);

        if (contents && !contents.isDestroyed()) {
          contents.send(detachedTerminalEventChannel, payload);
        }
      },
      onPtyExit: record => manager.ptyExited(record),
    });

    const release = (windowId: number) => {
      const hooks = hooksByWindow.get(windowId);

      windows.delete(windowId);
      hooksByWindow.delete(windowId);

      const record = registry.release(windowId);
      const reason = crashed.delete(windowId) ? "crash" : "redock";

      if (record) {
        try {
          hooks?.onClosed(record, reason);
        } catch (error) {
          logger.error(`[DETACHED-TERMINAL]: onClosed hook failed for window ${windowId}`, error);
        }
      }
    };

    manager = new DetachedTerminalManager({
      logger,
      registry,
      bridge,
      isEnabled: () => flag.isEnabled,
      getClusterFrames: () => clusterFrames,
      getCluster: (clusterId) => {
        const cluster = getClusterById(clusterId);

        return cluster
          ? { id: cluster.id, name: createToolContextFromCluster(cluster, "detached").clusterName, preferences: cluster.preferences }
          : undefined;
      },
      // Lazy: the dialog (a side-effect injectable) is only resolved when a PROD confirmation is needed.
      confirmProduction: request => di.inject(confirmProductionTerminalDetachInjectable)(request),
      getMainFrame: (id) => {
        const window = windows.get(id);

        return window && !window.isDestroyed() ? window.webContents.mainFrame : undefined;
      },
      isExpectedDocument: url => isExpectedDocument(url, htmlPath),
      closeWindow: (windowId) => {
        const window = windows.get(windowId);

        if (window && !window.isDestroyed()) {
          window.close();
        }
      },
      notifyClusterFrame: (clusterId, notice) => {
        const frame = clusterFrames.get(clusterId);

        if (!frame) return;

        for (const view of webContents.getAllWebContents()) {
          try {
            view.sendToFrame([frame.processId, frame.frameId], detachedTerminalFrameChannels.redocked, notice);
          } catch (error) {
            logger.debug(`[DETACHED-TERMINAL]: could not notify frame of cluster ${clusterId}: ${error}`);
          }
        }
      },
      openWindow: (descriptor, hooks) => {
        const owner = registry.findOwner(descriptor);

        if (owner) {
          windows.get(owner.windowId)?.focus();

          return { windowId: owner.windowId, reused: true };
        }

        registry.releaseStale(id => {
          const contents = webContents.fromId(id);

          return Boolean(contents && !contents.isDestroyed());
        });

        const toolSession = session.fromPartition("openlens-detached-terminals");

        toolSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
        toolSession.setPermissionCheckHandler(() => false);

        const browserWindow = new BrowserWindow({
          width: 960,
          height: 640,
          title: `${descriptor.isProduction ? "[PRODUCTION] " : ""}${descriptor.title}`,
          backgroundColor: "#181a1b",
          show: false,
          webPreferences: {
            nodeIntegration: false,
            nodeIntegrationInSubFrames: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            devTools: false,
            webviewTag: false,
            session: toolSession,
            preload: preloadPath,
          },
        });
        const windowId = browserWindow.webContents.id;

        try {
          registry.register(windowId, descriptor);
        } catch (error) {
          browserWindow.destroy();
          throw error;
        }

        windows.set(windowId, browserWindow);
        hooksByWindow.set(windowId, hooks);
        browserWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

        for (const navigationEvent of ["will-navigate", "will-redirect"] as const) {
          browserWindow.webContents.on(navigationEvent as "will-navigate", (event, url) => {
            if (!isExpectedDocument(url, htmlPath)) {
              event.preventDefault();
              logger.warn(`[DETACHED-TERMINAL]: blocked ${navigationEvent} in window ${windowId}`);
            }
          });
        }

        browserWindow.webContents.on("render-process-gone", () => {
          logger.warn(`[DETACHED-TERMINAL]: renderer of window ${windowId} is gone; closing it (PTY stays alive)`);
          crashed.add(windowId);
          browserWindow.destroy();
        });
        browserWindow.on("closed", () => release(windowId));
        browserWindow.once("ready-to-show", () => browserWindow.show());
        browserWindow.loadFile(htmlPath).catch(error => {
          logger.error(`[DETACHED-TERMINAL]: failed to load ${htmlPath}`, error);
          browserWindow.destroy();
        });

        logger.info(`[DETACHED-TERMINAL]: opened window ${windowId} for cluster ${descriptor.clusterId}`);

        return { windowId, reused: false };
      },
    });

    return manager;
  },
});

export default detachedTerminalManagerInjectable;
