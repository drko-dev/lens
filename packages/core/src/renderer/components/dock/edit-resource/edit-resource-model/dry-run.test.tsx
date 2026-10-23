/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { observable } from "mobx";
import yaml from "js-yaml";
import { KubeObject } from "@openlens/kube-object";
import type { ReactElement } from "react";import { renderToStaticMarkup } from "react-dom/server";
import { EditResourceModel } from "./edit-resource-model.injectable";
import type { EditingResource, EditResourceTabStore } from "../store";

const configMapLink = "/api/v1/namespaces/default/configmaps/app-config";
const secretLink = "/api/v1/namespaces/default/secrets/app-secret";
const deploymentLink = "/apis/apps/v1/namespaces/default/deployments/app";

const configMap = (resourceVersion: string, data: Record<string, string>) => ({
  apiVersion: "v1",
  kind: "ConfigMap",
  metadata: { name: "app-config", namespace: "default", uid: "uid-1", resourceVersion, selfLink: configMapLink },
  data,
});

const secret = (resourceVersion: string, data: Record<string, string>) => ({
  apiVersion: "v1",
  kind: "Secret",
  type: "Opaque",
  metadata: { name: "app-secret", namespace: "default", uid: "uid-2", resourceVersion, selfLink: secretLink },
  data,
});

const deployment = (resourceVersion: string) => ({
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: { name: "app", namespace: "default", uid: "uid-3", resourceVersion, selfLink: deploymentLink },
  spec: { replicas: 1, template: { spec: { containers: [{ name: "app", image: "nginx:1.25" }] }}},
});

const asText = (notification: unknown) => (
  typeof notification === "string" ? notification : renderToStaticMarkup(notification as ReactElement)
);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => resolve = res);

  return { promise, resolve };
}

const setup = (selfLink: string) => {
  const editing = observable<EditingResource>({ resource: selfLink });
  const mockCluster = { id: "test-cluster-1", name: "test-cluster-1", preferences: {}} as any;
  const deps = {
    requestKubeResource: jest.fn(),
    requestPatchKubeResource: jest.fn(),
    requestReplaceKubeResource: jest.fn(),
    showSuccessNotification: jest.fn(),
    showErrorNotification: jest.fn(),
    store: { getData: () => editing } as unknown as EditResourceTabStore,
    tabId: "tab-1",
    waitForEditingResource: async () => editing,
    hostedCluster: mockCluster,
  };
  const model = new EditResourceModel(deps);
  const respondWith = (raw: object) => deps.requestKubeResource.mockResolvedValueOnce({
    callWasSuccessful: true,
    response: new KubeObject(raw as never),
  });
  const edit = (change: (object: Record<string, any>) => void) => {
    const object = yaml.load(model.configuration.value.get()) as Record<string, any>;

    change(object);
    model.configuration.onChange(yaml.dump(object));
  };
  const allNotificationText = () => [...deps.showSuccessNotification.mock.calls, ...deps.showErrorNotification.mock.calls]
    .map(([notification]) => asText(notification))
    .join("\n");

  return { editing, deps, model, respondWith, edit, allNotificationText };
};

