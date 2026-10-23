/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { DeploymentLike, RolloutTemplate } from "./revisions";
import {
  RollbackPreconditionError,
  buildRollbackPatchPlan,
  computePodTemplatePatch,
  describeTemplateChanges,
  getTemplateFingerprint,
  sanitizeRollbackTemplate,
} from "./template-patch";

const template = (): RolloutTemplate => ({
  metadata: {
    labels: { app: "web", "pod-template-hash": "old-hash" },
    annotations: { note: "keep" },
    creationTimestamp: null,
  },
  spec: {
    serviceAccountName: "web",
    containers: [{
      name: "web",
      image: "nginx:1.27",
      env: [{ name: "MODE", value: "prod" }],
      command: ["/bin/sh"],
      args: ["-c", "sleep 1"],
      resources: { requests: { cpu: "100m" }, limits: { cpu: "500m" }},
      readinessProbe: { httpGet: { path: "/ready", port: 8080 }},
      volumeMounts: [{ name: "data", mountPath: "/data" }],
      securityContext: { runAsNonRoot: true },
    }],
    volumes: [{ name: "data", emptyDir: {}}],
  },
});

const firstContainer = (value: RolloutTemplate) => {
  const container = value.spec?.containers?.[0];

  if (!container) {
    throw new Error("Template fixture must include a container.");
  }

  return container;
};

const deployment = (overrides: Partial<DeploymentLike> = {}): DeploymentLike => ({
  kind: "Deployment",
  apiVersion: "apps/v1",
  metadata: {
    name: "web",
    namespace: "default",
    uid: "deployment-uid",
    resourceVersion: "42",
  },
  spec: {
    replicas: 3,
    paused: false,
    template: template(),
  },
  ...overrides,
});

describe("sanitizeRollbackTemplate", () => {
  it("removes controller-owned fields and the pod-template-hash label", () => {
    const sanitized = sanitizeRollbackTemplate(template());

    expect(sanitized?.metadata).toEqual({
      labels: { app: "web" },
      annotations: { note: "keep" },
    });
  });
});

describe("computePodTemplatePatch", () => {
  it("emits only Pod template operations", () => {
    const current = template();
    const target = template();

    const targetSpec = target.spec;

    if (!targetSpec) {
      throw new Error("Template fixture must include a spec.");
    }

    target.spec = {
      ...targetSpec,
      containers: [{ ...firstContainer(target), image: "nginx:1.28" }],
    };

    const operations = computePodTemplatePatch(current, target);

    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      op: "replace",
      path: "/spec/template/spec/containers",
    });
    expect(operations.every(operation => operation.path.startsWith("/spec/template"))).toBe(true);
  });

  it("does not emit operations when only controller-owned fields differ", () => {
    const current = template();
    const target = template();

    const metadata = target.metadata;
    const labels = metadata?.labels;

    if (!metadata || !labels) {
      throw new Error("Template fixture must include metadata labels.");
    }

    labels["pod-template-hash"] = "new-hash";
    metadata.creationTimestamp = "2026-10-23T00:00:00Z";

    expect(computePodTemplatePatch(current, target)).toEqual([]);
  });

  it("is insensitive to object key order", () => {
    const current = template();
    const target = JSON.parse(JSON.stringify(template()));

    expect(computePodTemplatePatch(current, target)).toEqual([]);
  });

  it("removes fields that are absent from the target template", () => {
    const current = template();
    const target = template();

    if (!target.spec || !target.metadata) {
      throw new Error("Template fixture must include spec and metadata.");
    }

    delete target.spec.volumes;
    delete target.metadata.annotations;

    const operations = computePodTemplatePatch(current, target);

    expect(operations).toEqual(expect.arrayContaining([
      { op: "remove", path: "/spec/template/spec/volumes" },
      { op: "remove", path: "/spec/template/metadata/annotations" },
    ]));
  });

  it("detects changes in every supported category", () => {
    const current = template();
    const target = JSON.parse(JSON.stringify(template())) as RolloutTemplate;

    target.metadata = { labels: { app: "web", tier: "frontend" }, annotations: { note: "keep" }};
    target.spec = {
      ...target.spec,
      serviceAccountName: "web-v2",
      volumes: [{ name: "data", emptyDir: { medium: "Memory" }}],
      securityContext: { runAsUser: 1000 },
      containers: [{
        ...firstContainer(target),
        image: "nginx:1.28",
        env: [{ name: "MODE", value: "staging" }],
        command: ["/bin/bash"],
        args: ["-c", "sleep 2"],
        readinessProbe: { httpGet: { path: "/health", port: 8080 }},
        resources: { requests: { cpu: "200m" }, limits: { cpu: "1" }},
        volumeMounts: [{ name: "data", mountPath: "/cache" }],
        securityContext: { runAsNonRoot: false },
      }],
    };

    expect(describeTemplateChanges(current, target)).toEqual(expect.arrayContaining([
      "images",
      "environment",
      "command",
      "probes",
      "resources",
      "volumes",
      "metadata",
      "serviceAccount",
      "securityContext",
    ]));
  });
});

