/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React, { useEffect } from "react";
import { observer } from "mobx-react";
import { reaction } from "mobx";
import { Spinner } from "../../spinner";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { EditResourceModel } from "./edit-resource-model/edit-resource-model.injectable";
import editResourceModelInjectable from "./edit-resource-model/edit-resource-model.injectable";
import type { DraftValidationStatus } from "./edit-resource-model/dry-run-validation";
import { updateDryRunMarkers } from "./edit-resource-model/dry-run-markers";
import { EditorPanel } from "../editor-panel";
import { InfoPanel } from "../info-panel";
import { Badge } from "../../badge";
import { ToolContextHeader } from "../tool-context-header";
import { getClusterEnvironmentConfig } from "../../../../common/cluster/environment-types";
import type { Cluster } from "../../../../common/cluster/cluster";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import { Notice } from "../../extensions/notice";
import { Button } from "@openlens/button";
import { MonacoDiffEditor } from "../../monaco-editor";

export interface EditResourceProps {
  tabId: string;
}

interface Dependencies {
  model: EditResourceModel;
  hostedCluster?: Cluster;
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

const DRY_RUN_STATUS_LABELS: Record<DraftValidationStatus, string> = {
  "not-validated": "Not Validated",
  "validating": "Validating…",
  "passed": "Validation Passed",
  "failed": "Validation Failed",
  "unavailable": "Validation Unavailable",
};

const DRY_RUN_STATUS_TESTIDS: Record<DraftValidationStatus, string> = {
  "not-validated": "not-validated",
  "validating": "validating",
  "passed": "validation-passed",
  "failed": "validation-failed",
  "unavailable": "validation-unavailable",
};

const DRY_RUN_ERROR_KIND_LABELS: Record<string, string> = {
  "malformed-yaml": "Malformed YAML",
  "bad-request": "Bad request (400)",
  "forbidden": "Forbidden (403)",
  "not-found": "Not found (404)",
  "conflict": "Version conflict (409)",
  "invalid": "Rejected by validation (422)",
  "admission-denied": "Rejected by admission webhook",
  "connection": "Connection or timeout error",
  "context-mismatch": "Blocked by cluster context mismatch",
  "unknown": "Validation error",
};

const DryRunStatusBadge = observer(({ model, tabId }: { model: EditResourceModel; tabId: string }) => {
  const status = model.draftValidation.get().status;

  const styleByStatus: Record<DraftValidationStatus, React.CSSProperties> = {
    "not-validated": { opacity: 0.7 },
    "validating": { backgroundColor: "var(--colorInfo)", color: "#fff" },
    "passed": { backgroundColor: "#10B981", color: "#fff", fontWeight: 600 },
    "failed": { backgroundColor: "var(--colorError)", color: "#fff", fontWeight: 600 },
    "unavailable": { backgroundColor: "var(--colorWarning)", color: "#111", fontWeight: 600 },
  };

  return (
    <Badge
      label={DRY_RUN_STATUS_LABELS[status]}
      data-testid={`dry-run-${DRY_RUN_STATUS_TESTIDS[status]}-status-for-${tabId}`}
      style={styleByStatus[status]}
    />
  );
});

/**
 * Keeps Monaco markers in sync with the latest dry-run validation result.
 * Rendered as a null component; exists purely for the reaction lifetime.
 */
const DryRunMarkersBinding = observer(({ model, tabId }: { model: EditResourceModel; tabId: string }) => {
  useEffect(() => (
    reaction(
      () => ({
        validation: model.draftValidation.get(),
        draft: model.configuration.value.get(),
        editorMode: model.diffMode.get() === "normal",
      }),
      ({ validation, draft, editorMode }) => {
        updateDryRunMarkers(tabId, draft, validation, editorMode);
      },
    )
  ), [model, tabId]);

  return null;
});

const DraftValidationNotice = observer(({ model, tabId }: { model: EditResourceModel; tabId: string }) => {
  const validation = model.draftValidation.get();

  if (validation.status === "not-validated" || validation.status === "validating") {
    return null;
  }

  const metaParts = [
    validation.clusterName ? `Cluster: ${validation.clusterName}` : undefined,
    validation.resourceKind && validation.resourceName ? `Resource: ${validation.resourceKind}/${validation.resourceName}` : undefined,
    validation.validatedAt ? `Checked: ${new Date(validation.validatedAt).toLocaleTimeString()}` : undefined,
    validation.requestMethod ? `Request: ${validation.requestMethod.toUpperCase()} ?dryRun=All` : undefined,
  ].filter(Boolean);

  const prodAccent = validation.isProduction ? { borderLeft: "3px solid #EF4444" } : undefined;

  if (validation.status === "passed") {
    return (
      <div
        className="flex column gaps"
        data-testid={`dry-run-passed-notice-for-${tabId}`}
        style={{ padding: "var(--padding)", background: "rgba(16, 185, 129, 0.12)", borderLeft: "3px solid #10B981", ...prodAccent }}
      >
        <b style={{ color: "#10B981" }}>Server-side dry-run accepted by Kubernetes</b>
        <span data-testid={`dry-run-notice-meta-for-${tabId}`}>{metaParts.join(" • ")}</span>
        <span style={{ opacity: 0.8 }}>
          The resource was NOT saved. Nothing was persisted: this only proves the API server would accept this draft as-is.
        </span>
      </div>
    );
  }

  const failed = validation.status === "failed";

  return (
    <div
      className="flex column gaps"
      data-testid={`dry-run-${failed ? "failed" : "unavailable"}-notice-for-${tabId}`}
      style={{
        padding: "var(--padding)",
        background: failed ? "rgba(239, 68, 68, 0.10)" : "rgba(245, 158, 11, 0.12)",
        borderLeft: `3px solid ${failed ? "#EF4444" : "#242424"}`,
        ...prodAccent,
      }}
    >
      <b style={{ color: failed ? "#EF4444" : "#242424" }}>
        {failed
          ? `Validation failed — ${DRY_RUN_ERROR_KIND_LABELS[validation.errorKind ?? "unknown"] ?? "Validation error"}`
          : "Validation unavailable"}
        {validation.isProduction ? " (validated against a PRODUCTION cluster)" : ""}
      </b>
      {validation.message && <span data-testid={`dry-run-notice-message-for-${tabId}`}>{validation.message}</span>}
      {(validation.causes ?? []).length > 0 && (
        <ul data-testid={`dry-run-notice-causes-for-${tabId}`} style={{ margin: 0, paddingLeft: "20px" }}>
          {(validation.causes ?? []).map((cause, index) => (
            <li key={index}>
              {cause.field ? (
                <b>
                  {cause.field}
                  {": "}
                </b>
              ) : null}
              {cause.message}
            </li>
          ))}
        </ul>
      )}
      <span style={{ opacity: 0.8 }}>
        The draft was not modified and nothing was saved. Fix the draft and validate again.
      </span>
    </div>
  );
});

const EditResourceControls = observer(({ model, tabId }: { model: EditResourceModel; tabId: string; hostedCluster?: Cluster }) => {
  const diffMode = model.diffMode.get();
  const isBusy = model.isBusy.get();
  const hasUnsaved = model.hasUnsavedChanges;
  const validationStatus = model.draftValidation.get().status;

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

      <DryRunStatusBadge model={model} tabId={tabId} />

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

      {/* Server-side dry-run validation */}
      <Button
        plain
        label="Validate — Server Dry-Run"
        disabled={isBusy || validationStatus === "validating"}
        data-testid={`validate-dry-run-for-${tabId}`}
        onClick={() => void model.validateDraft()}
      />

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
  hostedCluster,
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
            <ToolContextHeader
              data-testid={`edit-resource-cluster-context-${tabId}`}
              clusterName={model.clusterName || "Cluster"}
              environment={getClusterEnvironmentConfig(hostedCluster?.preferences)}
              actions={model.isProduction && (
                <span data-testid={`edit-resource-prod-hazard-${tabId}`} style={{ fontSize: "var(--fs-xs)", color: "var(--text-2)" }}>
                  Production — Guarded
                </span>
              )}
            />
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
              controls={(
                <EditResourceControls
                  model={model}
                  tabId={tabId}
                  hostedCluster={hostedCluster} />
              )}
            />
            <SaveConflictNotice model={model} tabId={tabId} />
            <DraftValidationNotice model={model} tabId={tabId} />
            <DryRunMarkersBinding model={model} tabId={tabId} />
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
    hostedCluster: di.inject(hostedClusterInjectable),
  }),
});
