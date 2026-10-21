/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { BrowserWindow, session } from "electron";
import { loggerInjectionToken } from "@openlens/logger";
import path from "path";
import { fileURLToPath } from "url";
import staticFilesDirectoryInjectable from "../../../../common/vars/static-files-directory.injectable";
import joinPathsInjectable from "../../../../common/path/join-paths.injectable";
import { registerSecurePilotIpcHandlers } from "./secure-pilot-ipc-handlers";

function isPilotDocument(url: string, htmlPath: string): boolean {
  try {
    return path.resolve(fileURLToPath(new URL(url))) === path.resolve(htmlPath);
  } catch {
    return false;
  }
}

export interface SecurePilotWindow {
  show: () => void;
  close: () => void;
  isDestroyed: () => boolean;
  browserWindow: BrowserWindow;
}

const createSecurePilotWindowInjectable = getInjectable({
  id: "create-secure-pilot-window",

  instantiate: (di) => {
    const logger = di.inject(loggerInjectionToken);
    const staticFilesDirectory = di.inject(staticFilesDirectoryInjectable);
    const joinPaths = di.inject(joinPathsInjectable);

    return (): SecurePilotWindow => {
      const preloadPath = joinPaths(staticFilesDirectory, "secure-pilot-preload.js");
      const htmlPath = joinPaths(staticFilesDirectory, "secure-pilot.html");
      const pilotSession = session.fromPartition("openlens-secure-pilot");

      pilotSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
      pilotSession.setPermissionCheckHandler(() => false);

      logger.info(`[SECURE-PILOT]: Creating isolated BrowserWindow with preload: ${preloadPath}`);

      const browserWindow = new BrowserWindow({
        width: 1080,
        height: 760,
        title: "OpenLens DevOps — R4 Secure Pilot Window",
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
          session: pilotSession,
          preload: preloadPath,
        },
      });

      // Register IPC handlers
      const removeIpcHandlers = registerSecurePilotIpcHandlers(browserWindow, htmlPath);

      // Deny any external popups / new windows
      browserWindow.webContents.setWindowOpenHandler(() => {
        logger.warn("[SECURE-PILOT]: Denied unauthorized window open request.");

        return { action: "deny" };
      });

      // Deny unauthorized in-window navigation
      browserWindow.webContents.on("will-navigate", (event, navigationUrl) => {
        if (!isPilotDocument(navigationUrl, htmlPath)) {
          event.preventDefault();
          logger.warn("[SECURE-PILOT]: Blocked unauthorized navigation request.");
        }
      });

      browserWindow.webContents.on("will-redirect", (event, navigationUrl) => {
        if (!isPilotDocument(navigationUrl, htmlPath)) {
          event.preventDefault();
          logger.warn("[SECURE-PILOT]: Blocked unauthorized redirect.");
        }
      });

      browserWindow.on("closed", () => {
        logger.info("[SECURE-PILOT]: Secure pilot window closed, cleaning up IPC handlers");
        removeIpcHandlers();
      });

      browserWindow.loadFile(htmlPath).catch((err) => {
        logger.error(`[SECURE-PILOT]: Failed to load HTML from ${htmlPath}:`, err);
      });

      return {
        show: () => browserWindow.show(),
        close: () => browserWindow.close(),
        isDestroyed: () => browserWindow.isDestroyed(),
        browserWindow,
      };
    };
  },
});

export default createSecurePilotWindowInjectable;
