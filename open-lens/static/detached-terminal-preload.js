/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

const { contextBridge, ipcRenderer } = require("electron");

// R4-06B: fixed channel allowlist. The page never names a cluster, tab or PTY: Main uses the registered identity.
contextBridge.exposeInMainWorld("lensDetachedTerminal", Object.freeze({
  getContext: () => ipcRenderer.invoke("detached-terminal:get-context"),
  start: () => ipcRenderer.invoke("detached-terminal:start"),
  input: (data) => ipcRenderer.invoke("detached-terminal:input", String(data)),
  resize: (cols, rows) => ipcRenderer.invoke("detached-terminal:resize", { cols: Number(cols), rows: Number(rows) }),
  requestRedock: () => ipcRenderer.invoke("detached-terminal:redock"),
  // Only Main can send on this channel; the IPC event object is never exposed to the page.
  onEvent: (callback) => {
    ipcRenderer.on("detached-terminal:event", (_event, payload) => callback(payload));
  },
}));
