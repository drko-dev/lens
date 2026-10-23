/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { DeploymentLike, ReplicaSetLike } from "./revisions";
import { buildDeploymentRevisionHistory } from "./revisions";

const deployment = (overrides: Partial<DeploymentLike> = {}): DeploymentLike => ({
  kind: "Deployment",
  apiVersion: "apps/v1",
  metadata: {
    name: "web",
    namespace: "default",
    uid: "deployment-uid",
    resourceVersion: "100",
    generation: 4,
    annotations: {
      "deployment.kubernetes.io/revision": "3",
    },
  },
  spec: {
    replicas: 3,
    revisionHistoryLimit: 5,
    template: {
      metadata: { labels: { app: "web" }},
      spec: { containers: [{ name: "web", image: "nginx:1.27" }] },
    },
  },
  ...overrides,
});

const replicaSet = (
  revision: number | string | undefined,
  name: string,
  overrides: Partial<ReplicaSetLike> = {},
): ReplicaSetLike => ({
  kind: "ReplicaSet",
  apiVersion: "apps/v1",
  metadata: {
    name,
    namespace: "default",
    uid: `uid-${name}`,
    creationTimestamp: "2026-10-20T10:00:00Z",
    annotations: revision === undefined
      ? {}
      : { "deployment.kubernetes.io/revision": String(revision) },
    ownerReferences: [{
      apiVersion: "apps/v1",
      kind: "Deployment",
      name: "web",
      uid: "deployment-uid",
      controller: true,
    }],
  },
  spec: {
    replicas: 0,
    template: {
      metadata: { labels: { app: "web", "pod-template-hash": `${name}-hash` }},
      spec: { containers: [{ name: "web", image: `nginx:${revision ?? "unknown"}` }] },
    },
  },
  status: { replicas: 0, readyReplicas: 0, availableReplicas: 0 },
  ...overrides,
});

