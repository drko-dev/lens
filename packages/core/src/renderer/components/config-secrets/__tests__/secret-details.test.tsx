/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent, waitFor } from "@testing-library/react";
import { SecretDetails } from "../secret-details";
import { Secret, SecretType } from "@openlens/kube-object";
import { JsonApiErrorParsed } from "@openlens/json-api";
import { base64 } from "@openlens/utilities";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";
import storesAndApisCanBeCreatedInjectable from "../../../stores-apis-can-be-created.injectable";
import directoryForUserDataInjectable from "../../../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import directoryForKubeConfigsInjectable from "../../../../common/app-paths/directory-for-kube-configs/directory-for-kube-configs.injectable";
import { Cluster } from "../../../../common/cluster/cluster";
import secretStoreInjectable from "../store.injectable";
import showSuccessNotificationInjectable from "../../notifications/show-success-notification.injectable";
import showErrorNotificationInjectable from "../../notifications/show-error-notification.injectable";
import showCheckedErrorNotificationInjectable from "../../notifications/show-checked-error.injectable";
import type { SecretStore } from "../store";

jest.mock("../../kube-object-meta/kube-object-meta", () => ({
  KubeObjectMeta: () => null,
}));

const makeSecret = (overrides: {
  uid?: string;
  resourceVersion?: string;
  data?: Partial<Record<string, string>>;
  stringData?: Partial<Record<string, string>>;
} = {}) => {
  const secret = new Secret({
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name: "app-credentials",
      resourceVersion: overrides.resourceVersion ?? "100",
      uid: overrides.uid ?? "secret-uid-1",
      namespace: "default",
      selfLink: "/api/v1/namespaces/default/secrets/app-credentials",
    },
    data: overrides.data ?? {
      API_TOKEN: base64.encode("initial-token-value"),
      DB_PASSWORD: base64.encode("initial-db-pass"),
    },
    type: SecretType.Opaque,
  });

  if (overrides.stringData) {
    (secret as Secret & { stringData?: Partial<Record<string, string>> }).stringData = overrides.stringData;
  }

  return secret;
};

