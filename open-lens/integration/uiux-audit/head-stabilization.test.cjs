const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createClusterFixture,
  clusterFixtureId,
  classifyIntegrationPreflight,
  classifyVisualPreflight,
  hotbarClusterPin,
} = require("./head-stabilization.cjs");

const dedicatedConfig = "/Users/gustavomarcon/.config/openlens-r8r9-test/openlens-qa.kubeconfig";

test("visual QA is independent of unavailable Kubernetes credentials", () => {
  assert.deepEqual(classifyVisualPreflight({
    appAsarSha256: "a".repeat(64),
    expectedSha256: "a".repeat(64),
    arm64: true,
  }), { status: "READY" });
});

test("the obsolete R10 context and endpoint block only integration QA", () => {
  const integration = classifyIntegrationPreflight({
    kubeconfigPath: dedicatedConfig,
    contextName: "qa",
    apiServer: "https://localhost:49546",
    contextCount: 1,
    readyz: "ok",
    hasWritePermissions: false,
  });

  assert.equal(integration.status, "BLOCKED");
  assert.ok(integration.reasons.includes("unexpected-context"));
  assert.ok(integration.reasons.includes("unexpected-endpoint"));
});

test("an unavailable dedicated QEMU endpoint blocks integration only", () => {
  const integration = classifyIntegrationPreflight({
    kubeconfigPath: dedicatedConfig,
    contextName: "openlens-r8r9-qemu",
    apiServer: "https://localhost:50997",
    contextCount: 1,
    readyz: null,
    hasWritePermissions: false,
  });

  assert.equal(integration.status, "BLOCKED");
  assert.ok(integration.reasons.includes("endpoint-unavailable"));
  assert.deepEqual(classifyVisualPreflight({
    appAsarSha256: "b".repeat(64),
    expectedSha256: "b".repeat(64),
    arm64: true,
  }), { status: "READY" });
});

test("integration is blocked when kubeconfig grants write access", () => {
  const integration = classifyIntegrationPreflight({
    kubeconfigPath: dedicatedConfig,
    contextName: "openlens-r8r9-qemu",
    apiServer: "https://localhost:50997",
    contextCount: 1,
    readyz: "ok",
    hasWritePermissions: true,
  });

  assert.equal(integration.status, "BLOCKED");
  assert.ok(integration.reasons.includes("write-permissions-present"));
});

test("only the dedicated QEMU configuration passes integration preflight", () => {
  assert.deepEqual(classifyIntegrationPreflight({
    kubeconfigPath: dedicatedConfig,
    contextName: "openlens-r8r9-qemu",
    apiServer: "https://localhost:50997",
    contextCount: 1,
    readyz: "ok",
    hasWritePermissions: false,
  }), { status: "READY", reasons: [] });
});

test("isolated fixture contexts have deterministic independent catalog IDs and no credentials", () => {
  const filePath = "/tmp/openlens-ui04/home/.kube/config";
  const clusters = [
    { name: "ui04-prod", endpoint: "http://127.0.0.1:43101" },
    { name: "ui04-qa", endpoint: "http://127.0.0.1:43102" },
  ];
  const kubeconfig = createClusterFixture(clusters);
  const firstId = clusterFixtureId(filePath, clusters[0].name);
  const secondId = clusterFixtureId(filePath, clusters[1].name);

  assert.notEqual(firstId, secondId);
  assert.equal(kubeconfig.users.length, 0);
  assert.deepEqual(kubeconfig.contexts.map(({ name }) => name), clusters.map(({ name }) => name));
  assert.deepEqual(kubeconfig.clusters.map(({ cluster }) => cluster.server), clusters.map(({ endpoint }) => endpoint));
  assert.deepEqual(hotbarClusterPin(firstId, clusters[0].name), {
    entity: { uid: firstId, name: clusters[0].name, source: "local", shortName: "UI" },
  });
});

test("fixture kubeconfigs refuse endpoints outside loopback", () => {
  assert.throws(() => createClusterFixture([
    { name: "ui04-one", endpoint: "http://127.0.0.1:43101" },
    { name: "ui04-two", endpoint: "https://example.invalid" },
  ]), /loopback HTTP/);
});
