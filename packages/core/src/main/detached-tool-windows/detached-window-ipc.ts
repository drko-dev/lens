/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { ipcMain } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import type { DetachedWindowRecord, DetachedWindowRegistry } from "./detached-window-registry";
import { DetachedWindowError } from "./detached-window-registry";

export const detachedWindowChannels = Object.freeze({
  getContext: "detached-tool:get-context",
  requestRedock: "detached-tool:request-redock",
  /** window -> Main: the page registered its listener and wants its data (identity comes from the registry). */
  start: "detached-tool:start",
  /** window -> Main: re-read the inspected resource. */
  refresh: "detached-tool:refresh",
});

/** Main -> window (webContents.send). Not an ipcMain handler: the page can only listen on it. */
export const detachedWindowEventChannel = "detached-tool:event";

export function isExpectedDocument(url: string, htmlPath: string): boolean {
  try {
    return path.resolve(fileURLToPath(new URL(url))) === path.resolve(htmlPath);
  } catch {
    return false;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

export interface DetachedWindowIpcDependencies {
  readonly registry: DetachedWindowRegistry;
  readonly htmlPath: string;
  /** Resolves a registered window id to its live WebContents main frame, if any. */
  readonly getMainFrame: (windowId: number) => unknown;
  readonly onRedockRequested: (record: DetachedWindowRecord) => void;
  readonly onStartRequested?: (record: DetachedWindowRecord) => void;
  readonly onRefreshRequested?: (record: DetachedWindowRecord) => void;
}

/**
 * Rejects anything not sent by the top frame of a registered detached window
 * showing the packaged local document. Returns that window's immutable record.
 */
export function assertTrustedDetachedSender(event: IpcMainInvokeEvent, deps: DetachedWindowIpcDependencies): DetachedWindowRecord {
  const sender = event?.sender;
  const frame = event?.senderFrame;
  const windowId = sender?.id;

  if (typeof windowId !== "number" || !deps.registry.get(windowId)) {
    throw new DetachedWindowError("Unauthorized IPC sender.");
  }

  const mainFrame = deps.getMainFrame(windowId);

  if (!frame || !mainFrame || frame !== mainFrame || !isExpectedDocument(frame.url, deps.htmlPath)) {
    throw new DetachedWindowError("Unauthorized IPC sender frame.");
  }

  return deps.registry.authorize(windowId);
}

/** Registers the fixed channel allowlist once for all detached windows. Returns a disposer. */
export function registerDetachedWindowIpc(deps: DetachedWindowIpcDependencies): () => void {
  ipcMain.handle(detachedWindowChannels.getContext, (event) => {
    const record = assertTrustedDetachedSender(event, deps);

    return { windowId: record.windowId, descriptor: record.descriptor };
  });

  ipcMain.handle(detachedWindowChannels.requestRedock, (event, request: unknown) => {
    const record = assertTrustedDetachedSender(event, deps);

    if (!isPlainRecord(request) || Object.keys(request).some(key => !["workspaceId", "tabId", "clusterId"].includes(key))) {
      throw new DetachedWindowError("Redock request must only restate the window identity.");
    }

    deps.registry.authorize(record.windowId, request as Record<string, string>);

    deps.onRedockRequested(record);

    return { accepted: true };
  });

  ipcMain.handle(detachedWindowChannels.start, (event, request: unknown) => {
    const record = assertTrustedDetachedSender(event, deps);

    if (request !== undefined) {
      throw new DetachedWindowError("Start request takes no payload.");
    }

    deps.onStartRequested?.(record);

    return { accepted: true };
  });

  ipcMain.handle(detachedWindowChannels.refresh, (event, request: unknown) => {
    const record = assertTrustedDetachedSender(event, deps);

    if (request !== undefined) {
      throw new DetachedWindowError("Refresh request takes no payload.");
    }

    deps.onRefreshRequested?.(record);

    return { accepted: true };
  });

  return () => {
    for (const channel of Object.values(detachedWindowChannels)) ipcMain.removeHandler(channel);
  };
}
