/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

const { contextBridge, ipcRenderer } = require("electron");

const ALLOWED_PILOT_CHANNELS = new Set([
  "secure-pilot:get-info",
  "secure-pilot:list-clusters",
  "secure-pilot:query-resource",
]);

function invokeAllowed(channel, ...args) {
  if (!ALLOWED_PILOT_CHANNELS.has(channel)) {
    return Promise.reject(new Error("IPC channel is not allowlisted."));
  }

  return ipcRenderer.invoke(channel, ...args);
}

function validateString(value, name, maxLength) {
  if (typeof value !== "string" || value.trim() === "" || value.length > maxLength) {
    throw new Error(`Invalid ${name}.`);
  }

  return value.trim();
}

const securePilotBridge = Object.freeze({
  getPilotInfo: () => invokeAllowed("secure-pilot:get-info"),
  listSyntheticClusters: () => invokeAllowed("secure-pilot:list-clusters"),
  queryClusterResource: (tabId, namespace, kind, name) => {
    const params = {
      tabId: validateString(tabId, "tabId", 100),
      namespace: validateString(namespace, "namespace", 253),
      kind: validateString(kind, "kind", 100),
      name: validateString(name, "name", 253),
    };

    return invokeAllowed("secure-pilot:query-resource", params);
  },
  verifySpoofedClusterContext: () => invokeAllowed("secure-pilot:query-resource", {
    tabId: "pilot-tab-dev",
    clusterId: "cluster-prod-99",
    namespace: "default",
    kind: "Pod",
    name: "api",
  }),
});

contextBridge.exposeInMainWorld("lensSecurePilotBridge", securePilotBridge);
