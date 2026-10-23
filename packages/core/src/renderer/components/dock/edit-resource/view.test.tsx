/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { render, fireEvent } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import yaml from "js-yaml";
import { KubeObject } from "@openlens/kube-object";
import { NonInjectedEditResource } from "./view";
import { EditResourceModel } from "./edit-resource-model/edit-resource-model.injectable";
import type { EditingResource, EditResourceTabStore } from "./store";

jest.mock("../editor-panel", () => ({
  EditorPanel: ({ tabId, value }: any) => (
    <div data-testid={`editor-panel-for-${tabId}`}>
      <textarea
        data-testid="editor-panel-textarea"
        value={value}
        readOnly />
    </div>
  ),
}));

jest.mock("../info-panel", () => ({
  InfoPanel: ({ controls, submit, submitLabel }: any) => (
    <div data-testid="mock-info-panel">
      <div data-testid="info-panel-controls">{controls}</div>
      <button data-testid="mock-submit-btn" onClick={submit}>{submitLabel}</button>
    </div>
  ),
}));

jest.mock("../../monaco-editor", () => ({
  MonacoDiffEditor: ({ original, modified, originalTitle, modifiedTitle }: any) => (
    <div data-testid="mock-diff-editor">
      <div data-testid="diff-orig-title">{originalTitle}</div>
      <textarea
        data-testid="diff-orig-text"
        value={original}
        readOnly />
      <div data-testid="diff-mod-title">{modifiedTitle}</div>
      <textarea
        data-testid="diff-mod-text"
        value={modified}
        readOnly />
    </div>
  ),
}));

jest.mock("./edit-resource-model/dry-run-markers", () => ({
  updateDryRunMarkers: jest.fn(),
  clearDryRunMarkers: jest.fn(),
}));

const mockDeployment = {
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: {
    name: "web-deploy",
    namespace: "production",
    resourceVersion: "100",
    uid: "uid-deploy-1",
    selfLink: "/apis/apps/v1/namespaces/production/deployments/web-deploy",
  },
  spec: {
    replicas: 3,
  },
};

const setupModel = async () => {
  const editing = observable<EditingResource>({
    resource: mockDeployment.metadata.selfLink,
  });
  const deps = {
    requestKubeResource: jest.fn().mockResolvedValue({
      callWasSuccessful: true,
      response: new KubeObject(mockDeployment as any),
    }),
    requestPatchKubeResource: jest.fn(),
    requestReplaceKubeResource: jest.fn(),
    showSuccessNotification: jest.fn(),
    showErrorNotification: jest.fn(),
    confirm: jest.fn(),
    store: { getData: () => editing } as unknown as EditResourceTabStore,
    tabId: "tab-view-test",
    waitForEditingResource: async () => editing,
  };

  const model = new EditResourceModel(deps);

  await model.load();

  return { model, deps, editing };
};

