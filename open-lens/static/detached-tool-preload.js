/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

const { contextBridge, ipcRenderer } = require("electron");

// R4-06: fixed channel allowlist; identity is owned by Electron Main.
contextBridge.exposeInMainWorld("lensDetachedTool", Object.freeze({
  getContext: () => ipcRenderer.invoke("detached-tool:get-context"),
  requestRedock: (identity) => ipcRenderer.invoke("detached-tool:request-redock", {
    workspaceId: String(identity?.workspaceId ?? ""),
    tabId: String(identity?.tabId ?? ""),
    clusterId: String(identity?.clusterId ?? ""),
  }),
  // The window never says WHAT to stream; Main uses the registered identity.
  start: () => ipcRenderer.invoke("detached-tool:start"),
  refresh: () => ipcRenderer.invoke("detached-tool:refresh"),
  // Only Main can send on this channel; the IPC event object is never exposed to the page.
  onEvent: (callback) => {
    ipcRenderer.on("detached-tool:event", (_event, payload) => callback(payload));
  },
}));
