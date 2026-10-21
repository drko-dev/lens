/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { observable } from "mobx";
import yaml from "js-yaml";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { KubeObject } from "@openlens/kube-object";
import { EditResourceModel } from "./edit-resource-model.injectable";
import type { EditingResource, EditResourceTabStore } from "../store";

const configMapLink = "/api/v1/namespaces/default/configmaps/app-config";
const secretLink = "/api/v1/namespaces/default/secrets/app-secret";

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
  const confirmMock = jest.fn();
  const mockCluster = { id: "test-cluster-1", name: "test-cluster-1", preferences: {}} as any;
  const deps = {
    requestKubeResource: jest.fn(),
    requestPatchKubeResource: jest.fn(),
    requestReplaceKubeResource: jest.fn(),
    showSuccessNotification: jest.fn(),
    showErrorNotification: jest.fn(),
    confirm: confirmMock,
    store: { getData: () => editing } as unknown as EditResourceTabStore,
    tabId: "tab-diff-1",
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
  const allNotificationText = () => [
    ...deps.showSuccessNotification.mock.calls,
    ...deps.showErrorNotification.mock.calls,
  ].map(([notification]) => asText(notification)).join("\n");

  return { editing, deps, model, respondWith, edit, allNotificationText, confirmMock };
};