describe("edit resource model - server dry-run validation (R7-02)", () => {
  describe("success path", () => {
    it("sends ConfigMap PUT with dryRun and the originally loaded resourceVersion", async () => {
      const { deps, model, respondWith, edit } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });

      deps.requestReplaceKubeResource.mockResolvedValueOnce({ callWasSuccessful: true });
      await model.validateDraft();

      expect(deps.requestReplaceKubeResource).toHaveBeenCalledTimes(1);
      expect(deps.requestPatchKubeResource).not.toHaveBeenCalled();

      const [link, body, opts] = deps.requestReplaceKubeResource.mock.calls[0];

      expect(link).toBe(configMapLink);
      expect(body.metadata.resourceVersion).toBe("1");
      expect(opts).toEqual({ dryRun: "All" });

      const state = model.draftValidation.get();

      expect(state.status).toBe("passed");
      expect(state.message).toBe("Server-side dry-run accepted by Kubernetes");
      expect(state.resourceKind).toBe("ConfigMap");
      expect(state.resourceName).toBe("app-config");
      expect(state.clusterName).toBe("test-cluster-1");
      expect(state.requestMethod).toBe("put");
    });

    it("sends Deployment JSON Patch with dryRun and keeps the test preconditions", async () => {
      const { deps, model, respondWith, edit } = setup(deploymentLink);

      respondWith(deployment("1"));
      await model.load();
      edit(object => {
        object.spec.replicas = 3;
      });

      deps.requestPatchKubeResource.mockResolvedValueOnce({
        callWasSuccessful: true,
        response: { name: "app", kind: "Deployment" },
      });
      await model.validateDraft();

      const [link, patch, opts] = deps.requestPatchKubeResource.mock.calls[0];

      expect(link).toBe(deploymentLink);
      expect(patch).toEqual(expect.arrayContaining([
        { op: "test", path: "/metadata/resourceVersion", value: "1" },
        { op: "replace", path: "/spec/replicas", value: 3 },
      ]));
      expect(opts).toEqual({ dryRun: "All" });
      expect(model.draftValidation.get()).toMatchObject({ status: "passed", requestMethod: "patch" });
    });

    it("never mutates the draft, its base, or notifies a save", async () => {
      const { deps, model, respondWith, edit, editing } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });

      const draftBefore = editing.draft;
      const firstDraftBefore = editing.firstDraft;

      deps.requestReplaceKubeResource.mockResolvedValueOnce({ callWasSuccessful: true });
      await model.validateDraft();

      expect(editing.draft).toBe(draftBefore);
      expect(editing.firstDraft).toBe(firstDraftBefore);
      expect(model.hasUnsavedChanges).toBe(true);
      expect(deps.requestKubeResource).toHaveBeenCalledTimes(1); // load only, no read-back
      expect(deps.showSuccessNotification).not.toHaveBeenCalled();
      expect(deps.showErrorNotification).not.toHaveBeenCalled();
    });
  });

  describe("failure paths", () => {
    it("reports malformed YAML locally without contacting the server", async () => {
      const { deps, model, respondWith } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();

      model.configuration.onChange("kind: ConfigMap\nmetadata: [oops");

      await model.validateDraft();

      expect(deps.requestReplaceKubeResource).not.toHaveBeenCalled();
      expect(deps.requestPatchKubeResource).not.toHaveBeenCalled();
      expect(model.draftValidation.get()).toMatchObject({ status: "failed", errorKind: "malformed-yaml" });
    });

    it("classifies a 422 with structured causes", async () => {
      const { deps, model, respondWith, edit } = setup(deploymentLink);

      respondWith(deployment("1"));
      await model.load();
      edit(object => {
        object.spec.replicas = -1;
      });

      deps.requestPatchKubeResource.mockResolvedValueOnce({
        callWasSuccessful: false,
        error: "Deployment.apps \"app\" is invalid",
        isConflict: false,
        errorPayload: {
          code: 422,
          reason: "Invalid",
          message: "Deployment.apps \"app\" is invalid: spec.replicas: Invalid value: -1",
          details: { causes: [{ field: "spec.replicas", message: "must be greater than or equal to 0" }] },
        },
      });

      await model.validateDraft();

      expect(model.draftValidation.get()).toMatchObject({
        status: "failed",
        errorKind: "invalid",
        statusCode: 422,
        causes: [{ field: "spec.replicas", message: "must be greater than or equal to 0" }],
      });
    });

    it("classifies 403 RBAC denials", async () => {
      const { deps, model, respondWith, edit } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });

      deps.requestReplaceKubeResource.mockResolvedValueOnce({
        callWasSuccessful: false,
        error: "configmaps \"app-config\" is forbidden",
        isConflict: false,
        errorPayload: {
          code: 403,
          reason: "Forbidden",
          message: "configmaps \"app-config\" is forbidden: User cannot patch resource",
        },
      });

      await model.validateDraft();

      expect(model.draftValidation.get()).toMatchObject({ status: "failed", errorKind: "forbidden", statusCode: 403 });
    });

    it("classifies 409 version conflicts", async () => {
      const { deps, model, respondWith, edit } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });

      deps.requestReplaceKubeResource.mockResolvedValueOnce({
        callWasSuccessful: false,
        error: "the object has been modified",
        isConflict: true,
        errorPayload: {
          code: 409,
          reason: "Conflict",
          message: "Operation cannot be fulfilled on configmaps \"app-config\": the object has been modified",
        },
      });

      await model.validateDraft();

      expect(model.draftValidation.get()).toMatchObject({ status: "failed", errorKind: "conflict", statusCode: 409 });
    });

    it("classifies admission webhook rejections with their exact message", async () => {
      const { deps, model, respondWith, edit } = setup(deploymentLink);

      respondWith(deployment("1"));
      await model.load();
      edit(object => {
        object.spec.replicas = 3;
      });

      deps.requestPatchKubeResource.mockResolvedValueOnce({
        callWasSuccessful: false,
        error: "admission webhook denied",
        isConflict: false,
        errorPayload: {
          code: 400,
          reason: "Invalid",
          message: "admission webhook \"policy.example.com\" denied the request: replica cap exceeded",
        },
      });

      await model.validateDraft();

      const state = model.draftValidation.get();

      expect(state).toMatchObject({ status: "failed", errorKind: "admission-denied" });
      expect(state.message).toContain("replica cap exceeded");
    });

    it("classifies connection failures without a server payload", async () => {
      const { deps, model, respondWith, edit } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });

      deps.requestReplaceKubeResource.mockResolvedValueOnce({
        callWasSuccessful: false,
        error: "request to https://cluster failed: ECONNREFUSED",
        isConflict: false,
      });

      await model.validateDraft();

      expect(model.draftValidation.get()).toMatchObject({ status: "failed", errorKind: "connection" });
    });

    it("redacts Secret values echoed back by the server", async () => {
      const { deps, model, respondWith, edit } = setup(secretLink);

      respondWith(secret("1", { password: "ZmFrZS1wYXNzd29yZA==" }));
      await model.load();
      edit(object => {
        object.stringData = { token: "fake-token-value-123" };
      });

      deps.requestReplaceKubeResource.mockResolvedValueOnce({
        callWasSuccessful: false,
        error: "invalid secret",
        isConflict: false,
        errorPayload: {
          code: 422,
          reason: "Invalid",
          message: "data.password: ZmFrZS1wYXNzd29yZA== is not valid base64",
          details: {
            causes: [{ field: "stringData.token", message: "fake-token-value-123 rejected by policy" }],
          },
        },
      });

      await model.validateDraft();

      const state = model.draftValidation.get();
      const serialized = JSON.stringify(state);

      expect(state.status).toBe("failed");
      expect(serialized).not.toContain("ZmFrZS1wYXNzd29yZA==");
      expect(serialized).not.toContain("fake-token-value-123");
      expect(serialized).toContain("<redacted>");
    });

    it("redacts previous Secret values, reason and cause fields echoed back by the server", async () => {
      const { deps, model, respondWith, edit } = setup(secretLink);

      respondWith(secret("1", { password: "b2xkLXNlY3JldA==" }));
      await model.load();
      edit(object => {
        object.data = { password: "bmV3LXNlY3JldA==" };
        object.stringData = { token: "new-token-value" };
      });

      deps.requestReplaceKubeResource.mockResolvedValueOnce({
        callWasSuccessful: false,
        error: "invalid secret",
        isConflict: false,
        errorPayload: {
          code: 422,
          reason: "Invalid b2xkLXNlY3JldA==",
          message: "data.password: bmV3LXNlY3JldA== and removed b2xkLXNlY3JldA== are invalid",
          details: {
            causes: [{ field: "data.b2xkLXNlY3JldA==", message: "new-token-value rejected by policy" }],
          },
        },
      });

      await model.validateDraft();

      const state = model.draftValidation.get();
      const serialized = JSON.stringify(state);

      expect(state.status).toBe("failed");
      expect(serialized).not.toContain("b2xkLXNlY3JldA==");
      expect(serialized).not.toContain("bmV3LXNlY3JldA==");
      expect(serialized).not.toContain("new-token-value");
      expect(serialized).toContain("<redacted>");
      expect(state.causes?.[0].field).toBe("data.<redacted>");
    });
  });

  describe("staleness and races", () => {
    it("discards a late response when the draft was edited during validation", async () => {
      const { deps, model, respondWith, edit } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "first-edit";
      });

      const pending = deferred<{ callWasSuccessful: true }>();

      deps.requestReplaceKubeResource.mockReturnValueOnce(pending.promise);

      const validation = model.validateDraft();

      expect(model.draftValidation.get().status).toBe("validating");

      edit(object => {
        object.data.key = "second-edit";
      });

      pending.resolve({ callWasSuccessful: true });
      await validation;

      expect(model.draftValidation.get().status).toBe("not-validated");
    });

    it("discards a late response when the resource was reloaded during validation", async () => {
      const { deps, model, respondWith, edit } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "changed";
      });

      const pending = deferred<{ callWasSuccessful: true }>();

      deps.requestReplaceKubeResource.mockReturnValueOnce(pending.promise);

      const validation = model.validateDraft();

      respondWith(configMap("2", { key: "changed" }));
      await model.reloadFromCluster();

      pending.resolve({ callWasSuccessful: true });
      await validation;

      expect(model.draftValidation.get().status).toBe("not-validated");
    });

    it("ignores repeated clicks while a validation is in flight", async () => {
      const { deps, model, respondWith, edit } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });

      const pending = deferred<{ callWasSuccessful: true }>();

      deps.requestReplaceKubeResource.mockReturnValueOnce(pending.promise);

      const first = model.validateDraft();

      await model.validateDraft(); // second click while validating

      pending.resolve({ callWasSuccessful: true });
      await first;

      expect(deps.requestReplaceKubeResource).toHaveBeenCalledTimes(1);
    });

    it("invalidates a passed result as soon as the user edits again", async () => {
      const { model, deps, respondWith, edit } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });
      deps.requestReplaceKubeResource.mockResolvedValueOnce({ callWasSuccessful: true });
      await model.validateDraft();

      expect(model.draftValidation.get().status).toBe("passed");

      edit(object => {
        object.data.key = "newer";
      });

      expect(model.draftValidation.get().status).toBe("not-validated");
    });

    it("invalidates a passed result when switching to a different resource version", async () => {
      const { model, deps, respondWith, edit } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });
      deps.requestReplaceKubeResource.mockResolvedValueOnce({ callWasSuccessful: true });
      await model.validateDraft();

      respondWith(configMap("2", { key: "new" }));
      await model.reloadFromCluster();

      expect(model.draftValidation.get().status).toBe("not-validated");
    });
  });

  describe("cluster context protection (final gate)", () => {
    it("does not contact the API server and never reports passed when the cluster context no longer matches", async () => {
      const { deps, model, respondWith, edit } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });

      deps.hostedCluster = { id: "another-cluster", name: "another-cluster", preferences: {}} as any;

      await model.validateDraft();

      expect(deps.requestReplaceKubeResource).not.toHaveBeenCalled();
      expect(deps.requestPatchKubeResource).not.toHaveBeenCalled();
      expect(model.draftValidation.get()).toMatchObject({
        status: "failed",
        errorKind: "context-mismatch",
      });
      expect(model.draftValidation.get().status).not.toBe("passed");
    });

    it("discards a response that arrives after the tab moved to another cluster", async () => {
      const { deps, model, respondWith, edit } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });

      const pending = deferred<{ callWasSuccessful: true }>();

      deps.requestReplaceKubeResource.mockReturnValueOnce(pending.promise);

      const validation = model.validateDraft();

      expect(model.draftValidation.get().status).toBe("validating");

      deps.hostedCluster = { id: "another-cluster", name: "another-cluster", preferences: {}} as any;

      pending.resolve({ callWasSuccessful: true });
      await validation;

      expect(model.draftValidation.get().status).toBe("not-validated");
      expect(model.draftValidation.get().status).not.toBe("passed");
    });
  });

  describe("unexpected failures (final gate)", () => {
    it("recovers from a rejected request without leaving the state validating", async () => {
      const { deps, model, respondWith, edit, editing } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });

      const draftBefore = editing.draft;
      const firstDraftBefore = editing.firstDraft;

      deps.requestReplaceKubeResource.mockRejectedValueOnce(new Error("SECRET-LEAK-do-not-display"));

      await model.validateDraft();

      const state = model.draftValidation.get();

      expect(state.status).toBe("failed");
      expect(state.errorKind).toBe("unknown");
      expect(JSON.stringify(state)).not.toContain("SECRET-LEAK-do-not-display");
      expect(state.message).not.toContain("SECRET-LEAK-do-not-display");

      expect(editing.draft).toBe(draftBefore);
      expect(editing.firstDraft).toBe(firstDraftBefore);
      expect(deps.requestKubeResource).toHaveBeenCalledTimes(1); // load only, no read-back
      expect(deps.showSuccessNotification).not.toHaveBeenCalled();

      // A subsequent validation can still run: the state is not stuck.
      deps.requestReplaceKubeResource.mockResolvedValueOnce({ callWasSuccessful: true });
      await model.validateDraft();

      expect(model.draftValidation.get().status).toBe("passed");
    });

    it("recovers from an unexpected error before the request without touching the draft", async () => {
      const { deps, model, respondWith, edit, editing } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });

      const draftBefore = editing.draft;

      // Force an unexpected error while reading the draft, before any request.
      (deps.store as unknown as { getData: () => never }).getData = () => {
        throw new Error("unexpected store failure");
      };
      deps.requestReplaceKubeResource.mockClear();

      await model.validateDraft();

      expect(model.draftValidation.get().status).not.toBe("validating");
      expect(editing.draft).toBe(draftBefore);
      expect(deps.requestReplaceKubeResource).not.toHaveBeenCalled();
    });
  });

  describe("guard rails", () => {
    it("marks validation unavailable when the original resourceVersion is unknown", async () => {
      const { model, deps } = setup(configMapLink);
      const withoutVersion = configMap("1", { key: "old" });

      delete (withoutVersion.metadata as { resourceVersion?: string }).resourceVersion;

      deps.requestKubeResource.mockResolvedValueOnce({
        callWasSuccessful: true,
        response: new KubeObject(withoutVersion as never),
      });
      await model.load();

      await model.validateDraft();

      expect(deps.requestReplaceKubeResource).not.toHaveBeenCalled();
      expect(model.draftValidation.get()).toMatchObject({ status: "unavailable" });
    });

    it("does not turn a passed validation into a save", async () => {
      const { model, deps, respondWith, edit } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });
      deps.requestReplaceKubeResource.mockResolvedValueOnce({ callWasSuccessful: true });
      await model.validateDraft();

      // Nothing was saved: no read-back, draft still dirty.
      expect(deps.requestKubeResource).toHaveBeenCalledTimes(1);
      expect(model.hasUnsavedChanges).toBe(true);

      // An explicit save afterwards performs the real (non-dry-run) request.
      deps.requestReplaceKubeResource.mockResolvedValueOnce({ callWasSuccessful: true });
      respondWith(configMap("2", { key: "new" }));

      const saveResult = await model.save();

      expect(saveResult).toEqual([]);
      expect(deps.requestReplaceKubeResource).toHaveBeenCalledTimes(2);
      expect(deps.requestReplaceKubeResource.mock.calls[1][2]).toBeUndefined();
      expect(asText(deps.showSuccessNotification.mock.calls[0][0])).toContain("saved and verified");
    });
  });
});
