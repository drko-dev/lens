/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable, lifecycleEnum } from "@ogre-tools/injectable";
import type { RequestKubeResource } from "./request-kube-resource.injectable";
import requestKubeResourceInjectable from "./request-kube-resource.injectable";
import { waitUntilDefined } from "@openlens/utilities";
import editResourceTabStoreInjectable from "../store.injectable";
import type { EditingResource, EditResourceTabStore } from "../store";
import { action, computed, observable, runInAction } from "mobx";
import type { KubeObject, RawKubeObject } from "@openlens/kube-object";
import yaml from "js-yaml";
import assert from "assert";
import type { RequestPatchKubeResource } from "./request-patch-kube-resource.injectable";
import requestPatchKubeResourceInjectable from "./request-patch-kube-resource.injectable";
import type { RequestReplaceKubeResource } from "./request-replace-kube-resource.injectable";
import requestReplaceKubeResourceInjectable from "./request-replace-kube-resource.injectable";
import { applyPatch } from "rfc6902";
import type { JsonPatch } from "../../../../../common/k8s-api/kube-object.store";
import type { ShowNotification } from "../../../notifications";
import showSuccessNotificationInjectable from "../../../notifications/show-success-notification.injectable";
import React from "react";
import showErrorNotificationInjectable from "../../../notifications/show-error-notification.injectable";
import { createKubeApiURL, parseKubeApi } from "../../../../../common/k8s-api/kube-api-parse";
import type { SaveConflict } from "./save-verification";
import { describeConflict, findUnpersistedChanges, getUserChanges, prepareForReplace, usesOptimisticReplace } from "./save-verification";
import type { Confirm } from "../../../confirm-dialog/confirm.injectable";
import confirmInjectable from "../../../confirm-dialog/confirm.injectable";
import { validateKubernetesResourceYaml } from "../../../monaco-editor/monaco-validators";
import { sanitizeYamlForDiff } from "./diff-redaction";

const editResourceModelInjectable = getInjectable({
  id: "edit-resource-model",

  instantiate: async (di, tabId: string) => {
    const store = di.inject(editResourceTabStoreInjectable);

    const model = new EditResourceModel({
      requestKubeResource: di.inject(requestKubeResourceInjectable),
      requestPatchKubeResource: di.inject(requestPatchKubeResourceInjectable),
      requestReplaceKubeResource: di.inject(requestReplaceKubeResourceInjectable),
      showSuccessNotification: di.inject(showSuccessNotificationInjectable),
      showErrorNotification: di.inject(showErrorNotificationInjectable),
      confirm: di.inject(confirmInjectable),
      store,
      tabId,
      waitForEditingResource: () => waitUntilDefined(() => store.getData(tabId)),
    });

    await model.load();

    return model;
  },

  lifecycle: lifecycleEnum.keyedSingleton({
    getInstanceKey: (di, tabId: string) => tabId,
  }),
});

export default editResourceModelInjectable;

interface Dependencies {
  requestKubeResource: RequestKubeResource;
  requestPatchKubeResource: RequestPatchKubeResource;
  requestReplaceKubeResource: RequestReplaceKubeResource;
  waitForEditingResource: () => Promise<EditingResource>;
  showSuccessNotification: ShowNotification;
  showErrorNotification: ShowNotification;
  readonly store: EditResourceTabStore;
  readonly tabId: string;
  confirm?: Confirm;
}

function getEditSelfLinkFor(object: RawKubeObject): string | undefined {
  const lensVersionLabel = object.metadata.labels?.[EditResourceLabelName];

  if (lensVersionLabel) {
    const parsedKubeApi = parseKubeApi(object.metadata.selfLink);

    if (!parsedKubeApi) {
      return undefined;
    }

    const { apiVersionWithGroup, ...parsedApi } = parsedKubeApi;

    return createKubeApiURL({
      ...parsedApi,
      apiVersion: lensVersionLabel,
    });
  }

  return object.metadata.selfLink;
}

/**
 * The label that older Lens versions wrote into every edited resource.
 * It is only read (for resources that already have it), never written.
 */
export const EditResourceLabelName = "k8slens-edit-resource-version";

export class EditResourceModel {
  constructor(protected readonly dependencies: Dependencies) {}

