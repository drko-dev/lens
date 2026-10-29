/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent, waitFor } from "@testing-library/react";
import { ConfigMapDetails } from "../config-map-details";
import { ConfigMap } from "@openlens/kube-object";
import { JsonApiErrorParsed } from "@openlens/json-api";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";
import storesAndApisCanBeCreatedInjectable from "../../../stores-apis-can-be-created.injectable";
import directoryForUserDataInjectable from "../../../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import directoryForKubeConfigsInjectable from "../../../../common/app-paths/directory-for-kube-configs/directory-for-kube-configs.injectable";
import { Cluster } from "../../../../common/cluster/cluster";
import configMapStoreInjectable from "../store.injectable";
import showSuccessNotificationInjectable from "../../notifications/show-success-notification.injectable";
import showErrorNotificationInjectable from "../../notifications/show-error-notification.injectable";
import type { ConfigMapStore } from "../store";

jest.mock("../../kube-object-meta/kube-object-meta", () => ({
  KubeObjectMeta: () => null,
}));

jest.mock("../../monaco-editor", () => ({
  MonacoEditor: ({ id, value, onChange }: { id: string; value: string; onChange: (val: string) => void }) => (
    <textarea
      data-testid={`monaco-${id}`}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  ),
}));

const makeConfigMap = (overrides: {
  uid?: string;
  resourceVersion?: string;
  data?: Partial<Record<string, string>>;
} = {}) => new ConfigMap({
  apiVersion: "v1",
  kind: "ConfigMap",
  metadata: {
    name: "app-config",
    resourceVersion: overrides.resourceVersion ?? "200",
    uid: overrides.uid ?? "cm-uid-1",
    namespace: "default",
    selfLink: "/api/v1/namespaces/default/configmaps/app-config",
  },
  data: overrides.data ?? {
    LOG_LEVEL: "info",
    FEATURE_FLAG: "false",
  },
});

