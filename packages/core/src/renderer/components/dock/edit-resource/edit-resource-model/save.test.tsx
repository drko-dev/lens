/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { observable } from "mobx";
import yaml from "js-yaml";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { KubeObject } from "@openlens/kube-object";
import type { RawKubeObject } from "@openlens/kube-object";
import { JsonApiErrorParsed } from "@openlens/json-api";
import { EditResourceLabelName, EditResourceModel } from "./edit-resource-model.injectable";
import { isConflictError } from "./request-replace-kube-resource.injectable";
import { isPatchConflictError } from "./request-patch-kube-resource.injectable";
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

const asText = (notification: unknown) => (
  typeof notification === "string" ? notification : renderToStaticMarkup(notification as ReactElement)
);

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

describe("edit resource model - save", () => {
  describe("ConfigMap", () => {
    it("replaces with the originally loaded resourceVersion, verifies with GET and confirms", async () => {
      const { deps, model, respondWith, edit, editing } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });

      deps.requestReplaceKubeResource.mockResolvedValueOnce({ callWasSuccessful: true });
      respondWith(configMap("2", { key: "new" }));

      const result = await model.save();

      expect(deps.requestPatchKubeResource).not.toHaveBeenCalled();
      expect(deps.requestReplaceKubeResource).toHaveBeenCalledTimes(1);

      const [link, body] = deps.requestReplaceKubeResource.mock.calls[0];

      expect(link).toBe(configMapLink);
      expect(body.metadata.resourceVersion).toBe("1");
      expect(body.metadata.selfLink).toBeUndefined();
      expect(body.data).toEqual({ key: "new" });
      expect(deps.requestKubeResource).toHaveBeenCalledTimes(2); // load + verification
      expect(result).toEqual([]);
      expect(asText(deps.showSuccessNotification.mock.calls[0][0])).toContain("saved and verified");
      expect(deps.showErrorNotification).not.toHaveBeenCalled();
      expect((yaml.load(editing.firstDraft ?? "") as RawKubeObject).metadata.resourceVersion).toBe("2");
    });

    it("never adds the k8slens-edit-resource-version label", async () => {
      const { deps, model, respondWith, edit } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });
      deps.requestReplaceKubeResource.mockResolvedValueOnce({ callWasSuccessful: true });
      respondWith(configMap("2", { key: "new" }));
      await model.save();

      expect(deps.requestReplaceKubeResource.mock.calls[0][1].metadata.labels?.[EditResourceLabelName]).toBeUndefined();
    });

    it("keeps an existing legitimate label untouched", async () => {
      const { deps, model, respondWith, edit } = setup(configMapLink);
      const withLabel = { ...configMap("1", { key: "old" }), metadata: { ...configMap("1", {}).metadata, labels: { team: "devops" }}};

      respondWith(withLabel);
      await model.load();
      edit(object => {
        object.data.key = "new";
      });
      deps.requestReplaceKubeResource.mockResolvedValueOnce({ callWasSuccessful: true });
      respondWith({ ...withLabel, data: { key: "new" }});
      await model.save();

      expect(deps.requestReplaceKubeResource.mock.calls[0][1].metadata.labels).toEqual({ team: "devops" });
    });

    it("ignores a resourceVersion edited in the YAML, so conflicts are still detected", async () => {
      const { deps, model, respondWith, edit } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.metadata.resourceVersion = "999";
        object.data.key = "new";
      });
      deps.requestReplaceKubeResource.mockResolvedValueOnce({ callWasSuccessful: true });
      respondWith(configMap("2", { key: "new" }));
      await model.save();

      expect(deps.requestReplaceKubeResource.mock.calls[0][1].metadata.resourceVersion).toBe("1");
    });

    describe("given the resource changed in the cluster (409)", () => {
      const conflictSetup = async () => {
        const context = setup(configMapLink);

        context.respondWith(configMap("1", { key: "old", other: "a" }));
        await context.model.load();
        context.edit(object => {
          object.data.key = "mine";
        });
        context.deps.requestReplaceKubeResource.mockResolvedValueOnce({ callWasSuccessful: false, error: "Conflict", isConflict: true });
        context.respondWith(configMap("5", { key: "old", other: "theirs" }));

        const draftBeforeSave = context.editing.draft;
        const result = await context.model.save();

        return { ...context, draftBeforeSave, result };
      };

      it("does not confirm and keeps the local draft", async () => {
        const { result, deps, editing, draftBeforeSave } = await conflictSetup();

        expect(result).toBeNull();
        expect(deps.showSuccessNotification).not.toHaveBeenCalled();
        expect(editing.draft).toBe(draftBeforeSave);
        expect((yaml.load(editing.firstDraft ?? "") as RawKubeObject).metadata.resourceVersion).toBe("1");
      });

      it("reports the conflict with the changed paths", async () => {
        const { model, deps } = await conflictSetup();

        expect(asText(deps.showErrorNotification.mock.calls[0][0])).toContain("NOT saved");
        expect(model.conflict.get()).toEqual({
          localChangedPaths: ["/data/key"],
          remoteChangedPaths: ["/data/other"],
          overlappingPaths: [],
        });
      });

      it("does not retry the save with a newer resourceVersion on its own", async () => {
        const { deps } = await conflictSetup();

        expect(deps.requestReplaceKubeResource).toHaveBeenCalledTimes(1);
      });

      it("re-applies the local edits on the cluster version only when asked", async () => {
        const { model, respondWith, editing } = await conflictSetup();

        respondWith(configMap("5", { key: "old", other: "theirs" }));
        await model.rebaseOnClusterVersion();

        const rebased = yaml.load(editing.draft ?? "") as RawKubeObject & { data: Record<string, string> };

        expect(rebased.data).toEqual({ key: "mine", other: "theirs" });
        expect(rebased.metadata.resourceVersion).toBe("5");
        expect(model.conflict.get()).toBeUndefined();
      });
    });

    it("given RBAC forbids the update, shows the error and keeps the draft", async () => {
      const { deps, model, respondWith, edit, editing } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });

      const draft = editing.draft;

      deps.requestReplaceKubeResource.mockResolvedValueOnce({ callWasSuccessful: false, error: "configmaps \"app-config\" is forbidden", isConflict: false });

      expect(await model.save()).toBeNull();
      expect(asText(deps.showErrorNotification.mock.calls[0][0])).toContain("forbidden");
      expect(deps.showSuccessNotification).not.toHaveBeenCalled();
      expect(deps.requestKubeResource).toHaveBeenCalledTimes(1);
      expect(editing.draft).toBe(draft);
      expect(model.conflict.get()).toBeUndefined();
    });

    it("given the connection fails, shows the error and keeps the draft", async () => {
      const { deps, model, respondWith, edit, editing } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });

      const draft = editing.draft;

      deps.requestReplaceKubeResource.mockResolvedValueOnce({ callWasSuccessful: false, error: "fetch failed", isConflict: false });

      expect(await model.save()).toBeNull();
      expect(asText(deps.showErrorNotification.mock.calls[0][0])).toContain("fetch failed");
      expect(editing.draft).toBe(draft);
    });

    it("given the verification GET fails, does not confirm the save", async () => {
      const { deps, model, respondWith, edit, editing } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });

      const draft = editing.draft;

      deps.requestReplaceKubeResource.mockResolvedValueOnce({ callWasSuccessful: true });
      deps.requestKubeResource.mockResolvedValueOnce({ callWasSuccessful: false, error: "connection reset" });

      expect(await model.save()).toBeNull();
      expect(deps.showSuccessNotification).not.toHaveBeenCalled();
      expect(asText(deps.showErrorNotification.mock.calls[0][0])).toContain("could not be verified");
      expect(editing.draft).toBe(draft);
    });

    it("given the cluster persisted something different (e.g. a mutating webhook), reports it and shows the persisted version", async () => {
      const { deps, model, respondWith, edit, editing } = setup(configMapLink);

      respondWith(configMap("1", { key: "old" }));
      await model.load();
      edit(object => {
        object.data.key = "new";
      });
      deps.requestReplaceKubeResource.mockResolvedValueOnce({ callWasSuccessful: true });
      respondWith(configMap("2", { key: "mutated" }));

      expect(await model.save()).toBeNull();
      expect(deps.showSuccessNotification).not.toHaveBeenCalled();
      expect(asText(deps.showErrorNotification.mock.calls[0][0])).toContain("/data/key");
      expect((yaml.load(editing.draft ?? "") as { data: object }).data).toEqual({ key: "mutated" });
    });
  });

  describe("Secret", () => {
    it("saves stringData, verifies it against base64 data and never exposes the value", async () => {
      const { deps, model, respondWith, edit, allNotificationText } = setup(secretLink);

      respondWith(secret("10", { user: Buffer.from("admin").toString("base64") }));
      await model.load();
      edit(object => {
        object.stringData = { password: "s3cr3t-value" };
      });
      deps.requestReplaceKubeResource.mockResolvedValueOnce({ callWasSuccessful: true });
      respondWith(secret("11", {
        user: Buffer.from("admin").toString("base64"),
        password: Buffer.from("s3cr3t-value").toString("base64"),
      }));

      expect(await model.save()).toEqual([]);
      expect(deps.requestReplaceKubeResource.mock.calls[0][1].metadata.resourceVersion).toBe("10");
      expect(allNotificationText()).toContain("saved and verified");
      expect(allNotificationText()).not.toContain("s3cr3t-value");
    });

    it("given a data value was not persisted, reports only the path, never the value", async () => {
      const { deps, model, respondWith, edit, allNotificationText } = setup(secretLink);
      const value = Buffer.from("top-secret").toString("base64");

      respondWith(secret("10", { token: Buffer.from("old").toString("base64") }));
      await model.load();
      edit(object => {
        object.data.token = value;
      });
      deps.requestReplaceKubeResource.mockResolvedValueOnce({ callWasSuccessful: true });
      respondWith(secret("11", { token: Buffer.from("other").toString("base64") }));

      expect(await model.save()).toBeNull();
      expect(allNotificationText()).toContain("/data/token");
      expect(allNotificationText()).not.toContain(value);
      expect(allNotificationText()).not.toContain("top-secret");
    });
  });

  describe("Deployment", () => {
    it("keeps the minimal JSON Patch (no full replace), without the version label, and verifies with GET", async () => {
      const { deps, model, respondWith, edit } = setup(deploymentLink);
      const deployment = (resourceVersion: string, replicas: number) => ({
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "app", namespace: "default", resourceVersion, selfLink: deploymentLink },
        spec: { replicas },
      });

      respondWith(deployment("1", 1));
      await model.load();
      edit(object => {
        object.spec.replicas = 3;
      });
      deps.requestPatchKubeResource.mockResolvedValueOnce({ callWasSuccessful: true, response: { name: "app", kind: "Deployment" }});
      respondWith(deployment("2", 3));

      expect(await model.save()).toEqual([]);
      expect(deps.requestReplaceKubeResource).not.toHaveBeenCalled();
      expect(deps.requestPatchKubeResource).toHaveBeenCalledWith(deploymentLink, [
        { op: "test", path: "/metadata/resourceVersion", value: "1" },
        { op: "replace", path: "/spec/replicas", value: 3 },
      ]);
    });
    it("atomically checks original resourceVersion and UID; ignores manually edited server metadata", async () => {
      const { deps, model, respondWith, edit } = setup(deploymentLink);
      const resource = (resourceVersion: string, replicas: number) => ({
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "app", namespace: "default", uid: "original-uid", resourceVersion, selfLink: deploymentLink },
        spec: { replicas },
      });

      respondWith(resource("4", 1));
      await model.load();
      edit(object => {
        object.metadata.resourceVersion = "999"; // Must never replace the precondition.
        object.metadata.uid = "edited-uid";
        object.metadata.selfLink = "/apis/apps/v1/namespaces/default/deployments/another"; // Must not redirect the PATCH.
        object.spec.replicas = 2;
      });

      deps.requestPatchKubeResource.mockResolvedValueOnce({ callWasSuccessful: true, response: { name: "app", kind: "Deployment" }});
      respondWith(resource("5", 2));
      expect(await model.save()).toEqual([]);

      expect(deps.requestPatchKubeResource).toHaveBeenCalledWith(deploymentLink, [
        { op: "test", path: "/metadata/resourceVersion", value: "4" },
        { op: "test", path: "/metadata/uid", value: "original-uid" },
        { op: "replace", path: "/spec/replicas", value: 2 },
      ]);
    });

    it("keeps the draft and displays changed paths when the precondition is rejected", async () => {
      const { model, deps, respondWith, edit, editing } = setup(deploymentLink);
      const resource = (resourceVersion: string, replicas: number) => ({
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "app", namespace: "default", resourceVersion, selfLink: deploymentLink },
        spec: { replicas },
      });

      respondWith(resource("1", 1));
      await model.load();
      edit(object => { object.spec.replicas = 3; });
      const draft = editing.draft;

      deps.requestPatchKubeResource.mockResolvedValueOnce({ callWasSuccessful: false, error: "Conflict", isConflict: true });
      respondWith(resource("2", 4));

      expect(await model.save()).toBeNull();
      expect(deps.requestPatchKubeResource).toHaveBeenCalledTimes(1);
      expect(deps.showSuccessNotification).not.toHaveBeenCalled();
      expect(editing.draft).toBe(draft);
      expect(model.conflict.get()).toEqual({
        localChangedPaths: ["/spec/replicas"],
        remoteChangedPaths: ["/spec/replicas"],
        overlappingPaths: ["/spec/replicas"],
      });
    });

    it("refuses to PATCH when the originally loaded resourceVersion is absent", async () => {
      const { model, deps, respondWith, edit } = setup(deploymentLink);

      respondWith({
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata: { name: "app", namespace: "default", selfLink: deploymentLink },
        spec: { replicas: 1 },
      });
      await model.load();
      edit(object => { object.spec.replicas = 2; });

      expect(await model.save()).toBeNull();
      expect(deps.requestPatchKubeResource).not.toHaveBeenCalled();
      expect(asText(deps.showErrorNotification.mock.calls[0][0])).toContain("resourceVersion is unknown");
    });
  });
});

