/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

const net = require("node:net");
const tls = require("node:tls");

globalThis.__NETWORK_AUDIT_LOG__ = globalThis.__NETWORK_AUDIT_LOG__ || [];
globalThis.__BLOCKED_REQUESTS_LOG__ = globalThis.__BLOCKED_REQUESTS_LOG__ || [];

/**
 * Strict validator for allowed loopback IPs and internal Lens hostnames.
 * Prevents DNS rebinding, external IP routing, and loose suffix matches.
 */
function isAllowedLoopbackOrInternalHost(host) {
  if (!host || typeof host !== "string") return false;
  const h = host.toLowerCase().trim();

  // 1. Loopback IPv4: Strictly 127.0.0.0/8 block
  if (net.isIPv4(h)) {
    return h.startsWith("127.");
  }

  // 2. Loopback IPv6: Strictly ::1 or IPv4-mapped loopback
  if (net.isIPv6(h)) {
    return (
      h === "::1" ||
      h === "0:0:0:0:0:0:0:1" ||
      h === "::ffff:127.0.0.1" ||
      h.startsWith("::ffff:127.")
    );
  }

  // 3. Exact localhost
  if (h === "localhost") return true;

  // 4. Exact internal app domain
  if (h === "lens.app") return true;

  // 5. Valid internal cluster host: <cluster-id>.lens.app
  // Single-label cluster identifier; rejects fake suffixes, trailing dots, or external sub-paths
  if (/^[a-z0-9][a-z0-9_-]*\.lens\.app$/i.test(h)) {
    return true;
  }

  return false;
}

/**
 * Resolves verified internal hostnames strictly to loopback IP (127.0.0.1).
 * Completely eliminates OS external DNS queries and DNS rebinding attacks.
 */
function strictLoopbackLookup(hostname, opts, cb) {
  if (typeof opts === "function") {
    cb = opts;
    opts = {};
  }
  if (!isAllowedLoopbackOrInternalHost(hostname)) {
    const err = new Error(`NETWORK_POLICY_BLOCKED: DNS resolution for external host '${hostname}' is forbidden.`);
    err.code = "ERR_NETWORK_POLICY_BLOCKED";
    return process.nextTick(() => cb(err));
  }
  return process.nextTick(() => cb(null, "127.0.0.1", 4));
}

// ---------------------------------------------------------------------------
// 1. Node.js low-level TCP socket interception (net.Socket.prototype.connect)
// ---------------------------------------------------------------------------
const originalSocketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let effectiveArgs = args;
  if (Array.isArray(args[0]) && args.length === 1) {
    effectiveArgs = args[0];
  }

  let host = "127.0.0.1";
  let port = 0;
  let isOptionsObj = false;
  let opts = null;

  if (typeof effectiveArgs[0] === "object" && effectiveArgs[0] !== null) {
    opts = effectiveArgs[0];
    isOptionsObj = true;
    host = opts.host || opts.hostname || "127.0.0.1";
    port = opts.port || 0;
    if (opts.path) {
      // Unix domain socket (IPC) - permitted
      return originalSocketConnect.apply(this, args);
    }
  } else if (typeof effectiveArgs[0] === "number") {
    port = effectiveArgs[0];
    if (typeof effectiveArgs[1] === "string") {
      host = effectiveArgs[1];
    }
  } else if (typeof effectiveArgs[0] === "string" && isNaN(Number(effectiveArgs[0]))) {
    // Path to domain socket - permitted
    return originalSocketConnect.apply(this, args);
  }

  const isAllowed = isAllowedLoopbackOrInternalHost(host);

  if (!isAllowed) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: "net.Socket.connect",
      target: `${host}:${port}`,
      status: "BLOCKED_BY_POLICY",
      reason: "EXTERNAL_HOST_OR_IP_DISALLOWED",
    };
    globalThis.__BLOCKED_REQUESTS_LOG__.push(entry);
    globalThis.__NETWORK_AUDIT_LOG__.push(entry);
    const err = new Error(`NETWORK_POLICY_BLOCKED: Outgoing socket connection to external address '${host}:${port}' is forbidden.`);
    err.code = "ERR_NETWORK_POLICY_BLOCKED";
    process.nextTick(() => {
      this.destroy(err);
    });
    return this;
  }

  // Enforce loopback lookup for all allowed internal hostnames to prevent external DNS resolution
  if (isOptionsObj && opts) {
    opts.lookup = strictLoopbackLookup;
  }

  return originalSocketConnect.apply(this, args);
};