describe("buildRollbackPatchPlan", () => {
  it("prefixes the patch with UID and resourceVersion test preconditions", () => {
    const plan = buildRollbackPatchPlan(deployment(), template());

    expect(plan.patch[0]).toEqual({ op: "test", path: "/metadata/uid", value: "deployment-uid" });
    expect(plan.patch[1]).toEqual({ op: "test", path: "/metadata/resourceVersion", value: "42" });
  });

  it("never touches replicas, status or top-level metadata", () => {
    const target = template();

    firstContainer(target).image = "nginx:1.28";
    const plan = buildRollbackPatchPlan(deployment(), target);
    const paths = plan.templateOperations.map(operation => operation.path);

    expect(paths.every(path => path.startsWith("/spec/template"))).toBe(true);
    expect(paths.some(path => path.includes("/replicas"))).toBe(false);
    expect(paths.some(path => path.startsWith("/status"))).toBe(false);
  });

  it("does not carry the pod-template-hash label from the revision", () => {
    const plan = buildRollbackPatchPlan(deployment(), template());
    const serialized = JSON.stringify(plan.targetTemplate);

    expect(serialized).not.toContain("pod-template-hash");
  });

  it("fails closed without a UID", () => {
    const noUid = deployment();

    delete noUid.metadata.uid;

    expect(() => buildRollbackPatchPlan(noUid, template())).toThrow(RollbackPreconditionError);
  });

  it("fails closed without a resourceVersion", () => {
    const noResourceVersion = deployment();

    delete noResourceVersion.metadata.resourceVersion;

    expect(() => buildRollbackPatchPlan(noResourceVersion, template())).toThrow(RollbackPreconditionError);
  });

  it("fails closed without a target template", () => {
    expect(() => buildRollbackPatchPlan(deployment(), undefined)).toThrow(RollbackPreconditionError);
  });

  it("produces an empty template operation set for an identical revision", () => {
    const plan = buildRollbackPatchPlan(deployment(), template());

    expect(plan.templateOperations).toEqual([]);
    expect(plan.patch.map(operation => operation.op)).toEqual(["test", "test"]);
  });
});

describe("getTemplateFingerprint", () => {
  it("is stable across key order and ignores controller-owned fields", () => {
    const a = template();
    const b = JSON.parse(JSON.stringify(template()));

    b.metadata.labels["pod-template-hash"] = "different";
    b.metadata.creationTimestamp = "2026-10-23T00:00:00Z";

    expect(getTemplateFingerprint(a)).toBe(getTemplateFingerprint(b));
  });

  it("changes when user fields change", () => {
    const a = template();
    const b = template();

    firstContainer(b).image = "nginx:1.29";

    expect(getTemplateFingerprint(a)).not.toBe(getTemplateFingerprint(b));
  });
});