  readonly configuration = {
    value: computed(
      () => this.editingResource.draft || this.editingResource.firstDraft || "",
    ),

    onChange: action((value: string) => {
      this.editingResource.draft = value;
      const validation = validateKubernetesResourceYaml(value);

      if (!validation.valid) {
        this.configuration.error.value.set(validation.error || "Invalid YAML");
      } else {
        this.configuration.error.value.set("");
      }
    }),

    error: {
      value: observable.box(""),

      onChange: action((error: unknown) => {
        const errorMsg = error
          ? typeof error === "string"
            ? error
            : error instanceof Error
              ? error.message
              : String(error)
          : "";

        this.configuration.error.value.set(errorMsg);
      }),
    },
  };

  /**
   * Current view mode: normal single editor, diff against originally loaded version,
   * or diff against live cluster version.
   */
  readonly diffMode = observable.box<"normal" | "diff-original" | "diff-cluster">("normal");

  /**
   * Indicates whether an asynchronous operation (e.g. reload or remote fetch) is in progress.
   */
  readonly isBusy = observable.box<boolean>(false);

  /**
   * Cached live cluster object fetched explicitly for diffing or reloading.
   */
  readonly remoteClusterResource = observable.box<RawKubeObject | undefined>(undefined);
  readonly remoteClusterFetchError = observable.box<string | undefined>(undefined);
  readonly remoteClusterFetchedAt = observable.box<Date | undefined>(undefined);

  /**
   * Set when the last save was rejected because the resource changed in the cluster.
   */
  readonly conflict = observable.box<SaveConflict | undefined>(undefined);

  @observable private _resource: KubeObject | undefined;

  @computed get hasUnsavedChanges(): boolean {
    const draft = this.editingResource.draft;
    const firstDraft = this.editingResource.firstDraft;

    return Boolean(draft !== undefined && firstDraft !== undefined && draft !== firstDraft);
  }

  @computed get originalResourceVersion(): string | undefined {
    try {
      const first = yaml.load(this.editingResource.firstDraft ?? "") as RawKubeObject;

      return first?.metadata?.resourceVersion;
    } catch {
      return undefined;
    }
  }

  @computed get clusterResourceVersion(): string | undefined {
    return this.remoteClusterResource.get()?.metadata?.resourceVersion;
  }

  @computed get isRemoteDifferentFromOriginal(): boolean {
    const remoteRv = this.clusterResourceVersion;
    const origRv = this.originalResourceVersion;

    return Boolean(remoteRv && origRv && remoteRv !== origRv);
  }

  @computed get diffOriginalYaml(): string {
    const raw = this.editingResource.firstDraft || this.configuration.value.get();

    return sanitizeYamlForDiff(raw, this.kind);
  }

  @computed get diffClusterYaml(): string {
    const remote = this.remoteClusterResource.get();

    if (!remote) {
      return "# Remote cluster version not loaded yet.\n# Click 'Diff (Live)' or 'Reload' to fetch.";
    }

    return sanitizeYamlForDiff(yaml.dump(remote), this.kind);
  }

  @computed get diffModifiedYaml(): string {
    const current = this.configuration.value.get();
    const base = this.diffMode.get() === "diff-cluster" ? this.diffClusterYaml : this.diffOriginalYaml;

    return sanitizeYamlForDiff(current, this.kind, base);
  }

  @computed get diffOriginalTitle(): string {
    const mode = this.diffMode.get();

    if (mode === "diff-cluster") {
      const rv = this.clusterResourceVersion;
      const status = this.isRemoteDifferentFromOriginal ? " [MODIFIED ON CLUSTER]" : " [in sync with loaded]";

      return `Cluster Version${rv ? ` (rv: ${rv})` : ""}${status}`;
    }

    const rv = this.originalResourceVersion;

    return `Originally Loaded${rv ? ` (rv: ${rv})` : ""}`;
  }

  @computed get diffModifiedTitle(): string {
    const status = this.hasUnsavedChanges ? " [Unsaved Changes]" : " [Clean]";

    return `Your Draft${status}`;
  }

  @computed get shouldShowErrorAboutNoResource() {
    return !this._resource;
  }

