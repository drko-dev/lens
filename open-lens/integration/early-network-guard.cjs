/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

const net = require("node:net");
const tls = require("node:tls");

globalThis.__NETWORK_AUDIT_LOG__ = globalThis.__NETWORK_AUDIT_LOG__ || [];
globalThis.__BLOCKED_REQUESTS_LOG__ = globalThis.__BLOCKED_REQUESTS_LOG__ || [];

const isLoopbackOrInternalHost = (host) => {
  if (!host || typeof host !== "string") return true;
  const h = host.toLowerCase().trim();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "0.0.0.0" ||
    h === "lens.app" ||
    h.endsWith(".lens.app")
  );
};

// 1. Node.js low-level socket interception (Main Process & Node Workers)
const originalSocketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let host = "127.0.0.1";
  let port = 0;

  if (typeof args[0] === "object" && args[0] !== null) {
    host = args[0].host || args[0].hostname || "127.0.0.1";
    port = args[0].port;
    if (args[0].path) {
      // Unix domain socket (IPC) - permitted
      return originalSocketConnect.apply(this, args);
    }
  } else if (typeof args[0] === "number") {
    port = args[0];
    if (typeof args[1] === "string") {
      host = args[1];
    }
  } else if (typeof args[0] === "string" && isNaN(Number(args[0]))) {
    // Path to domain socket - permitted
    return originalSocketConnect.apply(this, args);
  }

  if (!isLoopbackOrInternalHost(host)) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: "net.Socket.connect",
      target: `${host}:${port}`,
      status: "BLOCKED_BY_POLICY",
      reason: "EXTERNAL_HOST_DISALLOWED",
    };
    globalThis.__BLOCKED_REQUESTS_LOG__.push(entry);
    globalThis.__NETWORK_AUDIT_LOG__.push(entry);
    const err = new Error(`NETWORK_POLICY_BLOCKED: Outgoing connection to external address '${host}:${port}' is forbidden.`);
    err.code = "ERR_NETWORK_POLICY_BLOCKED";
    process.nextTick(() => {
      this.destroy(err);
    });
    return this;
  }

  return originalSocketConnect.apply(this, args);
};

// 2. Electron Session interception (Chromium Network Layer)
try {
  const electron = require("electron");
  const app = electron.app;
  const session = electron.session;

  const installSessionGuard = (ses) => {
    if (!ses || !ses.webRequest || ses.__networkGuardInstalled) return;
    ses.__networkGuardInstalled = true;

    ses.webRequest.onBeforeRequest((details, callback) => {
      const urlStr = details.url;
      let isAllowed = false;

      try {
        const parsed = new URL(urlStr);
        const protocol = parsed.protocol;
        const host = parsed.hostname;

        if (
          protocol === "file:" ||
          protocol === "devtools:" ||
          protocol === "data:" ||
          protocol === "chrome-extension:"
        ) {
          isAllowed = true;
        } else if (protocol === "http:" || protocol === "https:") {
          if (isLoopbackOrInternalHost(host)) {
            isAllowed = true;
          }
        }
      } catch {
        isAllowed = false;
      }

      if (isAllowed) {
        globalThis.__NETWORK_AUDIT_LOG__.push({
          timestamp: new Date().toISOString(),
          url: urlStr,
          status: "ALLOWED_INTERNAL",
        });
        callback({});
      } else {
        const entry = {
          timestamp: new Date().toISOString(),
          url: urlStr,
          status: "BLOCKED_BY_POLICY",
          reason: "UNAUTHORIZED_EXTERNAL_NETWORK_TARGET",
          method: details.method,
        };
        globalThis.__BLOCKED_REQUESTS_LOG__.push(entry);
        globalThis.__NETWORK_AUDIT_LOG__.push(entry);
        callback({ cancel: true });
      }
    });
  };

  if (app) {
    app.on("session-created", (ses) => {
      installSessionGuard(ses);
    });
    if (session && session.defaultSession) {
      installSessionGuard(session.defaultSession);
    }
    app.whenReady?.().then(() => {
      if (session && session.defaultSession) {
        installSessionGuard(session.defaultSession);
      }
    });
  }
} catch {
  // Ignore in non-Electron Node sub-processes
}
