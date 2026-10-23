/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { KubeJsonApi } from "./kube-json-api";
import { KubeApi } from "./kube-api";
import { ConfigMap, Pod } from "@openlens/kube-object";

const podData = (resourceVersion: string) => ({
  apiVersion: "v1",
  kind: "Pod",
  metadata: { name: "some-pod", namespace: "default", uid: "uid-1", resourceVersion },
  spec: {},
});

const configMapData = (resourceVersion: string) => ({
  apiVersion: "v1",
  kind: "ConfigMap",
  metadata: { name: "some-config", namespace: "default", uid: "uid-2", resourceVersion },
  data: { key: "value" },
});

const setup = () => {
  const request = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    del: jest.fn(),
    getResponse: jest.fn(),
  };

  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), silly: jest.fn() };

  const podApi = new KubeApi({ logger, maybeKubeApi: undefined }, {
    objectConstructor: Pod,
    request: request as unknown as KubeJsonApi,
  });

  const configMapApi = new KubeApi({ logger, maybeKubeApi: undefined }, {
    objectConstructor: ConfigMap,
    request: request as unknown as KubeJsonApi,
  });

  return { request, logger, podApi, configMapApi };
};

describe("KubeApi server-side dry-run (R7-02)", () => {
  describe("update (PUT)", () => {
    it("appends ?dryRun=All when dryRun option is given", async () => {
      const { request, configMapApi } = setup();

      request.put.mockResolvedValueOnce(configMapData("2"));

      const result = await configMapApi.update(
        { name: "some-config", namespace: "default" },
        { data: { key: "new" }} as never,
        { dryRun: "All" },
      );

      expect(request.put).toHaveBeenCalledWith(
        "/api/v1/namespaces/default/configmaps/some-config",
        expect.objectContaining({
          query: { dryRun: "All" },
        }),
      );
      expect(result?.metadata.resourceVersion).toBe("2");
    });

    it("does not send any query without the dryRun option", async () => {
      const { request, configMapApi } = setup();

      request.put.mockResolvedValueOnce(configMapData("2"));

      await configMapApi.update({ name: "some-config", namespace: "default" }, { data: { key: "new" }} as never);

      const [url, params] = request.put.mock.calls[0];

      expect(url).toBe("/api/v1/namespaces/default/configmaps/some-config");
      expect(params.query).toBeUndefined();
      expect(params.data.metadata.resourceVersion).toBeUndefined();
    });

    it("keeps name/namespace merged into the body exactly like a real update", async () => {
      const { request, configMapApi } = setup();

      request.put.mockResolvedValueOnce(configMapData("2"));

      await configMapApi.update(
        { name: "some-config", namespace: "default" },
        { data: { key: "new" }} as never,
        { dryRun: "All" },
      );

      const [, params] = request.put.mock.calls[0];

      expect(params.data.metadata.name).toBe("some-config");
      expect(params.data.metadata.namespace).toBe("default");
      expect(params.data.data).toEqual({ key: "new" });
    });
  });

  describe("create (POST)", () => {
    it("appends ?dryRun=All when dryRun option is given", async () => {
      const { request, podApi } = setup();

      request.post.mockResolvedValueOnce(podData("1"));

      await podApi.create({ name: "some-pod", namespace: "default" }, { spec: {}} as never, { dryRun: "All" });

      expect(request.post).toHaveBeenCalledWith(
        "/api/v1/namespaces/default/pods",
        expect.objectContaining({
          query: { dryRun: "All" },
        }),
      );
    });

    it("does not send any query without the dryRun option", async () => {
      const { request, podApi } = setup();

      request.post.mockResolvedValueOnce(podData("1"));

      await podApi.create({ name: "some-pod", namespace: "default" }, { spec: {}} as never);

      const [, params] = request.post.mock.calls[0];

      expect(params.query).toBeUndefined();
    });
  });

  describe("patch (PATCH)", () => {
    it("appends ?dryRun=All and keeps the patch strategy headers", async () => {
      const { request, podApi } = setup();

      request.patch.mockResolvedValueOnce(podData("3"));

      await podApi.patch(
        { name: "some-pod", namespace: "default" },
        [{ op: "test", path: "/metadata/resourceVersion", value: "1" }, { op: "replace", path: "/spec/nodeName", value: "node-1" }],
        "json",
        { dryRun: "All" },
      );

      const [url, params, reqInit] = request.patch.mock.calls[0];

      expect(url).toBe("/api/v1/namespaces/default/pods/some-pod");
      expect(params.query).toEqual({ dryRun: "All" });
      expect(reqInit.headers["content-type"]).toBe("application/json-patch+json");
    });

    it("does not send any query without the dryRun option", async () => {
      const { request, podApi } = setup();

      request.patch.mockResolvedValueOnce(podData("3"));

      await podApi.patch({ name: "some-pod", namespace: "default" }, { spec: {}} as never);

      const [, params] = request.patch.mock.calls[0];

      expect(params.query).toBeUndefined();
    });
  });

  describe("store/cache side effects", () => {
    it("a dry-run response does not update the api's cached resourceVersions", async () => {
      const { request, configMapApi } = setup();

      request.put.mockResolvedValueOnce(configMapData("999"));

      await configMapApi.update(
        { name: "some-config", namespace: "default" },
        { data: { key: "new" }} as never,
        { dryRun: "All" },
      );

      expect(configMapApi.getResourceVersion("default")).toBeUndefined();
      expect(configMapApi.getResourceVersion("")).toBeUndefined();
    });
  });
});