describe("EditResource View Component (R2-02 Controls)", () => {
  it("renders Kind, Name, and Namespace badges", async () => {
    const { model } = await setupModel();
    const { getByText } = render(<NonInjectedEditResource model={model} tabId="tab-view-test" />);

    expect(getByText("Deployment")).toBeInTheDocument();
    expect(getByText("web-deploy")).toBeInTheDocument();
    expect(getByText("production")).toBeInTheDocument();
  });

  it("renders 'In Sync' status when clean, and 'Unsaved Changes' when draft differs", async () => {
    const { model } = await setupModel();
    const { getByTestId, queryByTestId } = render(
      <NonInjectedEditResource model={model} tabId="tab-view-test" />,
    );

    expect(getByTestId("insync-status-for-tab-view-test")).toBeInTheDocument();
    expect(queryByTestId("unsaved-status-for-tab-view-test")).not.toBeInTheDocument();

    // Modify draft
    model.configuration.onChange("apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web-deploy\nspec:\n  replicas: 5");

    expect(queryByTestId("insync-status-for-tab-view-test")).not.toBeInTheDocument();
    expect(getByTestId("unsaved-status-for-tab-view-test")).toBeInTheDocument();
  });

  it("allows switching between Editor mode and Diff mode", async () => {
    const { model } = await setupModel();
    const { getByTestId, queryByTestId } = render(
      <NonInjectedEditResource model={model} tabId="tab-view-test" />,
    );

    // Default mode is EditorPanel
    expect(getByTestId("editor-panel-for-tab-view-test")).toBeInTheDocument();
    expect(queryByTestId("mock-diff-editor")).not.toBeInTheDocument();

    // Click Diff (Original)
    fireEvent.click(getByTestId("mode-diff-original-for-tab-view-test"));

    expect(queryByTestId("editor-panel-for-tab-view-test")).not.toBeInTheDocument();
    expect(getByTestId("mock-diff-editor")).toBeInTheDocument();
    expect(getByTestId("diff-orig-title")).toHaveTextContent("Originally Loaded (rv: 100)");

    // Switch back to Editor
    fireEvent.click(getByTestId("mode-normal-for-tab-view-test"));

    expect(getByTestId("editor-panel-for-tab-view-test")).toBeInTheDocument();
    expect(queryByTestId("mock-diff-editor")).not.toBeInTheDocument();
  });

  it("disables Revert button when clean, enables when dirty, and calls revertToOriginal on click", async () => {
    const { model } = await setupModel();
    const revertSpy = jest.spyOn(model, "revertToOriginal");
    const { getByTestId } = render(
      <NonInjectedEditResource model={model} tabId="tab-view-test" />,
    );

    const revertBtn = getByTestId("revert-for-tab-view-test");

    expect(revertBtn).toBeDisabled();

    // Edit draft
    const updatedYaml = yaml.dump({ ...mockDeployment, spec: { replicas: 10 }});

    model.configuration.onChange(updatedYaml);

    expect(revertBtn).not.toBeDisabled();

    fireEvent.click(revertBtn);

    expect(revertSpy).toHaveBeenCalledTimes(1);
  });

  it("calls reloadFromCluster when clicking Reload", async () => {
    const { model } = await setupModel();
    const reloadSpy = jest.spyOn(model, "reloadFromCluster");
    const { getByTestId } = render(
      <NonInjectedEditResource model={model} tabId="tab-view-test" />,
    );

    const reloadBtn = getByTestId("reload-for-tab-view-test");

    expect(reloadBtn).not.toBeDisabled();

    fireEvent.click(reloadBtn);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  describe("EditResource View — Server Dry-Run validation (R7-02)", () => {
    it("renders the Validate — Server Dry-Run action and starts as Not Validated", async () => {
      const { model } = await setupModel();
      const { getByTestId, getByText } = render(
        <NonInjectedEditResource model={model} tabId="tab-view-test" />,
      );

      expect(getByText("Validate — Server Dry-Run")).toBeInTheDocument();
      expect(getByTestId("dry-run-not-validated-status-for-tab-view-test")).toBeInTheDocument();
    });

    it("calls validateDraft when clicking the Validate action", async () => {
      const { model } = await setupModel();
      const validateSpy = jest.spyOn(model, "validateDraft").mockResolvedValue(undefined);
      const { getByTestId } = render(
        <NonInjectedEditResource model={model} tabId="tab-view-test" />,
      );

      fireEvent.click(getByTestId("validate-dry-run-for-tab-view-test"));

      expect(validateSpy).toHaveBeenCalledTimes(1);
    });

    it("shows the accepted banner without claiming the resource was saved", async () => {
      const { model } = await setupModel();
      const { getByTestId, getByText } = render(
        <NonInjectedEditResource model={model} tabId="tab-view-test" />,
      );

      runInAction(() => {
        model.draftValidation.set({
          status: "passed",
          message: "Server-side dry-run accepted by Kubernetes",
          clusterName: "test-cluster-1",
          resourceKind: "Deployment",
          resourceName: "web-deploy",
          requestMethod: "patch",
          validatedAt: new Date().toISOString(),
        });
      });

      expect(getByTestId("dry-run-passed-notice-for-tab-view-test")).toBeInTheDocument();
      expect(getByText("Server-side dry-run accepted by Kubernetes")).toBeInTheDocument();
      expect(getByTestId("dry-run-notice-meta-for-tab-view-test")).toHaveTextContent("Cluster: test-cluster-1");
      expect(getByTestId("dry-run-notice-meta-for-tab-view-test")).toHaveTextContent("Deployment/web-deploy");
      expect(getByTestId("dry-run-notice-meta-for-tab-view-test")).toHaveTextContent("PATCH ?dryRun=All");
      expect(getByTestId("dry-run-passed-notice-for-tab-view-test")).toHaveTextContent("NOT saved");
      expect(getByTestId("dry-run-validation-passed-status-for-tab-view-test")).toBeInTheDocument();
    });

    it("shows the failure banner with classification and structured causes", async () => {
      const { model } = await setupModel();
      const { getByTestId } = render(
        <NonInjectedEditResource model={model} tabId="tab-view-test" />,
      );

      runInAction(() => {
        model.draftValidation.set({
          status: "failed",
          errorKind: "invalid",
          statusCode: 422,
          message: "Deployment.apps \"web-deploy\" is invalid",
          causes: [{ field: "spec.replicas", message: "must be greater than or equal to 0" }],
          clusterName: "test-cluster-1",
          validatedAt: new Date().toISOString(),
        });
      });

      expect(getByTestId("dry-run-failed-notice-for-tab-view-test")).toBeInTheDocument();
      expect(getByTestId("dry-run-notice-message-for-tab-view-test")).toHaveTextContent("is invalid");
      expect(getByTestId("dry-run-notice-causes-for-tab-view-test")).toHaveTextContent("spec.replicas");
      expect(getByTestId("dry-run-validation-failed-status-for-tab-view-test")).toBeInTheDocument();
    });

    it("marks the banner as PRODUCTION when validated against a prod cluster", async () => {
      const editing = observable<EditingResource>({ resource: mockDeployment.metadata.selfLink });
      const deps = {
        requestKubeResource: jest.fn().mockResolvedValue({
          callWasSuccessful: true,
          response: new KubeObject(mockDeployment as any),
        }),
        requestPatchKubeResource: jest.fn(),
        requestReplaceKubeResource: jest.fn(),
        showSuccessNotification: jest.fn(),
        showErrorNotification: jest.fn(),
        confirm: jest.fn(),
        store: { getData: () => editing } as unknown as EditResourceTabStore,
        tabId: "tab-view-test",
        waitForEditingResource: async () => editing,
        hostedCluster: { id: "prod-cluster", name: "prod-cluster", preferences: {}} as any,
      };
      const model = new EditResourceModel(deps);

      await model.load();

      const { getByTestId } = render(
        <NonInjectedEditResource model={model} tabId="tab-view-test" />,
      );

      runInAction(() => {
        model.draftValidation.set({
          status: "failed",
          errorKind: "forbidden",
          message: "forbidden",
          clusterName: "prod-cluster",
          isProduction: true,
          validatedAt: new Date().toISOString(),
        });
      });

      expect(getByTestId("dry-run-failed-notice-for-tab-view-test")).toHaveTextContent("PRODUCTION cluster");
    });

    it("never renders Secret values echoed by the server", async () => {
      const secretLink = "/api/v1/namespaces/default/secrets/app-secret";
      const previousPassword = "b2xkLXNlY3JldA==";
      const currentPassword = "bmV3LXNlY3JldA==";
      const secret = {
        apiVersion: "v1",
        kind: "Secret",
        type: "Opaque",
        metadata: {
          name: "app-secret",
          namespace: "default",
          resourceVersion: "7",
          uid: "uid-secret-1",
          selfLink: secretLink,
        },
        data: { password: previousPassword },
      };
      const editing = observable<EditingResource>({ resource: secretLink });
      const deps = {
        requestKubeResource: jest.fn().mockResolvedValue({
          callWasSuccessful: true,
          response: new KubeObject(secret as any),
        }),
        requestPatchKubeResource: jest.fn(),
        requestReplaceKubeResource: jest.fn().mockResolvedValue({
          callWasSuccessful: false,
          error: "invalid secret",
          isConflict: false,
          errorPayload: {
            code: 422,
            reason: `Invalid ${previousPassword}`,
            message: `${previousPassword} and ${currentPassword} are invalid`,
            details: { causes: [{ field: `data.${previousPassword}`, message: `${currentPassword} rejected` }] },
          },
        }),
        showSuccessNotification: jest.fn(),
        showErrorNotification: jest.fn(),
        confirm: jest.fn(),
        store: { getData: () => editing } as unknown as EditResourceTabStore,
        tabId: "tab-view-test",
        waitForEditingResource: async () => editing,
        hostedCluster: { id: "test-cluster-1", name: "test-cluster-1", preferences: {}} as any,
      };
      const model = new EditResourceModel(deps);

      await model.load();
      model.configuration.onChange(yaml.dump({ ...secret, data: { password: currentPassword }}));

      await model.validateDraft();

      const { getByTestId } = render(
        <NonInjectedEditResource model={model} tabId="tab-view-test" />,
      );

      // The editor itself still shows the user's own draft; the validation
      // result must never echo the values back.
      const notice = getByTestId("dry-run-failed-notice-for-tab-view-test");

      expect(model.draftValidation.get().status).toBe("failed");
      expect(notice.textContent).not.toContain(previousPassword);
      expect(notice.textContent).not.toContain(currentPassword);
      expect(notice.textContent).toContain("<redacted>");
    });

    it("resets the banner to Not Validated when the draft is edited", async () => {
      const { model } = await setupModel();
      const { getByTestId, queryByTestId } = render(
        <NonInjectedEditResource model={model} tabId="tab-view-test" />,
      );

      runInAction(() => {
        model.draftValidation.set({ status: "passed", message: "ok", validatedAt: new Date().toISOString() });
      });

      expect(getByTestId("dry-run-passed-notice-for-tab-view-test")).toBeInTheDocument();

      model.configuration.onChange(yaml.dump({ ...mockDeployment, spec: { replicas: 9 }}));

      expect(queryByTestId("dry-run-passed-notice-for-tab-view-test")).not.toBeInTheDocument();
      expect(getByTestId("dry-run-not-validated-status-for-tab-view-test")).toBeInTheDocument();
    });
  });
});