// ---------------------------------------------------------------------------
// 2. Node.js TLS socket interception (tls.connect)
// ---------------------------------------------------------------------------
const originalTlsConnect = tls.connect;
tls.connect = function (...args) {
  let effectiveArgs = args;
  if (Array.isArray(args[0]) && args.length === 1) {
    effectiveArgs = args[0];
  }

  let host = "127.0.0.1";
  let port = 0;
  let opts = null;

  if (typeof effectiveArgs[0] === "object" && effectiveArgs[0] !== null) {
    opts = effectiveArgs[0];
    host = opts.host || opts.hostname || opts.servername || "127.0.0.1";
    port = opts.port || 0;
  } else if (typeof effectiveArgs[0] === "number") {
    port = effectiveArgs[0];
    if (typeof effectiveArgs[1] === "string") {
      host = effectiveArgs[1];
    } else if (typeof effectiveArgs[1] === "object" && effectiveArgs[1] !== null) {
      opts = effectiveArgs[1];
      host = opts.host || opts.hostname || opts.servername || "127.0.0.1";
    }
  }

  if (!isAllowedLoopbackOrInternalHost(host)) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: "tls.connect",
      target: `${host}:${port}`,
      status: "BLOCKED_BY_POLICY",
      reason: "EXTERNAL_TLS_TARGET_DISALLOWED",
    };
    globalThis.__BLOCKED_REQUESTS_LOG__.push(entry);
    globalThis.__NETWORK_AUDIT_LOG__.push(entry);
    const err = new Error(`NETWORK_POLICY_BLOCKED: Outgoing TLS connection to external address '${host}:${port}' is forbidden.`);
    err.code = "ERR_NETWORK_POLICY_BLOCKED";
    const dummySocket = new net.Socket();
    process.nextTick(() => {
      dummySocket.destroy(err);
    });
    return dummySocket;
  }

  if (opts) {
    opts.lookup = strictLoopbackLookup;
  }

  return originalTlsConnect.apply(this, args);
};

// ---------------------------------------------------------------------------
// 3. Electron Session interception (Chromium Network Layer)
// Non-overwriting security interceptor with request wrapping.
// ---------------------------------------------------------------------------
try {
  const electron = require("electron");
  const app = electron.app;
  const session = electron.session;

  const installSessionGuard = (ses) => {
    if (!ses || !ses.webRequest || ses.__networkGuardInstalled) return;
    ses.__networkGuardInstalled = true;

    const originalOnBeforeRequest = ses.webRequest.onBeforeRequest.bind(ses.webRequest);
    let chainedUserHandler = null;

    const masterSecurityFilter = (details, callback) => {
      const urlStr = details.url;
      let isAllowed = false;
      let reason = "UNAUTHORIZED_EXTERNAL_NETWORK_TARGET";

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
          if (isAllowedLoopbackOrInternalHost(host)) {
            isAllowed = true;
          } else {
            reason = "EXTERNAL_HOST_DISALLOWED";
          }
        } else {
          reason = `FORBIDDEN_PROTOCOL_${protocol.toUpperCase()}`;
        }
      } catch {
        isAllowed = false;
        reason = "INVALID_URL";
      }

      if (isAllowed) {
        globalThis.__NETWORK_AUDIT_LOG__.push({
          timestamp: new Date().toISOString(),
          url: urlStr,
          status: "ALLOWED_INTERNAL",
        });
        if (chainedUserHandler) {
          chainedUserHandler(details, callback);
        } else {
          callback({});
        }
      } else {
        const entry = {
          timestamp: new Date().toISOString(),
          url: urlStr,
          status: "BLOCKED_BY_POLICY",
          reason,
          method: details.method,
        };
        globalThis.__BLOCKED_REQUESTS_LOG__.push(entry);
        globalThis.__NETWORK_AUDIT_LOG__.push(entry);
        callback({ cancel: true });
      }
    };

    // Install initial listener
    originalOnBeforeRequest(masterSecurityFilter);

    // Prevent subsequent callers from overwriting the security policy
    ses.webRequest.onBeforeRequest = function (filterOrListener, maybeListener) {
      if (typeof filterOrListener === "function") {
        chainedUserHandler = filterOrListener;
      } else if (typeof maybeListener === "function") {
        chainedUserHandler = maybeListener;
      }
      originalOnBeforeRequest(masterSecurityFilter);
    };
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

module.exports = {
  isAllowedLoopbackOrInternalHost,
  strictLoopbackLookup,
};