describe("SecretDetails tests", () => {
  let showSuccessNotificationMock: jest.Mock;
  let showErrorNotificationMock: jest.Mock;
  let showCheckedErrorNotificationMock: jest.Mock;
  let updateMock: jest.Mock;
  let apiGetMock: jest.Mock;

  const setupTestEnv = () => {
    const di = getDiForUnitTesting();

    showSuccessNotificationMock = jest.fn();
    showErrorNotificationMock = jest.fn();
    showCheckedErrorNotificationMock = jest.fn();
    updateMock = jest.fn();
    apiGetMock = jest.fn();

    di.override(directoryForUserDataInjectable, () => "/some-user-data");
    di.override(directoryForKubeConfigsInjectable, () => "/some-kube-configs");
    di.override(storesAndApisCanBeCreatedInjectable, () => true);
    di.override(showSuccessNotificationInjectable, () => showSuccessNotificationMock);
    di.override(showErrorNotificationInjectable, () => showErrorNotificationMock);
    di.override(showCheckedErrorNotificationInjectable, () => showCheckedErrorNotificationMock);

    di.override(hostedClusterInjectable, () => new Cluster({
      contextName: "some-context-name",
      id: "some-cluster-id",
      kubeConfigPath: "/some-path-to-a-kubeconfig",
    }));

    di.override(secretStoreInjectable, () => ({
      update: updateMock,
      api: {
        get: apiGetMock,
      },
      getByName: jest.fn(),
    } as unknown as SecretStore));

    return {
      di,
      render: renderFor(di),
    };
  };

  it("should show the visibility toggle when the secret value is ''", () => {
    const { render } = setupTestEnv();
    const secret = makeSecret({
      data: {
        foobar: "",
      },
    });

    const result = render(<SecretDetails object={secret} />);

    expect(result.getByTestId("foobar-secret-entry").querySelector(".Icon")).toBeDefined();
  });

  it("preserves unsaved local draft when MobX reactive prop updates arrive for the same Secret", () => {
    const { render } = setupTestEnv();
    const initialSecret = makeSecret({
      resourceVersion: "100",
      data: {
        API_TOKEN: base64.encode("v1-secret-token"),
      },
    });

    const result = render(<SecretDetails object={initialSecret} />);
    const input = result.getByTestId("API_TOKEN-secret-entry").querySelector("textarea") as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: base64.encode("my-unsaved-local-secret") }});
    expect(input.value).toBe(base64.encode("my-unsaved-local-secret"));

    // Simulate watch event delivering resourceVersion 101 for the same Secret UID
    const updatedFromWatch = makeSecret({
      resourceVersion: "101",
      data: {
        API_TOKEN: base64.encode("remote-watch-token"),
      },
    });

    result.rerender(<SecretDetails object={updatedFromWatch} />);

    // Local draft must NOT be overwritten
    expect(input.value).toBe(base64.encode("my-unsaved-local-secret"));
  });

  it("detects 409 Conflict, keeps draft, shows key-only diff without leaking secret values, and supports Reload / Re-apply", async () => {
    const { render } = setupTestEnv();
    const localPlainSecret = "SUPER_SENSITIVE_LOCAL_VALUE_999";
    const remotePlainSecret = "SUPER_SENSITIVE_REMOTE_VALUE_888";
    const initialPlainSecret = "SUPER_SENSITIVE_INITIAL_VALUE_777";

    const initialSecret = makeSecret({
      resourceVersion: "100",
      data: {
        API_TOKEN: base64.encode(initialPlainSecret),
        DB_PASSWORD: base64.encode("initial-db-pass"),
      },
    });

    const result = render(<SecretDetails object={initialSecret} />);
    const tokenInput = result.getByTestId("API_TOKEN-secret-entry").querySelector("textarea") as HTMLTextAreaElement;

    fireEvent.change(tokenInput, { target: { value: base64.encode(localPlainSecret) }});

    const conflictError = new JsonApiErrorParsed(
      {
        kind: "Status",
        apiVersion: "v1",
        metadata: {},
        status: "Failure",
        message: "Operation cannot be fulfilled on secrets \"app-credentials\": the object has been modified",
        reason: "Conflict",
        details: { name: "app-credentials", group: "", kind: "secrets", causes: [] },
        code: 409,
      },
      ["the object has been modified"],
    );

    const remoteClusterSecret = makeSecret({
      resourceVersion: "105",
      data: {
        API_TOKEN: base64.encode(remotePlainSecret),
        DB_PASSWORD: base64.encode("remote-changed-db-pass"),
      },
    });

    updateMock.mockRejectedValueOnce(conflictError);
    apiGetMock.mockResolvedValue(remoteClusterSecret);

    fireEvent.click(result.getByTestId("save-secret-button"));

    await waitFor(() => {
      expect(result.getByTestId("secret-conflict-notice")).toBeInTheDocument();
    });

    // Verify original resourceVersion ("100") was sent on PUT
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][1].metadata.resourceVersion).toBe("100");

    // Verify draft was preserved
    expect(tokenInput.value).toBe(base64.encode(localPlainSecret));

    // Verify key names and statuses are shown
    const noticeText = result.getByTestId("secret-conflict-notice").textContent ?? "";

    expect(noticeText).toContain("API_TOKEN");
    expect(noticeText).toContain("DB_PASSWORD");
    expect(result.getByTestId("secret-conflict-overlapping-keys").textContent).toContain("API_TOKEN");
    expect(result.getByTestId("secret-conflict-key-status-API_TOKEN").textContent).toContain("conflict (modified in both)");
    expect(result.getByTestId("secret-conflict-key-status-DB_PASSWORD").textContent).toContain("modified in cluster");

    // CRITICAL: Secret values (plain or base64) must NEVER appear in the conflict notice or notifications
    const allNotifications = JSON.stringify([
      showErrorNotificationMock.mock.calls,
      showCheckedErrorNotificationMock.mock.calls,
      showSuccessNotificationMock.mock.calls,
    ]);

    for (const forbidden of [
      localPlainSecret,
      remotePlainSecret,
      initialPlainSecret,
      base64.encode(localPlainSecret),
      base64.encode(remotePlainSecret),
      base64.encode(initialPlainSecret),
    ]) {
      expect(noticeText).not.toContain(forbidden);
      expect(allNotifications).not.toContain(forbidden);
    }

    // Explicit action: Re-apply my changes on cluster version
    fireEvent.click(result.getByTestId("reapply-changes-secret"));

    await waitFor(() => {
      expect(result.queryByTestId("secret-conflict-notice")).toBeNull();
    });

    // Re-apply must NOT auto-save; it merges local API_TOKEN edit with remote DB_PASSWORD edit
    expect(updateMock).toHaveBeenCalledTimes(1);
    const dbInput = result.getByTestId("DB_PASSWORD-secret-entry").querySelector("textarea") as HTMLTextAreaElement;

    expect(tokenInput.value).toBe(base64.encode(localPlainSecret));
    expect(dbInput.value).toBe(base64.encode("remote-changed-db-pass"));

    // Now explicit Save sends resourceVersion "105" and succeeds
    const savedSecret = makeSecret({
      resourceVersion: "106",
      data: {
        API_TOKEN: base64.encode(localPlainSecret),
        DB_PASSWORD: base64.encode("remote-changed-db-pass"),
      },
    });

    updateMock.mockResolvedValueOnce(savedSecret);
    apiGetMock.mockResolvedValueOnce(savedSecret);

    fireEvent.click(result.getByTestId("save-secret-button"));

    await waitFor(() => {
      expect(showSuccessNotificationMock).toHaveBeenCalledWith("Secret successfully updated.");
    });

    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock.mock.calls[1][1].metadata.resourceVersion).toBe("105");
  });

  it("supports discarding local draft via Reload cluster version on conflict", async () => {
    const { render } = setupTestEnv();
    const initialSecret = makeSecret({
      resourceVersion: "100",
      data: {
        API_TOKEN: base64.encode("v1"),
      },
    });

    const result = render(<SecretDetails object={initialSecret} />);
    const tokenInput = result.getByTestId("API_TOKEN-secret-entry").querySelector("textarea") as HTMLTextAreaElement;

    fireEvent.change(tokenInput, { target: { value: base64.encode("local-draft") }});

    updateMock.mockRejectedValueOnce({ code: 409, reason: "Conflict" });
    apiGetMock.mockResolvedValue(
      makeSecret({
        resourceVersion: "102",
        data: {
          API_TOKEN: base64.encode("cluster-v2"),
        },
      }),
    );

    fireEvent.click(result.getByTestId("save-secret-button"));

    await waitFor(() => {
      expect(result.getByTestId("secret-conflict-notice")).toBeInTheDocument();
    });

    fireEvent.click(result.getByTestId("reload-remote-secret"));

    await waitFor(() => {
      expect(result.queryByTestId("secret-conflict-notice")).toBeNull();
    });

    expect(tokenInput.value).toBe(base64.encode("cluster-v2"));
  });

  it("normalizes stringData into base64 data and omits stringData on save", async () => {
    const { render } = setupTestEnv();
    const secretWithStringData = makeSecret({
      resourceVersion: "10",
      data: {},
      stringData: {
        PLAIN_KEY: "plain-secret-value",
      },
    });

    const persistedSecret = makeSecret({
      resourceVersion: "11",
      data: {
        PLAIN_KEY: base64.encode("plain-secret-value"),
      },
    });

    updateMock.mockResolvedValueOnce(persistedSecret);
    apiGetMock.mockResolvedValueOnce(persistedSecret);

    const result = render(<SecretDetails object={secretWithStringData} />);
    const input = result.getByTestId("PLAIN_KEY-secret-entry").querySelector("textarea") as HTMLTextAreaElement;

    expect(input.value).toBe(base64.encode("plain-secret-value"));

    fireEvent.click(result.getByTestId("save-secret-button"));

    await waitFor(() => {
      expect(showSuccessNotificationMock).toHaveBeenCalledWith("Secret successfully updated.");
    });

    expect(updateMock.mock.calls[0][1].data).toEqual({
      PLAIN_KEY: base64.encode("plain-secret-value"),
    });
    expect(updateMock.mock.calls[0][1].stringData).toBeUndefined();
  });

  it("handles 403 Forbidden, 404 Not Found, post-save read failure, and redacts secret values in generic errors", async () => {
    const { render } = setupTestEnv();
    const secretVal = "TOP_SECRET_CREDENTIAL_XYZ";
    const initialSecret = makeSecret({
      resourceVersion: "50",
      data: {
        API_TOKEN: base64.encode(secretVal),
      },
    });

    const result = render(<SecretDetails object={initialSecret} />);
    const tokenInput = result.getByTestId("API_TOKEN-secret-entry").querySelector("textarea") as HTMLTextAreaElement;

    fireEvent.change(tokenInput, { target: { value: base64.encode(secretVal) }});

    // 1. 403 Forbidden
    updateMock.mockRejectedValueOnce({ code: 403, reason: "Forbidden" });
    fireEvent.click(result.getByTestId("save-secret-button"));

    await waitFor(() => {
      expect(showErrorNotificationMock).toHaveBeenCalledWith(
        expect.stringContaining("403 Forbidden"),
      );
    });
    expect(tokenInput.value).toBe(base64.encode(secretVal));

    // 2. Generic error containing secret value -> must be redacted
    updateMock.mockRejectedValueOnce(new Error(`Invalid payload containing ${secretVal} and ${base64.encode(secretVal)}`));
    fireEvent.click(result.getByTestId("save-secret-button"));

    await waitFor(() => {
      expect(showCheckedErrorNotificationMock).toHaveBeenCalledTimes(1);
    });
    const checkedArg = String(showCheckedErrorNotificationMock.mock.calls[0][0]);

    expect(checkedArg).not.toContain(secretVal);
    expect(checkedArg).not.toContain(base64.encode(secretVal));
    expect(checkedArg).toContain("[REDACTED]");

    // 3. Post-save read-back failure
    updateMock.mockResolvedValueOnce(initialSecret);
    apiGetMock.mockRejectedValueOnce(new Error("ECONNRESET while reading secret"));
    fireEvent.click(result.getByTestId("save-secret-button"));

    await waitFor(() => {
      expect(showErrorNotificationMock).toHaveBeenCalledWith(
        expect.stringContaining("reading back the persisted state failed"),
      );
    });
    expect(tokenInput.value).toBe(base64.encode(secretVal));
  });
});
