/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Deployment, ReplicaSet } from "@openlens/kube-object";
import type { DeploymentRevision } from "./revisions";
import { buildDeploymentRevisionHistory } from "./revisions";
import { applyRollbackPatch, prepareRollback } from "./prepare-rollback";

const makeDeployment = (overrides: {
  paused?: boolean;
  templateImage?: string;
  uid?: string;
  resourceVersion?: string;
  generation?: number;
  observedGeneration?: number;
  updatedReplicas?: number;
} = {}) => new Deployment({
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: {
    name: "web",
    namespace: "default",
    uid: overrides.uid ?? "deployment-uid",
    resourceVersion: overrides.resourceVersion ?? "100",
    generation: overrides.generation ?? 2,
    annotations: { "deployment.kubernetes.io/revision": "2" },
    selfLink: "/apis/apps/v1/namespaces/default/deployments/web",
  },
  spec: {
    replicas: 3,
    paused: overrides.paused,
    selector: { matchLabels: { app: "web" }},
    template: {
      metadata: { labels: { app: "web" }},
      spec: {
        containers: [{
          name: "web",
          image: overrides.templateImage ?? "nginx:1.29",
        }],
      },
    },
  },
  status: {
    observedGeneration: overrides.observedGeneration ?? 2,
    updatedReplicas: overrides.updatedReplicas ?? 3,
    readyReplicas: 3,
    availableReplicas: 3,
    replicas: 3,
    unavailableReplicas: 0,
  },
} as never);

const makeReplicaSet = (revision: number, options: {
  name?: string;
  uid?: string;
  ownerUid?: string;
  ownerKind?: string;
  ownerName?: string;
  controller?: boolean;
  namespace?: string;
  image?: string;
  template?: unknown;
} = {}) => new ReplicaSet({
  apiVersion: "apps/v1",
  kind: "ReplicaSet",
  metadata: {
    name: options.name ?? `web-${revision}`,
    namespace: options.namespace ?? "default",
    uid: options.uid ?? `rs-${revision}`,
    resourceVersion: "10",
    selfLink: `/apis/apps/v1/namespaces/default/replicasets/${options.name ?? `web-${revision}`}`,
    creationTimestamp: "2024-01-01T00:00:00Z",
    annotations: { "deployment.kubernetes.io/revision": `${revision}` },
    labels: { "pod-template-hash": `${revision}` },
    ownerReferences: [{
      apiVersion: "apps/v1",
      kind: options.ownerKind ?? "Deployment",
      name: options.ownerName ?? "web",
      uid: options.ownerUid ?? "deployment-uid",
      controller: options.controller ?? true,
    }],
  },
  spec: {
    replicas: 3,
    selector: { matchLabels: { app: "web" }},
    template: options.template ?? {
      metadata: { labels: { app: "web" }},
      spec: {
        containers: [{
          name: "web",
          image: options.image ?? "nginx:1.27",
        }],
      },
    },
  },
} as never);

const revisionFor = (deployment: Deployment, replicaSet: ReplicaSet): DeploymentRevision => {
  const history = buildDeploymentRevisionHistory(deployment as never, [replicaSet as never]);
  const revision = history.revisions[0];

  if (!revision) {
    throw new Error("No revision built");
  }

  return revision;
};

const fakeDeps = (deployment: Deployment | null, replicaSet: ReplicaSet | null) => ({
  deploymentApi: { get: jest.fn(async () => deployment) },
  replicaSetApi: { get: jest.fn(async () => replicaSet) },
});

