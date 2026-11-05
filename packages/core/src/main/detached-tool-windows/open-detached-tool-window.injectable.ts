/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { BrowserWindow, session, webContents } from "electron";
import { loggerInjectionToken } from "@openlens/logger";
import staticFilesDirectoryInjectable from "../../common/vars/static-files-directory.injectable";
import joinPathsInjectable from "../../common/path/join-paths.injectable";
import detachedWindowRegistryInjectable from "./detached-window-registry.injectable";
import type { DetachedWindowRecord } from "./detached-window-registry";
import { parseDetachedToolDescriptor } from "./detached-window-registry";
import { isExpectedDocument, registerDetachedWindowIpc } from "./detached-window-ipc";

export interface OpenDetachedToolWindowResult {
  readonly windowId: number;
  readonly reused: boolean;
}

export interface DetachedToolWindowHooks {
  /** The page registered its listener (sender already validated); start feeding it. */
  readonly onStart?: (record: DetachedWindowRecord) => void;
  readonly onRefresh?: (record: DetachedWindowRecord) => void;
  /** Fires once the window is gone (OS close, redock, crash) and the registry entry is released. */
  readonly onClosed?: (record: DetachedWindowRecord) => void;
}

export type OpenDetachedToolWindow = (input: unknown, hooks?: DetachedToolWindowHooks) => OpenDetachedToolWindowResult;

/**
 * R4-06: opens (or focuses) an isolated window for one tool session.
 * The window only receives its immutable descriptor; the tool session manager
 * (detached-tool-session-manager) feeds it data through the hooks.
 */
const openDetachedToolWindowInjectable = getInjectable({
  id: "open-detached-tool-window",

  instantiate: (di) => {
    const logger = di.inject(loggerInjectionToken);
    const registry = di.inject(detachedWindowRegistryInjectable);
    const staticFilesDirectory = di.inject(staticFilesDirectoryInjectable);
    const joinPaths = di.inject(joinPathsInjectable);
    const htmlPath = joinPaths(staticFilesDirectory, "detached-tool.html");
    const preloadPath = joinPaths(staticFilesDirectory, "detached-tool-preload.js");
    const windows = new Map<number, BrowserWindow>();
    const hooksByWindow = new Map<number, DetachedToolWindowHooks>();
    let disposeIpc: (() => void) | undefined;

    const release = (windowId: number) => {
      const hooks = hooksByWindow.get(windowId);

      windows.delete(windowId);
      hooksByWindow.delete(windowId);

      const record = registry.release(windowId);

      if (record) {
        logger.info(`[DETACHED-TOOL]: released window ${windowId}`);

        try {
          hooks?.onClosed?.(record);
        } catch (error) {
          logger.error(`[DETACHED-TOOL]: onClosed hook failed for window ${windowId}`, error);
        }
      }

      if (registry.size === 0 && disposeIpc) {
        disposeIpc();
        disposeIpc = undefined;
      }
    };

    const opener: OpenDetachedToolWindow = (input, hooks = {}) => {
      const descriptor = parseDetachedToolDescriptor(input);
      const owner = registry.findOwner(descriptor);

      if (owner) {
        const existing = windows.get(owner.windowId);

        // H7.5: "Show window" from OpenLens must also bring back a minimized window.
        if (existing?.isMinimized()) existing.restore();
        existing?.focus();

        return { windowId: owner.windowId, reused: true };
      }

      // Drop records left behind by a crashed renderer before enforcing ownership/limits.
      registry.releaseStale(id => {
        const contents = webContents.fromId(id);

        return Boolean(contents && !contents.isDestroyed());
      });

      disposeIpc ??= registerDetachedWindowIpc({
        registry,
        htmlPath,
        getMainFrame: (id) => {
          const window = windows.get(id);

          return window && !window.isDestroyed() ? window.webContents.mainFrame : undefined;
        },
        onRedockRequested: (record) => {
          logger.info(`[DETACHED-TOOL]: redock requested by window ${record.windowId}`);
          windows.get(record.windowId)?.close();
        },
        onStartRequested: record => hooksByWindow.get(record.windowId)?.onStart?.(record),
        onRefreshRequested: record => hooksByWindow.get(record.windowId)?.onRefresh?.(record),
      });

      const toolSession = session.fromPartition("openlens-detached-tools");

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
            logger.warn(`[DETACHED-TOOL]: blocked ${navigationEvent} in window ${windowId}`);
          }
        });
      }

      browserWindow.webContents.on("render-process-gone", () => {
        logger.warn(`[DETACHED-TOOL]: renderer of window ${windowId} is gone; closing it`);
        browserWindow.destroy();
      });
      browserWindow.on("closed", () => release(windowId));
      browserWindow.once("ready-to-show", () => browserWindow.show());
      browserWindow.loadFile(htmlPath).catch(error => {
        logger.error(`[DETACHED-TOOL]: failed to load ${htmlPath}`, error);
        browserWindow.destroy();
      });

      logger.info(`[DETACHED-TOOL]: opened ${descriptor.toolKind} window ${windowId} for cluster ${descriptor.clusterId}`);

      return { windowId, reused: false };
    };

    return opener;
  },
});

export default openDetachedToolWindowInjectable;
