/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { JsonApi } from "./json-api";

const fakeResponse = (body: unknown, status = 200) => ({
  status,
  statusText: status === 200 ? "OK" : "Error",
  text: async () => JSON.stringify(body),
});

const secretManifest = {
  apiVersion: "v1",
  kind: "Secret",
  metadata: { name: "app-secret", namespace: "default", resourceVersion: "7" },
  data: { password: "ZmFrZS1wYXNzd29yZA==" },
  stringData: { token: "fake-token-value" },
};

const setup = (responseBody: unknown, status = 200) => {
  const fetchMock = jest.fn().mockResolvedValue(fakeResponse(responseBody, status));

  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const api = new JsonApi(
    { fetch: fetchMock as never, logger: logger as never },
    {
      apiBase: "",
      serverAddress: "https://api.example.test",
      debug: true,
    },
  );

  return { api, logger, fetchMock };
};

describe("JSON-API debug log redaction (R7-02)", () => {
  it("redacts Secret data and stringData in logged request bodies and responses", async () => {
    const { api, logger } = setup(secretManifest);

    await api.put("/api/v1/namespaces/default/secrets/app-secret", {
      data: secretManifest as never,
      query: { dryRun: "All" },
    });

    const logged = JSON.stringify(logger.debug.mock.calls);

    // eslint-disable-next-line xss/no-mixed-html
    expect(logged).toContain("<redacted>");
    expect(logged).not.toContain("ZmFrZS1wYXNzd29yZA==");
    expect(logged).not.toContain("fake-token-value");
  });

  it("redacts Secret values echoed back in error responses", async () => {
    const { api, logger } = setup(
      {
        kind: "Status",
        code: 422,
        status: "Failure",
        message: "Secret invalid",
        reason: "Invalid",
        details: { causes: [{ field: "data.password", message: "ZmFrZS1wYXNzd29yZA== is not valid" }] },
      },
      422,
    );

    await expect(
      api.put("/api/v1/namespaces/default/secrets/app-secret", {
        data: secretManifest as never,
      }),
    ).rejects.toBeDefined();

    const logged = JSON.stringify(logger.debug.mock.calls);

    expect(logged).not.toContain("ZmFrZS1wYXNzd29yZA==");
  });

  it("redacts JSON Patch values against /data and /stringData", async () => {
    const { api, logger } = setup(
      {
        kind: "Status",
        code: 422,
        status: "Failure",
        message: "fake-patch-value rejected",
        reason: "Invalid",
      },
      422,
    );

    await expect(
      api.patch("/api/v1/namespaces/default/secrets/app-secret", {
        data: [
          { op: "replace", path: "/stringData/token", value: "fake-patch-value" },
          { op: "test", path: "/data/password", value: "b2xkLXNlY3JldA==" },
        ] as never,
      }),
    ).rejects.toBeDefined();

    const logged = JSON.stringify(logger.debug.mock.calls);

    expect(logged).not.toContain("fake-patch-value");
    expect(logged).not.toContain("b2xkLXNlY3JldA==");
  });

  it("logs only safe metadata for non-manifest Secret error responses", async () => {
    const { api, logger } = setup(
      {
        kind: "Status",
        code: 422,
        status: "Failure",
        message: "value ZmFrZS1wYXNzd29yZA== is not allowed",
        reason: "Invalid",
      },
      422,
    );

    await expect(
      api.put("/api/v1/namespaces/default/secrets/app-secret?dryRun=All", {
        data: secretManifest as never,
      }),
    ).rejects.toBeDefined();

    const logged = JSON.stringify(logger.debug.mock.calls);

    expect(logged).not.toContain("ZmFrZS1wYXNzd29yZA==");
    // The server message is not logged at all: it cannot be proven redacted.
    expect(logged).not.toContain("is not allowed");
    expect(logged).toContain("metadata-only");
    expect(logged).toContain("Invalid");
    expect(logged).toContain("422");
  });

  it("does not alter non-Secret manifests in logs", async () => {
    const configMap = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: { name: "cm", namespace: "default" },
      data: { key: "value" },
    };
    const { api, logger } = setup(configMap);

    await api.put("/api/v1/namespaces/default/configmaps/cm", { data: configMap as never });

    const logged = JSON.stringify(logger.debug.mock.calls);

    expect(logged).toContain("value");
    // eslint-disable-next-line xss/no-mixed-html
    expect(logged).not.toContain("<redacted>");
  });
});