  @computed get resource() {
    assert(this._resource, "Resource does not have data");

    return this._resource;
  }

  @computed get editingResource() {
    const resource = this.dependencies.store.getData(this.dependencies.tabId);

    assert(resource, "Resource is not present in the store");

    return resource;
  }

  @computed private get selfLink() {
    return this.editingResource.resource;
  }

  load = async (): Promise<void> => {
    await this.dependencies.waitForEditingResource();

    let result = await this.dependencies.requestKubeResource(this.selfLink);

    if (!result.callWasSuccessful) {
      return void this.dependencies.showErrorNotification(`Loading resource failed: ${result.error}`);
    }

    if (result?.response?.metadata.labels?.[EditResourceLabelName]) {
      const parsed = parseKubeApi(this.selfLink);

      if (!parsed) {
        return void this.dependencies.showErrorNotification(`Object's selfLink is invalid: "${this.selfLink}"`);
      }

      parsed.apiVersion = result.response.metadata.labels[EditResourceLabelName];

      result = await this.dependencies.requestKubeResource(createKubeApiURL(parsed));
    }

    if (!result.callWasSuccessful) {
      return void this.dependencies.showErrorNotification(`Loading resource failed: ${result.error}`);
    }

    const resource = result.response;

    runInAction(() => {
      this._resource = resource;
    });

    if (!resource) {
      return;
    }

    runInAction(() => {
      this.editingResource.firstDraft = yaml.dump(resource.toPlainObject());
    });
  };

  get namespace() {
    return this.resource.metadata.namespace || "default";
  }

  get name() {
    return this.resource.metadata.name;
  }

  get kind() {
    return this.resource.kind;
  }

  setDiffMode = action((mode: "normal" | "diff-original" | "diff-cluster") => {
    this.diffMode.set(mode);

    if (mode === "diff-cluster" && !this.remoteClusterResource.get() && !this.isBusy.get()) {
      void this.fetchClusterVersion();
    }
  });

  /**
   * Explicitly fetches the current cluster version for live diffing without modifying local drafts.
   */
  fetchClusterVersion = async (): Promise<boolean> => {
    runInAction(() => {
      this.isBusy.set(true);
    });

    try {
      const result = await this.dependencies.requestKubeResource(this.selfLink);

      if (!result.callWasSuccessful || !result.response) {
        const errorMsg = !result.callWasSuccessful ? result.error : "No response from cluster";

        runInAction(() => {
          this.remoteClusterResource.set(undefined);
          this.remoteClusterFetchError.set(errorMsg);
        });
        this.dependencies.showErrorNotification(
          `Could not fetch cluster version: ${errorMsg}`,
        );

        return false;
      }

      const remoteObj = result.response.toPlainObject() as RawKubeObject;

      runInAction(() => {
        this.remoteClusterResource.set(remoteObj);
        this.remoteClusterFetchError.set(undefined);
        this.remoteClusterFetchedAt.set(new Date());
      });

      return true;
    } finally {
      runInAction(() => {
        this.isBusy.set(false);
      });
    }
  };

  /**
   * Discards local modifications and reverts to the originally loaded firstDraft.
   * If there are unsaved changes, asks user confirmation before proceeding.
   */
  revertToOriginal = async (): Promise<boolean> => {
    if (this.hasUnsavedChanges && this.dependencies.confirm) {
      const confirmed = await this.dependencies.confirm({
        message: "Are you sure you want to discard your local modifications and revert to the originally loaded version?",
        labelOk: "Discard Changes",
        labelCancel: "Keep Editing",
      });

      if (!confirmed) {
        return false;
      }
    }

    runInAction(() => {
      this.editingResource.draft = this.editingResource.firstDraft;
      this.conflict.set(undefined);
      this.configuration.error.value.set("");
    });

    this.dependencies.showSuccessNotification("Local changes discarded. Reverted to originally loaded version.");

    return true;
  };

