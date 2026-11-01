/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { PassThrough } from "stream";
import { createKubetailStreamClient } from "../kubetail-stream-client.injectable";

describe("KubetailStreamClient", () => {
  let mockPodApi: any;
  let mockLogger: any;
  let streamClient: ReturnType<typeof createKubetailStreamClient>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
  });

  it("handles continuous incremental line streaming and decodes UTF-8 with multibyte characters", async () => {
    const mockStream = new PassThrough();
    const receivedLines: string[] = [];

    mockPodApi = {
      getLogsStream: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: mockStream,
      }),
    };

    streamClient = createKubetailStreamClient({
      podApi: mockPodApi,
      logger: mockLogger,
    });

    const handle = streamClient.startStream(
      { namespace: "default", podName: "my-pod", containerName: "app" },
      {
        onLine: (line) => receivedLines.push(line),
        onError: jest.fn(),
        onEnd: jest.fn(),
      },
    );

    // Write chunk with Spanish accent and emoji across chunk boundaries
    const fullText = "2026-11-01T00:00:00Z Conexión exitosa al clúster: 🚀 listo\n2026-11-01T00:00:01Z Línea siguiente\n";
    const buf = Buffer.from(fullText, "utf8");

    // Fragment into 3 parts
    mockStream.write(buf.slice(0, 20));
    mockStream.write(buf.slice(20, 45));
    mockStream.write(buf.slice(45));
    mockStream.end();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(receivedLines).toHaveLength(2);
    expect(receivedLines[0]).toBe("2026-11-01T00:00:00Z Conexión exitosa al clúster: 🚀 listo");
    expect(receivedLines[1]).toBe("2026-11-01T00:00:01Z Línea siguiente");

    handle.abort();
  });

  it("handles line fragmentation across multiple stream chunks correctly", async () => {
    const mockStream = new PassThrough();
    const receivedLines: string[] = [];

    mockPodApi = {
      getLogsStream: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: mockStream,
      }),
    };

    streamClient = createKubetailStreamClient({
      podApi: mockPodApi,
      logger: mockLogger,
    });

    const handle = streamClient.startStream(
      { namespace: "default", podName: "pod-1", containerName: "c1" },
      {
        onLine: (line) => receivedLines.push(line),
        onError: jest.fn(),
        onEnd: jest.fn(),
      },
    );

    mockStream.write("Part 1 of line... ");
    mockStream.write("Part 2 of line... ");
    mockStream.write("Part 3 of line.\n");
    mockStream.end();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(receivedLines).toHaveLength(1);
    expect(receivedLines[0]).toBe("Part 1 of line... Part 2 of line... Part 3 of line.");

    handle.abort();
  });

  it("calls onEnd exactly once without duplicate end/close event emissions", async () => {
    const mockStream = new PassThrough();
    const onEndMock = jest.fn();

    mockPodApi = {
      getLogsStream: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: mockStream,
      }),
    };

    streamClient = createKubetailStreamClient({
      podApi: mockPodApi,
      logger: mockLogger,
    });

    const handle = streamClient.startStream(
      { namespace: "default", podName: "pod-1", containerName: "c1" },
      {
        onLine: jest.fn(),
        onError: jest.fn(),
        onEnd: onEndMock,
      },
    );

    mockStream.write("2026-11-01T00:00:00Z log line\n");
    mockStream.end();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onEndMock).toHaveBeenCalledTimes(1);
    handle.abort();
  });

  it("aborts stream via AbortController and prevents callbacks after abort", async () => {
    const mockStream = new PassThrough();
    const onLineMock = jest.fn();
    let capturedSignal: AbortSignal | undefined;

    mockPodApi = {
      getLogsStream: jest.fn().mockImplementation((_res, _query, reqInit) => {
        capturedSignal = reqInit?.signal;

        return Promise.resolve({
          ok: true,
          status: 200,
          body: mockStream,
        });
      }),
    };

    streamClient = createKubetailStreamClient({
      podApi: mockPodApi,
      logger: mockLogger,
    });

    const handle = streamClient.startStream(
      { namespace: "default", podName: "pod-1", containerName: "c1" },
      {
        onLine: onLineMock,
        onError: jest.fn(),
        onEnd: jest.fn(),
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(capturedSignal?.aborted).toBe(false);

    handle.abort();

    expect(capturedSignal?.aborted).toBe(true);

    // Any late write should be ignored
    mockStream.write("Post abort line\n");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(onLineMock).not.toHaveBeenCalled();
  });

  it("handles HTTP 403 Forbidden error with status code metadata", async () => {
    const onErrorMock = jest.fn();

    mockPodApi = {
      getLogsStream: jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: () => Promise.resolve("User cannot get resource 'pods/log' in API group '' in namespace 'default'"),
      }),
    };

    streamClient = createKubetailStreamClient({
      podApi: mockPodApi,
      logger: mockLogger,
    });

    streamClient.startStream(
      { namespace: "default", podName: "restricted-pod", containerName: "app" },
      {
        onLine: jest.fn(),
        onError: onErrorMock,
        onEnd: jest.fn(),
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(onErrorMock).toHaveBeenCalledTimes(1);
    const [error, statusCode] = onErrorMock.mock.calls[0];

    expect(statusCode).toBe(403);
    expect(error.message).toContain("403");
    expect(error.message).toContain("Forbidden");
  });

  it("handles HTTP 404 Not Found error gracefully", async () => {
    const onErrorMock = jest.fn();

    mockPodApi = {
      getLogsStream: jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: () => Promise.resolve("pod not found"),
      }),
    };

    streamClient = createKubetailStreamClient({
      podApi: mockPodApi,
      logger: mockLogger,
    });

    streamClient.startStream(
      { namespace: "default", podName: "terminated-pod", containerName: "app" },
      {
        onLine: jest.fn(),
        onError: onErrorMock,
        onEnd: jest.fn(),
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(onErrorMock).toHaveBeenCalledTimes(1);
    const [error, statusCode] = onErrorMock.mock.calls[0];

    expect(statusCode).toBe(404);
    expect(error.message).toContain("404");
  });
});