describe("isPatchConflictError", () => {
  it("recognizes 409 and specifically failed JSON Patch tests, not ordinary 422 or 403", () => {
    expect(isPatchConflictError(new JsonApiErrorParsed({ code: 409, reason: "Conflict" } as never, ["Conflict"]))).toBe(true);
    expect(isPatchConflictError(new JsonApiErrorParsed({ code: 422, message: "jsonpatch test operation failed" } as never, ["test"]))).toBe(true);
    expect(isPatchConflictError(new JsonApiErrorParsed({ code: 422, message: "Validation failed for field foo" } as never, ["invalid"]))).toBe(false);
    expect(isPatchConflictError(new JsonApiErrorParsed({ code: 403, message: "Forbidden" } as never, ["forbidden"]))).toBe(false);
    expect(isPatchConflictError(new TypeError("fetch failed"))).toBe(false);
  });
});

describe("isConflictError", () => {
  it("is true only for a Kubernetes 409 status", () => {
    expect(isConflictError(new JsonApiErrorParsed({ code: 409, reason: "Conflict" } as never, ["Conflict"]))).toBe(true);
    expect(isConflictError(new JsonApiErrorParsed({ code: 403, reason: "Forbidden" } as never, ["Forbidden"]))).toBe(false);
    expect(isConflictError(new TypeError("fetch failed"))).toBe(false);
  });
});
