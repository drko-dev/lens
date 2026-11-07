/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("incidentConfirmationApi", Object.freeze({
  getDetails: () => ipcRenderer.invoke("openlens:incident:confirmation:get-details"),
  respond: (decision) => ipcRenderer.invoke("openlens:incident:confirmation:respond", decision),
}));