describe("EditResourceModel - Diff, Revert, and YAML Validation (R2-02)", () => {
  describe("YAML Validation before Save", () => {
    it("refuses to save when YAML syntax is invalid and preserves the draft", async () => {
      const { model, respondWith, deps, allNotificationText } = setup(configMapLink);

      respondWith(configMap("1", { key: "initial" }));
      await model.load();

      model.configuration.onChange("apiVersion: v1\nkind: ConfigMap\nmetadata: [invalid_syntax");

      const result = await model.save();

      expect(result).toBeNull();
      expect(deps.requestReplaceKubeResource).not.toHaveBeenCalled();
      expect(deps.requestPatchKubeResource).not.toHaveBeenCalled();
      expect(allNotificationText()).toContain("Cannot save resource");
      expect(model.configuration.error.value.get()).toContain("unexpected end of the stream");
    });

    it("refuses to save when manifest has multiple documents", async () => {
      const { model, respondWith, deps, allNotificationText } = setup(configMapLink);

      respondWith(configMap("1", { key: "initial" }));
      await model.load();

      model.configuration.onChange(
        "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: cm1\n---\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: cm2",
      );

      const result = await model.save();

      expect(result).toBeNull();
      expect(deps.requestReplaceKubeResource).not.toHaveBeenCalled();
      expect(allNotificationText()).toContain("Only a single Kubernetes resource document is supported");
    });

    it("refuses to save when required metadata.name is missing", async () => {
      const { model, respondWith, allNotificationText } = setup(configMapLink);

      respondWith(configMap("1", { key: "initial" }));
      await model.load();

      model.configuration.onChange("apiVersion: v1\nkind: ConfigMap\nmetadata:\n  namespace: default");

      const result = await model.save();

      expect(result).toBeNull();
      expect(allNotificationText()).toContain("Missing required field: metadata.name");
    });
  });

  describe("Dirty state tracking (hasUnsavedChanges)", () => {
    it("is false initially, true after edits, and false again after reverting", async () => {
      const { model, respondWith, edit, confirmMock } = setup(configMapLink);

      respondWith(configMap("1", { key: "initial" }));
      await model.load();

      expect(model.hasUnsavedChanges).toBe(false);

      edit(obj => {
        obj.data.key = "modified";
      });

      expect(model.hasUnsavedChanges).toBe(true);

      confirmMock.mockResolvedValueOnce(true);
      await model.revertToOriginal();

      expect(model.hasUnsavedChanges).toBe(false);
      expect((yaml.load(model.configuration.value.get()) as any).data.key).toBe("initial");
    });
  });

  describe("Revert to Original", () => {
    it("asks confirmation if there are unsaved changes; cancels safely if user rejects", async () => {
      const { model, respondWith, edit, confirmMock } = setup(configMapLink);

      respondWith(configMap("1", { key: "initial" }));
      await model.load();

      edit(obj => {
        obj.data.key = "user-draft";
      });

      confirmMock.mockResolvedValueOnce(false); // User clicks Cancel

      const reverted = await model.revertToOriginal();

      expect(reverted).toBe(false);
      expect(confirmMock).toHaveBeenCalledTimes(1);
      expect((yaml.load(model.configuration.value.get()) as any).data.key).toBe("user-draft");
      expect(model.hasUnsavedChanges).toBe(true);
    });

    it("reverts cleanly when user confirms", async () => {
      const { model, respondWith, edit, confirmMock, allNotificationText } = setup(configMapLink);

      respondWith(configMap("1", { key: "initial" }));
      await model.load();

      edit(obj => {
        obj.data.key = "user-draft";
      });

      confirmMock.mockResolvedValueOnce(true); // User clicks Ok

      const reverted = await model.revertToOriginal();

      expect(reverted).toBe(true);
      expect((yaml.load(model.configuration.value.get()) as any).data.key).toBe("initial");
      expect(model.hasUnsavedChanges).toBe(false);
      expect(allNotificationText()).toContain("Reverted to originally loaded version");
    });
  });

  describe("Reload from Cluster", () => {
    it("prompts confirmation if dirty, and does not fetch if user cancels", async () => {
      const { model, respondWith, edit, confirmMock, deps } = setup(configMapLink);

      respondWith(configMap("1", { key: "initial" }));
      await model.load();

      edit(obj => {
        obj.data.key = "dirty-local";
      });

      confirmMock.mockResolvedValueOnce(false); // User cancels reload

      const reloaded = await model.reloadFromCluster();

      expect(reloaded).toBe(false);
      expect(deps.requestKubeResource).toHaveBeenCalledTimes(1); // only initial load
      expect((yaml.load(model.configuration.value.get()) as any).data.key).toBe("dirty-local");
    });

    it("fetches fresh cluster resource and updates both firstDraft and draft when user confirms", async () => {
      const { model, respondWith, edit, confirmMock, deps, allNotificationText } = setup(configMapLink);

      respondWith(configMap("1", { key: "initial" }));
      await model.load();

      edit(obj => {
        obj.data.key = "dirty-local";
      });

      confirmMock.mockResolvedValueOnce(true); // User confirms
      respondWith(configMap("2", { key: "remote-updated" })); // Fresh from cluster

      const reloaded = await model.reloadFromCluster();

      expect(reloaded).toBe(true);
      expect(deps.requestKubeResource).toHaveBeenCalledTimes(2);
      expect(model.hasUnsavedChanges).toBe(false);
      expect((yaml.load(model.configuration.value.get()) as any).data.key).toBe("remote-updated");
      expect(model.originalResourceVersion).toBe("2");
      expect(allNotificationText()).toContain("Reloaded latest version from cluster");
    });
  });

  describe("Live Cluster Diffing without mutating draft", () => {
    it("fetches live cluster version without overwriting the user draft", async () => {
      const { model, respondWith, edit, deps } = setup(configMapLink);

      respondWith(configMap("1", { key: "initial" }));
      await model.load();

      edit(obj => {
        obj.data.key = "my-active-draft";
      });

      respondWith(configMap("5", { key: "cluster-changed" }));

      const ok = await model.fetchClusterVersion();

      expect(ok).toBe(true);
      expect(deps.requestKubeResource).toHaveBeenCalledTimes(2);
      // Verify local draft is still my-active-draft
      expect((yaml.load(model.configuration.value.get()) as any).data.key).toBe("my-active-draft");
      expect(model.clusterResourceVersion).toBe("5");
      expect(model.originalResourceVersion).toBe("1");
      expect(model.isRemoteDifferentFromOriginal).toBe(true);
      expect(model.diffClusterYaml).toContain("cluster-changed");
    });
  });

  describe("Secret Redaction in Diff (Requirement D)", () => {
    it("redacts secret data values in original and modified diff YAML without revealing secrets", async () => {
      const { model, respondWith, edit } = setup(secretLink);

      respondWith(secret("10", { token: "c3VwZXJTZWNyZXQxMjM=", pin: "OTk5OQ==" }));
      await model.load();

      edit(obj => {
        obj.data.token = "bmV3VG9rZW40NTY="; // Modified
        obj.data.newKey = "ZXh0cmE="; // Added
        delete obj.data.pin; // Removed
      });

      const origDiff = model.diffOriginalYaml;
      const modDiff = model.diffModifiedYaml;

      // Ensure secret base64 strings are NEVER leaked in diff YAML
      expect(origDiff).not.toContain("c3VwZXJTZWNyZXQxMjM=");
      expect(origDiff).not.toContain("OTk5OQ==");
      expect(modDiff).not.toContain("bmV3VG9rZW40NTY=");
      expect(modDiff).not.toContain("ZXh0cmE=");

      // Ensure indicators are present
      expect(origDiff).toContain("<redacted>");
      expect(modDiff).toContain("<redacted (modified)>");
      expect(modDiff).toContain("<redacted (new)>");
    });
  });
});
