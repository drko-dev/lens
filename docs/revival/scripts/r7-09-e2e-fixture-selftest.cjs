/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

const assert = require("node:assert/strict");
const { createLocalApiFixture } = require("./verify-r4-03-persistence.cjs");

async function run() {
  const fixture = await createLocalApiFixture({
    name: "r7-09-fixture-selfcheck",
    alias: "Synthetic DEV",
    environment: "development",
    color: "#10B981",
    isProd: false,
  });

  try {
    const version = await fetch(`${fixture.endpoint}/version`);

    assert.equal(version.status, 200);
    assert.equal((await version.json()).gitVersion, "v1.31.0");

    const accessReview = await fetch(
      `${fixture.endpoint}/apis/authorization.k8s.io/v1/selfsubjectaccessreviews`,
      { method: "POST", body: "{}" },
    );

    assert.equal(accessReview.status, 200);

    const mutation = await fetch(`${fixture.endpoint}/api/v1/nodes/example`, {
      method: "PATCH",
      body: "{}",
    });

    assert.equal(mutation.status, 405);
    assert.equal(fixture.rejectedWrites.length, 1);
    assert.equal(fixture.rejectedWrites[0].method, "PATCH");

    console.log(JSON.stringify({
      node: process.version,
      syntheticVersionStatus: version.status,
      accessReviewStatus: accessReview.status,
      mutationStatus: mutation.status,
      rejectedMutationCount: fixture.rejectedWrites.length,
      result: "PASS",
    }));
  } finally {
    await fixture.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
