/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

(function () {
  const bridge = window.lensSecurePilotBridge;
  const get = id => document.getElementById(id);
  const securityOutput = get("security-test-output");

  const nodeIsUnavailable = typeof window.require === "undefined" &&
    typeof window.process === "undefined" &&
    typeof window.Buffer === "undefined";
  get("lbl-node-status").textContent = nodeIsUnavailable ? "Node globals are unavailable" : "UNSAFE: Node global found";
  get("lbl-process-status").textContent = typeof window.process === "undefined" ? "process is unavailable" : "UNSAFE: process found";
  get("lbl-buffer-status").textContent = typeof window.Buffer === "undefined" ? "Buffer is unavailable" : "UNSAFE: Buffer found";
  get("lbl-bridge-status").textContent = bridge ? "Narrow typed bridge exposed" : "MISSING";

  if (bridge) {
    bridge.getPilotInfo().then(info => {
      get("lbl-packaged-status").textContent = info.isPackaged ? "Verified packaged application" : "Development runtime";
    }).catch(() => {
      get("lbl-packaged-status").textContent = "Unavailable";
    });
  }

  function showSecurityResult(passed, message) {
    securityOutput.style.display = "block";
    securityOutput.className = passed ? "alert-success" : "alert-error";
    securityOutput.textContent = message;
  }

  async function queryTab(tabId, resultId) {
    const result = get(resultId);
    result.textContent = "Querying synthetic fixture...";

    try {
      const response = await bridge.queryClusterResource(tabId, "default", "Pod", "api");
      result.textContent = JSON.stringify(response, null, 2);
    } catch {
      result.textContent = "Request rejected by the isolated main-process policy.";
    }
  }

  get("btn-query-dev").addEventListener("click", () => queryTab("pilot-tab-dev", "dev-result"));
  get("btn-query-prod").addEventListener("click", () => queryTab("pilot-tab-prod", "prod-result"));

  get("btn-test-node").addEventListener("click", () => {
    showSecurityResult(nodeIsUnavailable, nodeIsUnavailable
      ? "PASS: Node.js globals are inaccessible from the isolated renderer."
      : "FAIL: Node.js globals were detected in the renderer.");
  });

  get("btn-test-unauthorized-ipc").addEventListener("click", () => {
    const genericIpcIsHidden = !["invoke", "send", "ipcRenderer", "rawIpc"].some(key => key in bridge);
    showSecurityResult(genericIpcIsHidden,
      genericIpcIsHidden ? "PASS: The renderer has no generic IPC or channel-selection API." : "FAIL: A generic IPC capability is exposed.");
  });

  get("btn-test-spoofing").addEventListener("click", async () => {
    try {
      await bridge.verifySpoofedClusterContext();
      showSecurityResult(false, "FAIL: A forged clusterId was accepted.");
    } catch {
      showSecurityResult(true, "PASS: Main-process validation rejected a forged clusterId on a fixed tab context.");
    }
  });
})();