describe("prepareRollback", () => {
  it("builds a JSON Patch with UID and resourceVersion preconditions", async () => {
    const deployment = makeDeployment();
    const replicaSet = makeReplicaSet(1);
    const revision = revisionFor(deployment, replicaSet);
    const result = await prepareRollback({ deployment, revision }, fakeDeps(deployment, replicaSet));

    expect(result.status).toBe("ready");

    if (result.status !== "ready") {
      return;
    }

    expect(result.preparation.plan.patch.slice(0, 2)).toEqual([
      { op: "test", path: "/metadata/uid", value: "deployment-uid" },
      { op: "test", path: "/metadata/resourceVersion", value: "100" },
    ]);
    expect(result.preparation.plan.patch).toContainEqual({
      op: "replace",
      path: "/spec/template/spec/containers",
      value: [{ name: "web", image: "nginx:1.27" }],
    });
    expect(result.preparation.changes).toContain("images");
    expect(result.preparation.sameTemplate).toBe(false);
    expect(result.preparation.fromRevision).toBe(2);
    expect(result.preparation.toRevision).toBe(1);
  });

  it("reports a no-op when the target template matches the current one", async () => {
    const deployment = makeDeployment({ templateImage: "nginx:1.27" });
    const replicaSet = makeReplicaSet(1);
    const revision = revisionFor(deployment, replicaSet);
    const result = await prepareRollback({ deployment, revision }, fakeDeps(deployment, replicaSet));

    expect(result.status).toBe("ready");

    if (result.status === "ready") {
      expect(result.preparation.sameTemplate).toBe(true);
      expect(result.preparation.plan.templateOperations).toEqual([]);
    }
  });

  it("refuses to roll back a paused Deployment", async () => {
    const deployment = makeDeployment({ paused: true });
    const replicaSet = makeReplicaSet(1);
    const revision = revisionFor(deployment, replicaSet);
    const result = await prepareRollback({ deployment, revision }, fakeDeps(deployment, replicaSet));

    expect(result).toEqual({
      status: "error",
      error: { kind: "paused", message: expect.stringContaining("paused") },
    });
  });

  it("refuses when the ReplicaSet was pruned", async () => {
    const deployment = makeDeployment();
    const replicaSet = makeReplicaSet(1);
    const revision = revisionFor(deployment, replicaSet);
    const result = await prepareRollback({ deployment, revision }, fakeDeps(deployment, null));

    expect(result).toEqual({
      status: "error",
      error: { kind: "pruned", message: expect.stringContaining("no longer exists") },
    });
  });

  it("refuses when the selected Deployment was replaced with the same name", async () => {
    const selectedDeployment = makeDeployment();
    const replicaSet = makeReplicaSet(1);
    const revision = revisionFor(selectedDeployment, replicaSet);
    const deps = fakeDeps(makeDeployment({ uid: "replacement-deployment-uid" }), replicaSet);
    const result = await prepareRollback({ deployment: selectedDeployment, revision }, deps);

    expect(result).toEqual({
      status: "error",
      error: { kind: "deployment-replaced", message: expect.stringContaining("identity changed") },
    });
    expect(deps.replicaSetApi.get).not.toHaveBeenCalled();
  });

  it("refuses when a ReplicaSet was recreated under the selected name", async () => {
    const deployment = makeDeployment();
    const selectedReplicaSet = makeReplicaSet(1);
    const revision = revisionFor(deployment, selectedReplicaSet);
    const recreatedReplicaSet = makeReplicaSet(1, { uid: "new-replicaset-uid" });
    const result = await prepareRollback({ deployment, revision }, fakeDeps(deployment, recreatedReplicaSet));

    expect(result).toEqual({
      status: "error",
      error: { kind: "revision-replaced", message: expect.stringContaining("replaced") },
    });
  });

  it("refuses a fresh ReplicaSet with a foreign namespace or non-controller owner reference", async () => {
    const deployment = makeDeployment();
    const selectedReplicaSet = makeReplicaSet(1);
    const revision = revisionFor(deployment, selectedReplicaSet);
    const wrongNamespace = makeReplicaSet(1, { namespace: "other" });
    const namespaceResult = await prepareRollback({ deployment, revision }, fakeDeps(deployment, wrongNamespace));

    expect(namespaceResult).toEqual({
      status: "error",
      error: { kind: "revision-replaced", message: expect.stringContaining("replaced") },
    });

    const wrongOwner = makeReplicaSet(1, { ownerKind: "StatefulSet", controller: false });
    const ownerResult = await prepareRollback({ deployment, revision }, fakeDeps(deployment, wrongOwner));

    expect(ownerResult).toEqual({
      status: "error",
      error: { kind: "ownership-changed", message: expect.stringContaining("no longer belongs") },
    });
  });

  it("does not fall back to a historical template when the fresh ReplicaSet has none", async () => {
    const deployment = makeDeployment();
    const selectedReplicaSet = makeReplicaSet(1);
    const revision = revisionFor(deployment, selectedReplicaSet);
    const freshReplicaSet = makeReplicaSet(1);

    freshReplicaSet.spec.template = undefined as never;

    const result = await prepareRollback({ deployment, revision }, fakeDeps(deployment, freshReplicaSet));

    expect(result).toEqual({
      status: "error",
      error: { kind: "no-template", message: expect.stringContaining("no Pod template") },
    });
  });

  it("refuses when the ReplicaSet no longer belongs to the Deployment", async () => {
    const deployment = makeDeployment();
    const replicaSet = makeReplicaSet(1);
    const revision = revisionFor(deployment, replicaSet);
    const foreignReplicaSet = makeReplicaSet(1, { ownerUid: "other-deployment" });
    const result = await prepareRollback({ deployment, revision }, fakeDeps(deployment, foreignReplicaSet));

    expect(result).toEqual({
      status: "error",
      error: { kind: "ownership-changed", message: expect.stringContaining("no longer belongs") },
    });
  });

  it("refuses when the revision annotation changed", async () => {
    const deployment = makeDeployment();
    const replicaSet = makeReplicaSet(1);
    const revision = revisionFor(deployment, replicaSet);
    const changed = makeReplicaSet(4, { uid: replicaSet.metadata.uid, name: replicaSet.getName() });
    const result = await prepareRollback({ deployment, revision }, fakeDeps(deployment, changed));

    expect(result.status).toBe("error");

    if (result.status === "error") {
      expect(result.error.kind).toBe("revision-changed");
    }
  });

  it("surfaces RBAC errors", async () => {
    const deployment = makeDeployment();
    const replicaSet = makeReplicaSet(1);
    const revision = revisionFor(deployment, replicaSet);
    const deps = fakeDeps(deployment, replicaSet);

    deps.deploymentApi.get.mockRejectedValueOnce({ error: { code: 403 }});

    const result = await prepareRollback({ deployment, revision }, deps);

    expect(result).toEqual({
      status: "error",
      error: { kind: "forbidden", message: expect.stringContaining("permission") },
    });
  });

  it("detects that a rollout is in progress", async () => {
    const deployment = makeDeployment({ updatedReplicas: 1, observedGeneration: 1 });
    const replicaSet = makeReplicaSet(1);
    const revision = revisionFor(deployment, replicaSet);
    const result = await prepareRollback({ deployment, revision }, fakeDeps(deployment, replicaSet));

    expect(result.status).toBe("ready");

    if (result.status === "ready") {
      expect(result.preparation.inProgress).toBe(true);
    }
  });
});

