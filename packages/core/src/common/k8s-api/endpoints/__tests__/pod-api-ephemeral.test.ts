/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { PodApi } from "../pod.api";
import { Pod } from "@openlens/kube-object";

describe("PodApi.attachEphemeralContainer (R7-08)", () => {
  let podApi: PodApi;
  let mockRequest: any;

  const createMockPod = (resourceVersion = "100", ephemeralContainers: any[] = []): Pod => {
    return new Pod({
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: "test-pod",
        namespace: "default",
        uid: "pod-123",
        resourceVersion,
        selfLink: "/api/v1/namespaces/default/pods/test-pod",
      },
      spec: {
        containers: [{ name: "main", image: "nginx" }],
        ephemeralContainers,
      },
      status: {
        phase: "Running",
      } as any,
    });
  };

  beforeEach(() => {
    mockRequest = {
      get: jest.fn(),
      patch: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      del: jest.fn(),
    };

    podApi = new PodApi({} as any, {
      request: mockRequest,
    });
  });

  it("submits PATCH to /ephemeralcontainers preserving existing containers", async () => {
    const existingContainer = { name: "existing-debug", image: "alpine" };
    const initialPod = createMockPod("100", [existingContainer]);

    // mock get returns initialPod
    jest.spyOn(podApi, "get").mockResolvedValueOnce(initialPod);

    const patchedPod = createMockPod("101", [
      existingContainer,
      { name: "new-debug", image: "busybox", stdin: true, tty: true },
    ]);

    mockRequest.patch.mockResolvedValueOnce(patchedPod);

    const result = await podApi.attachEphemeralContainer(
      { name: "test-pod", namespace: "default" },
      { name: "new-debug", image: "busybox", stdin: true, tty: true },
      { resourceVersion: "100" },
    );

    expect(mockRequest.patch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/namespaces/default/pods/test-pod/ephemeralcontainers"),
      {
        data: {
          metadata: {
            resourceVersion: "100",
          },
          spec: {
            ephemeralContainers: [
              existingContainer,
              { name: "new-debug", image: "busybox", stdin: true, tty: true },
            ],
          },
        },
      },
      {
        headers: {
          "content-type": "application/strategic-merge-patch+json",
        },
      },
    );

    expect(result).toBeDefined();
  });

  it("atomically enforces resourceVersion precondition on API server and rejects with 409 Conflict if pod modified after GET", async () => {
    const currentPod = createMockPod("100");

    // GET initially returns version 100
    jest.spyOn(podApi, "get").mockResolvedValueOnce(currentPod);

    // API server patch rejects due to concurrent modification on the server between GET and PATCH
    const conflictError: any = new Error("Operation cannot be fulfilled on pods \"test-pod\": the object has been modified; please apply your changes to the latest version and try again");

    conflictError.statusCode = 409;
    conflictError.code = 409;
    mockRequest.patch.mockRejectedValueOnce(conflictError);

    await expect(
      podApi.attachEphemeralContainer(
        { name: "test-pod", namespace: "default" },
        { name: "debugger", image: "busybox" },
        { resourceVersion: "100" },
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(mockRequest.patch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/namespaces/default/pods/test-pod/ephemeralcontainers"),
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: {
            resourceVersion: "100",
          },
        }),
      }),
      expect.any(Object),
    );
  });

  it("detects concurrent write and rejects with HTTP 409 Conflict when resourceVersion does not match", async () => {
    const currentPod = createMockPod("200"); // Current is 200, client expected 100

    jest.spyOn(podApi, "get").mockResolvedValueOnce(currentPod);

    await expect(
      podApi.attachEphemeralContainer(
        { name: "test-pod", namespace: "default" },
        { name: "debugger", image: "busybox" },
        { resourceVersion: "100" },
      ),
    ).rejects.toMatchObject({
      code: 409,
    });

    // Zero mutation sent to patch
    expect(mockRequest.patch).not.toHaveBeenCalled();
  });

  it("rejects duplicate container names with HTTP 422 before mutation", async () => {
    const existingContainer = { name: "debugger", image: "alpine" };
    const currentPod = createMockPod("100", [existingContainer]);

    jest.spyOn(podApi, "get").mockResolvedValueOnce(currentPod);

    await expect(
      podApi.attachEphemeralContainer(
        { name: "test-pod", namespace: "default" },
        { name: "debugger", image: "busybox" },
        { resourceVersion: "100" },
      ),
    ).rejects.toMatchObject({
      code: 422,
    });

    expect(mockRequest.patch).not.toHaveBeenCalled();
  });

  it("rejects with 404 when target pod is not found", async () => {
    jest.spyOn(podApi, "get").mockResolvedValueOnce(null);

    await expect(
      podApi.attachEphemeralContainer(
        { name: "non-existent", namespace: "default" },
        { name: "debugger", image: "busybox" },
      ),
    ).rejects.toMatchObject({
      code: 404,
    });

    expect(mockRequest.patch).not.toHaveBeenCalled();
  });

  it("cooperative cancellation: aborts immediately if cancelled before start (0 GET, 0 PATCH)", async () => {
    const abortController = new AbortController();

    abortController.abort();

    const getSpy = jest.spyOn(podApi, "get");

    await expect(
      podApi.attachEphemeralContainer(
        { name: "test-pod", namespace: "default" },
        { name: "debugger", image: "busybox" },
        { signal: abortController.signal },
      ),
    ).rejects.toMatchObject({
      name: "AbortError",
      statusCode: 499,
    });

    expect(getSpy).not.toHaveBeenCalled();
    expect(mockRequest.patch).not.toHaveBeenCalled();
  });

  it("cooperative cancellation: aborts immediately when cancelled during pending GET and executes exactly 0 PATCH requests", async () => {
    const abortController = new AbortController();

    let resolveGet: (val: any) => void = () => {};
    const pendingGetPromise = new Promise(resolve => {
      resolveGet = resolve;
    });

    jest.spyOn(podApi, "get").mockImplementationOnce(() => pendingGetPromise as any);

    const attachPromise = podApi.attachEphemeralContainer(
      { name: "test-pod", namespace: "default" },
      { name: "debugger", image: "busybox" },
      {
        resourceVersion: "100",
        signal: abortController.signal,
      },
    );

    // Operator cancels while GET is in flight
    abortController.abort();

    // Now GET resolves
    resolveGet(createMockPod("100"));

    await expect(attachPromise).rejects.toMatchObject({
      name: "AbortError",
      statusCode: 499,
    });

    // CRITICAL SECURITY ASSERTION: Exactly ZERO PATCH requests to Kubernetes!
    expect(mockRequest.patch).not.toHaveBeenCalled();
  });

  it("cooperative cancellation: aborts when isCancelled predicate returns true before PATCH", async () => {
    let cancelled = false;

    jest.spyOn(podApi, "get").mockImplementationOnce(async () => {
      cancelled = true;

      return createMockPod("100");
    });

    await expect(
      podApi.attachEphemeralContainer(
        { name: "test-pod", namespace: "default" },
        { name: "debugger", image: "busybox" },
        {
          resourceVersion: "100",
          isCancelled: () => cancelled,
        },
      ),
    ).rejects.toMatchObject({
      name: "AbortError",
      statusCode: 499,
    });

    expect(mockRequest.patch).not.toHaveBeenCalled();
  });

  it("cooperative cancellation: aborts when cluster context changes during pending GET and executes 0 PATCH requests", async () => {
    let currentClusterId = "cluster-east";
    let resolveGet: (val: any) => void = () => {};
    const pendingGetPromise = new Promise(resolve => {
      resolveGet = resolve;
    });

    jest.spyOn(podApi, "get").mockImplementationOnce(() => pendingGetPromise as any);

    const attachPromise = podApi.attachEphemeralContainer(
      { name: "test-pod", namespace: "default" },
      { name: "debugger", image: "busybox" },
      {
        resourceVersion: "100",
        clusterId: "cluster-east",
        getCurrentClusterId: () => currentClusterId,
      },
    );

    // Operator switches cluster while GET is pending in flight
    currentClusterId = "cluster-west";

    // Now GET resolves
    resolveGet(createMockPod("100"));

    await expect(attachPromise).rejects.toMatchObject({
      name: "AbortError",
      statusCode: 499,
    });

    expect(mockRequest.patch).not.toHaveBeenCalled();
  });

  it("cooperative cancellation: aborts when cluster becomes disconnected during pending GET and executes 0 PATCH requests", async () => {
    let isHealthy = true;
    let resolveGet: (val: any) => void = () => {};
    const pendingGetPromise = new Promise(resolve => {
      resolveGet = resolve;
    });

    jest.spyOn(podApi, "get").mockImplementationOnce(() => pendingGetPromise as any);

    const attachPromise = podApi.attachEphemeralContainer(
      { name: "test-pod", namespace: "default" },
      { name: "debugger", image: "busybox" },
      {
        resourceVersion: "100",
        isClusterHealthy: () => isHealthy,
      },
    );

    // Cluster disconnects while GET is in flight
    isHealthy = false;

    // GET resolves
    resolveGet(createMockPod("100"));

    await expect(attachPromise).rejects.toMatchObject({
      name: "AbortError",
      statusCode: 499,
    });

    expect(mockRequest.patch).not.toHaveBeenCalled();
  });

  it("cooperative cancellation: aborts when target pod is deleted and recreated with different UID and executes 0 PATCH requests", async () => {
    let resolveGet: (val: any) => void = () => {};
    const pendingGetPromise = new Promise(resolve => {
      resolveGet = resolve;
    });

    jest.spyOn(podApi, "get").mockImplementationOnce(() => pendingGetPromise as any);

    const attachPromise = podApi.attachEphemeralContainer(
      { name: "test-pod", namespace: "default" },
      { name: "debugger", image: "busybox" },
      {
        resourceVersion: "100",
        expectedPodUid: "pod-123",
      },
    );

    // Server returns recreated pod with same name but new UID
    const recreatedPod = new Pod({
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: "test-pod",
        namespace: "default",
        uid: "pod-recreated-999",
        resourceVersion: "101",
        selfLink: "/api/v1/namespaces/default/pods/test-pod",
      },
      spec: { containers: [{ name: "main", image: "nginx" }] },
    });

    resolveGet(recreatedPod);

    await expect(attachPromise).rejects.toMatchObject({
      name: "AbortError",
      statusCode: 412,
    });

    expect(mockRequest.patch).not.toHaveBeenCalled();
  });

  it("cooperative cancellation: aborts when operation generation is superseded (A -> B -> A) and executes 0 PATCH requests", async () => {
    let activeGeneration = 1;
    let resolveGet: (val: any) => void = () => {};
    const pendingGetPromise = new Promise(resolve => {
      resolveGet = resolve;
    });

    jest.spyOn(podApi, "get").mockImplementationOnce(() => pendingGetPromise as any);

    const attachPromise = podApi.attachEphemeralContainer(
      { name: "test-pod", namespace: "default" },
      { name: "debugger", image: "busybox" },
      {
        resourceVersion: "100",
        generation: 1,
        getCurrentGeneration: () => activeGeneration,
      },
    );

    // Newer operation dispatched (superseding generation 1)
    activeGeneration = 2;

    resolveGet(createMockPod("100"));

    await expect(attachPromise).rejects.toMatchObject({
      name: "AbortError",
      statusCode: 499,
    });

    expect(mockRequest.patch).not.toHaveBeenCalled();
  });

  it("cooperative cancellation: aborts before PATCH when validateContext fails (e.g. unconfirmed PROD transition)", async () => {
    let resolveGet: (val: any) => void = () => {};
    const pendingGetPromise = new Promise(resolve => {
      resolveGet = resolve;
    });

    jest.spyOn(podApi, "get").mockImplementationOnce(() => pendingGetPromise as any);

    const attachPromise = podApi.attachEphemeralContainer(
      { name: "test-pod", namespace: "default" },
      { name: "debugger", image: "busybox" },
      {
        resourceVersion: "100",
        validateContext: (pod) => {
          if (pod.getNs() === "default") {
            return "Security Guard: Environment transitioned to PRODUCTION without valid dual confirmation";
          }

          return true;
        },
      },
    );

    resolveGet(createMockPod("100"));

    await expect(attachPromise).rejects.toMatchObject({
      name: "AbortError",
      statusCode: 412,
    });

    expect(mockRequest.patch).not.toHaveBeenCalled();
  });
});
