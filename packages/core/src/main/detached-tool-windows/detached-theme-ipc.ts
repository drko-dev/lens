/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { ipcMain } from "electron";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { detachedThemeChannels } from "../../common/detached-tools/detached-tool-channels";
import type { DetachedThemePayload } from "../../common/detached-tools/detached-theme";
import { sanitizeDetachedTheme } from "../../common/detached-tools/detached-theme";
import type { DetachedWindowRegistry } from "./detached-window-registry";

export interface DetachedThemeIpcDependencies {
  readonly registry: DetachedWindowRegistry;
  readonly send: (windowId: number, channel: string, payload: DetachedThemePayload) => void;
}

const isRootFrame = (event: IpcMainEvent | IpcMainInvokeEvent) => !!event.senderFrame && event.senderFrame === event.sender?.mainFrame;

/**
 * R5-07: updates are accepted only from the root frame of a non-detached window,
 * sanitized (colours + type only), cached and broadcast to registered detached windows.
 */
export function registerDetachedThemeIpc(deps: DetachedThemeIpcDependencies): () => void {
  let cached: DetachedThemePayload | undefined;

  const onUpdate = (event: IpcMainEvent, input: unknown) => {
    if (typeof event.sender?.id !== "number" || deps.registry.get(event.sender.id) || !isRootFrame(event)) return;

    const payload = sanitizeDetachedTheme(input);

    if (!payload) return;

    cached = payload;

    for (const windowId of deps.registry.windowIds()) {
      deps.send(windowId, detachedThemeChannels.changed, payload);
    }
  };

  ipcMain.on(detachedThemeChannels.update, onUpdate);
  ipcMain.handle(detachedThemeChannels.get, (event) => {
    if (typeof event.sender?.id !== "number" || !deps.registry.get(event.sender.id) || !isRootFrame(event)) return undefined;

    return cached;
  });

  return () => {
    ipcMain.removeListener(detachedThemeChannels.update, onUpdate);
    ipcMain.removeHandler(detachedThemeChannels.get);
  };
}