describe("buildDeploymentRevisionHistory", () => {
  it("identifies the current revision from the Deployment annotation", () => {
    const result = buildDeploymentRevisionHistory(deployment(), [
      replicaSet(1, "web-1"),
      replicaSet(2, "web-2"),
      replicaSet(3, "web-3"),
    ]);

    expect(result.currentRevision).toBe(3);
    expect(result.currentRevisionSource).toBe("annotation");
    expect(result.revisions.map(entry => entry.revision)).toEqual([3, 2, 1]);
    expect(result.revisions[0].availability).toBe("current");
    expect(result.revisions[1].availability).toBe("historical");
    expect(result.historyIncomplete).toBe(false);
  });

  it("sorts valid revisions numerically and keeps dates from metadata only", () => {
    const result = buildDeploymentRevisionHistory(deployment(), [
      replicaSet(10, "web-10", { metadata: { ...replicaSet(10, "web-10").metadata, creationTimestamp: "2026-10-22T00:00:00Z" }}),
      replicaSet(9, "web-9", { metadata: { ...replicaSet(9, "web-9").metadata, creationTimestamp: "2026-10-21T00:00:00Z" }}),
    ]);

    expect(result.revisions.map(entry => entry.revision)).toEqual([10, 9]);
    expect(result.revisions[0].createdAt).toBe("2026-10-22T00:00:00Z");
    expect(result.revisions[1].createdAt).toBe("2026-10-21T00:00:00Z");
  });

  it("excludes orphan ReplicaSets", () => {
    const orphan = replicaSet(1, "orphan");

    orphan.metadata.ownerReferences = [];

    const result = buildDeploymentRevisionHistory(deployment(), [replicaSet(3, "web-3"), orphan]);

    expect(result.orphanReplicaSets).toBe(1);
    expect(result.revisions.map(entry => entry.name)).toEqual(["web-3"]);
  });

  it("excludes ReplicaSets owned by another UID, even with a matching name", () => {
    const foreign = replicaSet(3, "web-foreign");

    foreign.metadata.ownerReferences = [{
      apiVersion: "apps/v1",
      kind: "Deployment",
      name: "web",
      uid: "another-deployment",
      controller: true,
    }];

    const result = buildDeploymentRevisionHistory(deployment(), [foreign]);

    expect(result.foreignReplicaSets).toBe(1);
    expect(result.revisions).toHaveLength(0);
  });

  it("excludes ReplicaSets in another namespace", () => {
    const foreign = replicaSet(3, "web-other-ns");

    foreign.metadata.namespace = "other";

    const result = buildDeploymentRevisionHistory(deployment(), [foreign]);

    expect(result.foreignReplicaSets).toBe(1);
    expect(result.revisions).toHaveLength(0);
  });

  it("detects duplicate revision numbers and disables both entries", () => {
    const result = buildDeploymentRevisionHistory(deployment(), [
      replicaSet(3, "web-3a"),
      replicaSet(3, "web-3b"),
      replicaSet(2, "web-2"),
    ]);

    expect(result.duplicateRevisions).toEqual([3]);
    const duplicates = result.revisions.filter(entry => entry.duplicate);

    expect(duplicates).toHaveLength(2);
    expect(duplicates.every(entry => !entry.valid)).toBe(true);
  });

  it("detects missing revisions caused by the history limit", () => {
    const result = buildDeploymentRevisionHistory(deployment(), [
      replicaSet(5, "web-5"),
      replicaSet(3, "web-3"),
    ]);

    expect(result.missingRevisions).toEqual([4]);
    expect(result.historyIncomplete).toBe(true);
  });

  it("flags an expired history when the oldest retained revision is above one", () => {
    const result = buildDeploymentRevisionHistory(deployment(), [
      replicaSet(7, "web-7"),
      replicaSet(6, "web-6"),
    ]);

    expect(result.missingRevisions).toEqual([]);
    expect(result.historyIncomplete).toBe(true);
    expect(result.revisionHistoryLimit).toBe(5);
    expect(result.revisionHistoryLimitIsDefault).toBe(false);
  });

  it("reports invalid revision annotations and missing templates", () => {
    const invalidRevision = replicaSet("not-a-number", "web-invalid");
    const missingTemplate = replicaSet(2, "web-no-template");

    missingTemplate.spec = { replicas: 0 };

    const result = buildDeploymentRevisionHistory(deployment(), [invalidRevision, missingTemplate]);

    expect(result.invalidReplicaSets).toBe(2);
    expect(result.revisions.every(entry => !entry.valid)).toBe(true);
  });

  it("fails closed when the Deployment has no UID", () => {
    const noUid = deployment();

    delete noUid.metadata.uid;

    const result = buildDeploymentRevisionHistory(noUid, [replicaSet(3, "web-3")]);

    expect(result.fatalReason).toContain("UID");
    expect(result.revisions).toHaveLength(0);
  });

  it("does not invent a change cause", () => {
    const plain = replicaSet(3, "web-3");
    const withCause = replicaSet(2, "web-2");

    withCause.metadata.annotations = {
      ...withCause.metadata.annotations,
      "kubernetes.io/change-cause": "  deploy 1.27  ",
    };

    const result = buildDeploymentRevisionHistory(deployment(), [plain, withCause]);

    expect(result.revisions.find(entry => entry.name === "web-3")?.changeCause).toBeUndefined();
    expect(result.revisions.find(entry => entry.name === "web-2")?.changeCause).toBe("deploy 1.27");
  });

  it("collects app and init container images", () => {
    const withInit = replicaSet(3, "web-3");

    if (!withInit.spec) {
      throw new Error("ReplicaSet fixture must include a spec.");
    }

    withInit.spec.template = {
      spec: {
        containers: [{ name: "web", image: "nginx:1.27" }],
        initContainers: [{ name: "setup", image: "busybox:1.36" }],
      },
    };

    const result = buildDeploymentRevisionHistory(deployment(), [withInit]);

    expect(result.revisions[0].images).toEqual([
      { container: "web", image: "nginx:1.27", init: false },
      { container: "setup", image: "busybox:1.36", init: true },
    ]);
  });

  it("infers the current revision when the annotation is absent", () => {
    const noAnnotation = deployment();

    delete noAnnotation.metadata.annotations;

    const result = buildDeploymentRevisionHistory(noAnnotation, [
      replicaSet(1, "web-1"),
      replicaSet(2, "web-2"),
    ]);

    expect(result.currentRevision).toBe(2);
    expect(result.currentRevisionSource).toBe("inferred");
  });
});