describe("applyRollbackPatch", () => {
  const plan = {
    patch: [{ op: "replace" as const, path: "/spec/template/spec/containers/0/image", value: "nginx:1.27" }],
    templateOperations: [],
    targetTemplate: {},
  };

  it("sends dryRun=All and never mutates in dry-run mode", async () => {
    const patch = jest.fn(async () => ({}));
    const result = await applyRollbackPatch({ deploymentApi: { patch }}, makeDeployment(), plan, "dry-run");

    expect(result).toEqual({ ok: true, operationCount: 1 });
    expect(patch).toHaveBeenCalledWith(
      { name: "web", namespace: "default" },
      plan.patch,
      "json",
      { dryRun: "All" },
    );
  });

  it("omits dryRun when executing", async () => {
    const patch = jest.fn(async () => ({}));

    await applyRollbackPatch({ deploymentApi: { patch }}, makeDeployment(), plan, "execute");

    expect(patch).toHaveBeenCalledWith(
      { name: "web", namespace: "default" },
      plan.patch,
      "json",
      undefined,
    );
  });

  it("reports precondition conflicts (409) and validation failures (422) with causes", async () => {
    const conflict = {
      error: {
        code: 409,
        message: "the object has been modified",
      },
    };
    const invalid = {
      error: {
        code: 422,
        message: "the server rejected the patch",
        details: { causes: [{ field: "spec.template.spec.containers[0].image", message: "Invalid image" }] },
      },
    };
    const patch = jest.fn()
      .mockRejectedValueOnce(conflict)
      .mockRejectedValueOnce(invalid);

    const conflictResult = await applyRollbackPatch({ deploymentApi: { patch }}, makeDeployment(), plan, "execute");
    const invalidResult = await applyRollbackPatch({ deploymentApi: { patch }}, makeDeployment(), plan, "execute");

    expect(conflictResult.statusCode).toBe(409);
    expect(conflictResult.message).not.toContain("modified");
    expect(conflictResult.message).toContain("Deployment changed");
    expect(invalidResult.statusCode).toBe(422);
    expect(invalidResult.causes).toEqual([
      { field: "spec.template.spec.containers[0].image", message: "Validation failed." },
    ]);
  });
});