describe("ConfigMapDetails tests", () => {
  let showSuccessNotificationMock: jest.Mock;
  let showErrorNotificationMock: jest.Mock;
  let updateMock: jest.Mock;
  let apiGetMock: jest.Mock;

  const setupTestEnv = () => {
    const di = getDiForUnitTesting();

    showSuccessNotificationMock = jest.fn();
    showErrorNotificationMock = jest.fn();
    updateMock = jest.fn();
    apiGetMock = jest.fn();

    di.override(directoryForUserDataInjectable, () => "/some-user-data");
    di.override(directoryForKubeConfigsInjectable, () => "/some-kube-configs");
    di.override(storesAndApisCanBeCreatedInjectable, () => true);
    di.override(showSuccessNotificationInjectable, () => showSuccessNotificationMock);
    di.override(showErrorNotificationInjectable, () => showErrorNotificationMock);

    di.override(hostedClusterInjectable, () => new Cluster({
      contextName: "some-context-name",
      id: "some-cluster-id",
      kubeConfigPath: "/some-path-to-a-kubeconfig",
    }));

    di.override(configMapStoreInjectable, () => ({
      update: updateMock,
      api: {
        get: apiGetMock,
      },
      getByName: jest.fn(),
    } as unknown as ConfigMapStore));

    return {
      di,
      render: renderFor(di),
    };
  };

  it("preserves unsaved local draft when MobX reactive updates arrive for the same ConfigMap", () => {
    const { render } = setupTestEnv();
    const initialCm = makeConfigMap({
      resourceVersion: "200",
      data: {
        LOG_LEVEL: "info",
      },
    });

    const result = render(<ConfigMapDetails object={initialCm} />);
    const editor = result.getByTestId("monaco-config-map-data-LOG_LEVEL") as HTMLTextAreaElement;

    fireEvent.change(editor, { target: { value: "debug" }});
    expect(editor.value).toBe("debug");

    // Simulate store watch update for the same ConfigMap
    const watchUpdatedCm = makeConfigMap({
      resourceVersion: "201",
      data: {
        LOG_LEVEL: "warn",
      },
    });

    result.rerender(<ConfigMapDetails object={watchUpdatedCm} />);

    // Unsaved draft "debug" must NOT be overwritten
    expect(editor.value).toBe("debug");
  });

  it("detects 409 Conflict, preserves draft, shows key diff, and supports Re-apply and Reload", async () => {
    const { render } = setupTestEnv();
    const initialCm = makeConfigMap({
      resourceVersion: "200",
      data: {
        LOG_LEVEL: "info",
        FEATURE_FLAG: "false",
      },
    });

    const result = render(<ConfigMapDetails object={initialCm} />);
    const logLevelEditor = result.getByTestId("monaco-config-map-data-LOG_LEVEL") as HTMLTextAreaElement;
    const featureFlagEditor = result.getByTestId("monaco-config-map-data-FEATURE_FLAG") as HTMLTextAreaElement;

    fireEvent.change(logLevelEditor, { target: { value: "debug" }});

    const conflictError = new JsonApiErrorParsed(
      {
        kind: "Status",
        apiVersion: "v1",
        metadata: {},
        status: "Failure",
        message: "the object has been modified",
        reason: "Conflict",
        details: { name: "app-config", group: "", kind: "configmaps", causes: [] },
        code: 409,
      },
      ["the object has been modified"],
    );

    const remoteCm = makeConfigMap({
      resourceVersion: "205",
      data: {
        LOG_LEVEL: "info",
        FEATURE_FLAG: "true",
      },
    });

    updateMock.mockRejectedValueOnce(conflictError);
    apiGetMock.mockResolvedValue(remoteCm);

    fireEvent.click(result.getByTestId("save-config-map-button"));

    await waitFor(() => {
      expect(result.getByTestId("config-map-conflict-notice")).toBeInTheDocument();
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][1].metadata.resourceVersion).toBe("200");
    expect(logLevelEditor.value).toBe("debug");

    expect(result.getByTestId("config-map-conflict-remote-keys").textContent).toContain("FEATURE_FLAG");
    expect(result.getByTestId("config-map-conflict-local-keys").textContent).toContain("LOG_LEVEL");

    // Re-apply local changes onto remote version
    fireEvent.click(result.getByTestId("reapply-changes-config-map"));

    await waitFor(() => {
      expect(result.queryByTestId("config-map-conflict-notice")).toBeNull();
    });

    expect(logLevelEditor.value).toBe("debug");
    expect(featureFlagEditor.value).toBe("true");
    expect(updateMock).toHaveBeenCalledTimes(1);

    // Explicit Save now uses resourceVersion "205"
    const persistedCm = makeConfigMap({
      resourceVersion: "206",
      data: {
        LOG_LEVEL: "debug",
        FEATURE_FLAG: "true",
      },
    });

    updateMock.mockResolvedValueOnce(persistedCm);
    apiGetMock.mockResolvedValueOnce(persistedCm);

    fireEvent.click(result.getByTestId("save-config-map-button"));

    await waitFor(() => {
      expect(showSuccessNotificationMock).toHaveBeenCalledTimes(1);
    });

    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock.mock.calls[1][1].metadata.resourceVersion).toBe("205");
  });

  it("handles 403 Forbidden, 404 Not Found, and post-save unpersisted key mismatch without losing draft", async () => {
    const { render } = setupTestEnv();
    const initialCm = makeConfigMap({
      resourceVersion: "300",
      data: {
        LOG_LEVEL: "info",
      },
    });

    const result = render(<ConfigMapDetails object={initialCm} />);
    const logLevelEditor = result.getByTestId("monaco-config-map-data-LOG_LEVEL") as HTMLTextAreaElement;

    fireEvent.change(logLevelEditor, { target: { value: "trace" }});

    // 1. 403 Forbidden
    updateMock.mockRejectedValueOnce({ code: 403, reason: "Forbidden" });
    fireEvent.click(result.getByTestId("save-config-map-button"));

    await waitFor(() => {
      expect(showErrorNotificationMock).toHaveBeenCalledWith(
        expect.stringContaining("403 Forbidden"),
      );
    });
    expect(logLevelEditor.value).toBe("trace");

    // 2. 404 Not Found
    updateMock.mockRejectedValueOnce({ code: 404, reason: "NotFound" });
    fireEvent.click(result.getByTestId("save-config-map-button"));

    await waitFor(() => {
      expect(result.getByTestId("config-map-conflict-notice")).toBeInTheDocument();
    });
    expect(result.getByTestId("config-map-conflict-notice").textContent).toContain("deleted in the cluster");
    expect(logLevelEditor.value).toBe("trace");

    // 3. Post-save unpersisted key mismatch (e.g. admission webhook altered value)
    const webhookModifiedCm = makeConfigMap({
      resourceVersion: "301",
      data: {
        LOG_LEVEL: "warn",
      },
    });

    updateMock.mockResolvedValueOnce(webhookModifiedCm);
    apiGetMock.mockResolvedValueOnce(webhookModifiedCm);

    fireEvent.click(result.getByTestId("save-config-map-button"));

    await waitFor(() => {
      expect(showErrorNotificationMock).toHaveBeenCalledWith(
        expect.stringContaining("LOG_LEVEL"),
      );
    });
    expect(logLevelEditor.value).toBe("warn");
  });
});