  /**
   * Reloads the latest version directly from the Kubernetes cluster.
   * If there are unsaved changes, prompts the user before overwriting.
   */
  reloadFromCluster = async (): Promise<boolean> => {
    if (this.hasUnsavedChanges && this.dependencies.confirm) {
      const confirmed = await this.dependencies.confirm({
        message: "You have unsaved changes. Discard your modifications and reload the latest version from the cluster?",
        labelOk: "Reload from Cluster",
        labelCancel: "Keep Editing",
      });

      if (!confirmed) {
        return false;
      }
    }

    runInAction(() => {
      this.isBusy.set(true);
    });

    try {
      const result = await this.dependencies.requestKubeResource(this.selfLink);

      if (!result.callWasSuccessful || !result.response) {
        const errorMsg = !result.callWasSuccessful ? result.error : "No response from cluster";

        this.dependencies.showErrorNotification(
          `Could not reload from cluster: ${errorMsg}`,
        );

        return false;
      }

      const freshObject = result.response.toPlainObject() as RawKubeObject;
      const freshYaml = yaml.dump(freshObject);

      runInAction(() => {
        this._resource = result.response;
        this.editingResource.firstDraft = freshYaml;
        this.editingResource.draft = freshYaml;
        this.remoteClusterResource.set(freshObject);
        this.remoteClusterFetchError.set(undefined);
        this.remoteClusterFetchedAt.set(new Date());
        this.conflict.set(undefined);
        this.configuration.error.value.set("");
      });

      this.dependencies.showSuccessNotification(
        `Reloaded latest version from cluster${freshObject.metadata?.resourceVersion ? ` (resourceVersion: ${freshObject.metadata.resourceVersion})` : ""}.`,
      );

      return true;
    } finally {
      runInAction(() => {
        this.isBusy.set(false);
      });
    }
  };

  save = async () => {
    const currentValue = this.configuration.value.get();
    const validation = validateKubernetesResourceYaml(currentValue);

    if (!validation.valid) {
      this.dependencies.showErrorNotification((
        <p>
          Cannot save resource: {validation.error}
        </p>
      ));

      return null;
    }

    const currentVersion = yaml.load(currentValue) as RawKubeObject;
    const firstVersion = yaml.load(this.editingResource.firstDraft ?? currentValue) as RawKubeObject;
    const selfLink = getEditSelfLinkFor(firstVersion);

    if (!selfLink) {
      this.dependencies.showErrorNotification((
        <p>
          {`Cannot save resource, unknown selfLink: "${currentVersion.metadata.selfLink}"`}
        </p>
      ));

      return null;
    }

    const userChanges = getUserChanges(firstVersion, currentVersion);
    const result = usesOptimisticReplace(currentVersion)
      ? await this.replace(selfLink, currentVersion, firstVersion)
      : await this.patchWithPreconditions(selfLink, firstVersion, currentVersion);

    if (!result) {
      return null;
    }

    if (!result.callWasSuccessful) {
      if ("isConflict" in result && result.isConflict) {
        await this.reportConflict(selfLink, firstVersion, currentVersion);
      } else {
        this.dependencies.showErrorNotification((
          <p>
            Failed to save resource:
            {" "}
            {result.error}
          </p>
        ));
      }

      return null;
    }

    runInAction(() => this.conflict.set(undefined));

    return this.verifySaved(selfLink, currentVersion, userChanges);
  };

  /**
   * Explicit user action after a conflict: re-applies the local edits on top of the
   * current cluster version, which then becomes the new base for the next save.
   */
  rebaseOnClusterVersion = async () => {
    const currentVersion = yaml.load(this.configuration.value.get()) as RawKubeObject;
    const firstVersion = yaml.load(this.editingResource.firstDraft ?? "") as RawKubeObject;
    const selfLink = getEditSelfLinkFor(currentVersion);
    const remote = selfLink ? await this.dependencies.requestKubeResource(selfLink) : undefined;

    if (!remote?.callWasSuccessful || !remote.response) {
      this.dependencies.showErrorNotification(`Could not read the current cluster version${remote && !remote.callWasSuccessful ? `: ${remote.error}` : ""}`);

      return;
    }

    const remoteObject = remote.response.toPlainObject();
    const rebased = JSON.parse(JSON.stringify(remoteObject)) as RawKubeObject;
    const failedOperations = applyPatch(rebased, getUserChanges(firstVersion, currentVersion)).filter(Boolean);

    if (failedOperations.length > 0) {
      this.dependencies.showErrorNotification("Your changes could not be re-applied automatically. Your draft was kept unchanged.");

      return;
    }

    runInAction(() => {
      this._resource = remote.response;
      this.editingResource.firstDraft = yaml.dump(remoteObject);
      this.editingResource.draft = yaml.dump(rebased);
      this.conflict.set(undefined);
    });
  };

