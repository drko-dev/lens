"use strict";

const { createHash } = require("node:crypto");
const path = require("node:path");

const DEDICATED_KUBECONFIG = "/Users/gustavomarcon/.config/openlens-r8r9-test/openlens-qa.kubeconfig";
const DEDICATED_CONTEXT = "openlens-r8r9-qemu";
const DEDICATED_ENDPOINT = "https://localhost:50997";

function classifyVisualPreflight({ appAsarSha256, expectedSha256, arm64 }) {
  return arm64 && /^[a-f0-9]{64}$/i.test(appAsarSha256 ?? "") && appAsarSha256 === expectedSha256
    ? { status: "READY" }
    : { status: "BLOCKED", reason: "candidate-identity-or-architecture-mismatch" };
}

function classifyIntegrationPreflight({ kubeconfigPath, contextName, apiServer, contextCount, readyz, hasWritePermissions }) {
  const reasons = [];

  if (kubeconfigPath !== DEDICATED_KUBECONFIG) reasons.push("unexpected-kubeconfig");
  if (contextName !== DEDICATED_CONTEXT) reasons.push("unexpected-context");
  if (apiServer !== DEDICATED_ENDPOINT) reasons.push("unexpected-endpoint");
  if (contextCount !== 1) reasons.push("unexpected-context-count");
  if (readyz !== "ok") reasons.push("endpoint-unavailable");
  if (hasWritePermissions === true) reasons.push("write-permissions-present");
  if (hasWritePermissions !== true && hasWritePermissions !== false) reasons.push("permissions-unverified");

  return { status: reasons.length ? "BLOCKED" : "READY", reasons };
}

function clusterFixtureId(kubeconfigPath, contextName) {
  if (!path.isAbsolute(kubeconfigPath) || !contextName) throw new Error("Fixture cluster identity requires an absolute config path and context name");

  return createHash("md5").update(`${kubeconfigPath}:${contextName}`).digest("hex");
}

function createClusterFixture(contexts) {
  if (!Array.isArray(contexts) || contexts.length < 2) throw new Error("UI-04 fixture requires at least two contexts");
  const names = contexts.map(({ name }) => name);
  const endpoints = contexts.map(({ endpoint }) => {
    const url = new URL(endpoint);

    if (url.protocol !== "http:" || !["127.0.0.1", "::1"].includes(url.hostname)) {
      throw new Error("Fixture Kubernetes endpoints must use loopback HTTP");
    }

    return url.origin;
  });

  if (new Set(names).size !== names.length || new Set(endpoints).size !== endpoints.length) {
    throw new Error("Fixture contexts and API endpoints must be unique");
  }

  return {
    apiVersion: "v1",
    kind: "Config",
    preferences: {},
    clusters: contexts.map(({ name, endpoint }) => ({
      name,
      cluster: { server: endpoint, "insecure-skip-tls-verify": true },
    })),
    contexts: contexts.map(({ name }) => ({
      name,
      context: { cluster: name, namespace: "default" },
    })),
    "current-context": contexts[0].name,
    users: [],
  };
}

function hotbarClusterPin(uid, name) {
  return { entity: { uid, name, source: "local", shortName: name.slice(0, 2).toUpperCase() } };
}

module.exports = {
  classifyIntegrationPreflight,
  classifyVisualPreflight,
  clusterFixtureId,
  createClusterFixture,
  hotbarClusterPin,
};
