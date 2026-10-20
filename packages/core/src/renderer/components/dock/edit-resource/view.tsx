/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { observer } from "mobx-react";
import { Spinner } from "../../spinner";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { EditResourceModel } from "./edit-resource-model/edit-resource-model.injectable";
import editResourceModelInjectable from "./edit-resource-model/edit-resource-model.injectable";
import { EditorPanel } from "../editor-panel";
import { InfoPanel } from "../info-panel";
import { Badge } from "../../badge";
import { Notice } from "../../extensions/notice";
import { Button } from "@openlens/button";
import { MonacoDiffEditor } from "../../monaco-editor";

export interface EditResourceProps {
  tabId: string;
}

interface Dependencies {
  model: EditResourceModel;
}

const formatPaths = (paths: string[] | undefined) => (
  paths === undefined
    ? "unknown (could not read the cluster version)"
    : paths.join(", ") || "none"
);

const SaveConflictNotice = observer(({ model, tabId }: { model: EditResourceModel; tabId: string }) => {
  const conflict = model.conflict.get();

  if (!conflict) {
    return null;
  }

  return (
    <div
      className="flex column gaps"
      data-testid={`save-conflict-for-${tabId}`}
      style={{ padding: "var(--padding)" }}>
      <b>Conflict: this resource changed in the cluster after you opened it. Nothing was saved.</b>
      <span>{`Changed in the cluster: ${formatPaths(conflict.remoteChangedPaths)}`}</span>
      <span>{`Changed by you: ${formatPaths(conflict.localChangedPaths)}`}</span>
      {conflict.overlappingPaths.length > 0 && (
        <span>{`Overlapping (review carefully): ${formatPaths(conflict.overlappingPaths)}`}</span>
      )}
      <div>
        <Button
          primary
          label="Re-apply my changes on the cluster version"
          data-testid={`rebase-edit-resource-for-${tabId}`}
          onClick={() => void model.rebaseOnClusterVersion()}
        />
      </div>
    </div>
  );
});

const EditResourceControls = observer(({ model, tabId }: { model: EditResourceModel; tabId: string }) => {
  const diffMode = model.diffMode.get();
  const isBusy = model.isBusy.get();
  const hasUnsaved = model.hasUnsavedChanges;

  return (
    <div className="resource-info flex gaps align-center" style={{ flexWrap: "wrap" }}>
      <span>Kind:</span>
      <Badge label={model.kind} />
      <span>Name:</span>
      <Badge label={model.name} />
      <span>Namespace:</span>
      <Badge label={model.namespace} />

      <div style={{ width: "1px", height: "16px", background: "var(--border)", margin: "0 6px" }} />

      {/* Dirty / In-sync status */}
      {hasUnsaved ? (
        <Badge
          label="Unsaved Changes"
          data-testid={`unsaved-status-for-${tabId}`}
          style={{ backgroundColor: "var(--colorWarning)", color: "#111", fontWeight: 600 }}
        />
      ) : (
        <Badge
          label="In Sync"
          data-testid={`insync-status-for-${tabId}`}
          style={{ opacity: 0.7 }}
        />
      )}

      {diffMode === "diff-cluster" && model.isRemoteDifferentFromOriginal && (
        <Badge
          label="Cluster Changed"
          data-testid={`cluster-changed-status-for-${tabId}`}
          style={{ backgroundColor: "var(--colorError)", color: "#fff", fontWeight: 600 }}
        />
      )}

      <div style={{ width: "1px", height: "16px", background: "var(--border)", margin: "0 6px" }} />

      {/* Mode switcher */}
      <div className="button-group flex gaps align-center">
        <Button
          plain={diffMode !== "normal"}
          primary={diffMode === "normal"}
          label="Editor"
          data-testid={`mode-normal-for-${tabId}`}
          onClick={() => model.setDiffMode("normal")}
        />
        <Button
          plain={diffMode !== "diff-original"}
          primary={diffMode === "diff-original"}
          label="Diff (Original)"
          data-testid={`mode-diff-original-for-${tabId}`}
          onClick={() => model.setDiffMode("diff-original")}
        />
        <Button
          plain={diffMode !== "diff-cluster"}
          primary={diffMode === "diff-cluster"}
          label="Diff (Live)"
          data-testid={`mode-diff-cluster-for-${tabId}`}
          onClick={() => model.setDiffMode("diff-cluster")}
        />
      </div>

      <div style={{ width: "1px", height: "16px", background: "var(--border)", margin: "0 6px" }} />

      {/* Revert & Reload actions */}
      <Button
        plain
        label="Revert"
        disabled={!hasUnsaved || isBusy}
        data-testid={`revert-for-${tabId}`}
        onClick={() => void model.revertToOriginal()}
      />
      <Button
        plain
        label="Reload"
        disabled={isBusy}
        data-testid={`reload-for-${tabId}`}
        onClick={() => void model.reloadFromCluster()}
      />
    </div>
  );
});

export const NonInjectedEditResource = observer(({
  model,
  tabId,
}: EditResourceProps & Dependencies) => (
  <div className="EditResource flex column">
    {
      model.shouldShowErrorAboutNoResource
        ? (
          <Notice>
            Resource not found
          </Notice>
        )
        : (
          <>
            <InfoPanel
              tabId={tabId}
              error={model.configuration.error.value.get()}
              submit={model.save}
              disableSubmit={model.isBusy.get()}
              showNotifications={false}
              submitLabel="Save"
              submittingMessage="Applying..."
              submitTestId={`save-edit-resource-from-tab-for-${tabId}`}
              submitAndCloseTestId={`save-and-close-edit-resource-from-tab-for-${tabId}`}
              cancelTestId={`cancel-edit-resource-from-tab-for-${tabId}`}
              submittingTestId={`saving-edit-resource-from-tab-for-${tabId}`}
              controls={<EditResourceControls model={model} tabId={tabId} />}
            />
            <SaveConflictNotice model={model} tabId={tabId} />
            {model.diffMode.get() === "normal" ? (
              <EditorPanel
                tabId={tabId}
                value={model.configuration.value.get()}
                onChange={model.configuration.onChange}
                onError={model.configuration.error.onChange}
              />
            ) : (
              <MonacoDiffEditor
                id={tabId}
                original={
                  model.diffMode.get() === "diff-cluster"
                    ? model.diffClusterYaml
                    : model.diffOriginalYaml
                }
                modified={
                  model.kind === "Secret"
                    ? model.diffModifiedYaml
                    : model.configuration.value.get()
                }
                originalTitle={model.diffOriginalTitle}
                modifiedTitle={model.diffModifiedTitle}
                readOnlyModified={model.kind === "Secret"}
                onChange={model.configuration.onChange}
              />
            )}
          </>
        )
    }
  </div>
),
);

export const EditResource = withInjectables<Dependencies, EditResourceProps>(NonInjectedEditResource, {
  getPlaceholder: () => (
    <Spinner center data-testid="edit-resource-tab-spinner" />
  ),
  getProps: async (di, props) => ({
    ...props,
    model: await di.inject(editResourceModelInjectable, props.tabId),
  }),
});