  private async replace(selfLink: string, currentVersion: RawKubeObject, firstVersion: RawKubeObject) {
    const originalResourceVersion = (firstVersion.metadata as { resourceVersion?: string }).resourceVersion;

    if (!originalResourceVersion) {
      this.dependencies.showErrorNotification("Cannot save resource: the originally loaded resourceVersion is unknown. Reopen the resource and try again.");

      return undefined;
    }

    return this.dependencies.requestReplaceKubeResource(selfLink, prepareForReplace(currentVersion, originalResourceVersion));
  }

  private async patchWithPreconditions(selfLink: string, firstVersion: RawKubeObject, currentVersion: RawKubeObject) {
    // A GET after saving cannot protect against a concurrent PATCH. Check the loaded
    // resourceVersion atomically at the API server before applying any user edits.
    const originalMetadata = firstVersion.metadata as { resourceVersion?: string; uid?: string };

    if (!originalMetadata.resourceVersion) {
      this.dependencies.showErrorNotification("Cannot save resource: the originally loaded resourceVersion is unknown. Reopen the resource and try again.");

      return undefined;
    }

    const preconditions: JsonPatch = [
      { op: "test", path: "/metadata/resourceVersion", value: originalMetadata.resourceVersion },
    ];

    if (originalMetadata.uid) {
      preconditions.push({ op: "test", path: "/metadata/uid", value: originalMetadata.uid });
    }

    // Ignore user edits to server-managed metadata and status, not only the
    // resourceVersion: those are not valid updates from the YAML editor.
    return this.dependencies.requestPatchKubeResource(selfLink, [
      ...preconditions,
      ...getUserChanges(firstVersion, currentVersion),
    ]);
  }

  private async reportConflict(selfLink: string, firstVersion: RawKubeObject, currentVersion: RawKubeObject) {
    const remote = await this.dependencies.requestKubeResource(selfLink);
    const remoteObject = remote.callWasSuccessful ? remote.response?.toPlainObject() : undefined;

    runInAction(() => this.conflict.set(describeConflict(firstVersion, currentVersion, remoteObject)));

    this.dependencies.showErrorNotification((
      <p>
        {`${currentVersion.kind} `}
        <b>{currentVersion.metadata.name}</b>
        {" was modified in the cluster after it was opened. Your changes were NOT saved and your draft was kept."}
      </p>
    ));
  }

  private async verifySaved(selfLink: string, currentVersion: RawKubeObject, userChanges: ReturnType<typeof getUserChanges>) {
    const { kind, metadata: { name }} = currentVersion;
    const readBack = await this.dependencies.requestKubeResource(selfLink);

    if (!readBack.callWasSuccessful || !readBack.response) {
      this.dependencies.showErrorNotification((
        <p>
          {`${kind} `}
          <b>{name}</b>
          {` was accepted by the API server, but it could not be verified${readBack.callWasSuccessful ? "" : `: ${readBack.error}`}. Reopen it before editing again.`}
        </p>
      ));

      return null;
    }

    const persisted = readBack.response.toPlainObject();
    const unpersisted = findUnpersistedChanges(currentVersion, persisted, userChanges);

    runInAction(() => {
      this._resource = readBack.response;
      this.editingResource.firstDraft = yaml.dump(persisted);
      this.editingResource.draft = yaml.dump(persisted);
    });

    if (unpersisted.length > 0) {
      this.dependencies.showErrorNotification((
        <p>
          {`${kind} `}
          <b>{name}</b>
          {` was saved, but the cluster state differs from your edit at: ${unpersisted.join(", ")}. The editor now shows the persisted version.`}
        </p>
      ));

      return null;
    }

    this.dependencies.showSuccessNotification(
      <p>
        {kind}
        {" "}
        <b>{name}</b>
        {" saved and verified."}
      </p>,
    );

    // NOTE: This is required for `saveAndClose` to work correctly
    return [];
  }
}
