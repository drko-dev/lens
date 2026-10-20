/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { render, fireEvent } from "@testing-library/react";
import { observable } from "mobx";
import yaml from "js-yaml";
import { KubeObject } from "@openlens/kube-object";
import { NonInjectedEditResource } from "./view";
import { EditResourceModel } from "./edit-resource-model/edit-resource-model.injectable";
import type { EditingResource, EditResourceTabStore } from "./store";

jest.mock("../editor-panel", () => ({
  EditorPanel: ({ tabId, value }: any) => (
    <div data-testid={`editor-panel-for-${tabId}`}>
      <textarea data-testid="editor-panel-textarea" value={value} readOnly />
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
      <textarea data-testid="diff-orig-text" value={original} readOnly />
      <div data-testid="diff-mod-title">{modifiedTitle}</div>
      <textarea data-testid="diff-mod-text" value={modified} readOnly />
    </div>
  ),
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
    const updatedYaml = yaml.dump({ ...mockDeployment, spec: { replicas: 10 } });

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
});
