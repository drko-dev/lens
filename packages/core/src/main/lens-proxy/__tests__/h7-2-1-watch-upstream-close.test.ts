/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * @jest-environment node
 */

import http from "http";
import type { AddressInfo } from "net";
import httpProxy from "http-proxy";
import { LensProxy } from "../lens-proxy";

const listen = (server: http.Server) => new Promise<number>((resolve) => {
  server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port));
});

const waitFor = async (condition: () => boolean, timeoutMs = 2000) => {
  const start = Date.now();

  while (!condition() && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe("LensProxy: long-running requests (watches) and client disconnects", () => {
  let upstream: http.Server;
  let front: http.Server;
  let counter: { open: number };
  let upstreamPort: number;
  let frontPort: number;
  const openUpstream = () => counter.open;

  beforeEach(async () => {
    // A counter per test, so late closes from a previous test never leak into this one.
    const current = { open: 0 };

    counter = current;
    // Synthetic API server that holds every request open, like a Kubernetes watch.
    upstream = http.createServer((req, res) => {
      current.open += 1;
      res.on("close", () => { current.open -= 1; });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write("\n");
    });
    upstreamPort = await listen(upstream);

    const proxy = httpProxy.createProxyServer();

    // The constructor wires the event handlers onto the shared http-proxy instance.
    new LensProxy({
      proxy,
      certificate: { cert: "", private: "", public: "" },
      logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
    } as never);

    front = http.createServer((req, res) => proxy.web(req, res, { target: `http://127.0.0.1:${upstreamPort}` }));
    frontPort = await listen(front);
  });

  afterEach(async () => {
    upstream.closeAllConnections();
    front.closeAllConnections();
    await Promise.all([upstream, front].map((server) => new Promise((resolve) => server.close(resolve))));
  });

  const openWatchThenDisconnect = () => new Promise<void>((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${frontPort}/apis/apps/v1/deployments?watch=1`, (res) => {
      res.once("data", () => {
        req.destroy();
        resolve();
      });
    });

    req.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code !== "ECONNRESET") reject(error);
    });
  });

  it("closes the upstream watch when the renderer disconnects", async () => {
    await openWatchThenDisconnect();
    await waitFor(() => openUpstream() === 0);

    expect(openUpstream()).toBe(0);
  });

  it("does not accumulate upstream watches over repeated mount/unmount cycles", async () => {
    for (let i = 0; i < 10; i++) {
      await openWatchThenDisconnect();
    }

    await waitFor(() => openUpstream() === 0);

    expect(openUpstream()).toBe(0);
  });

  it("keeps a watch open while its client is still connected", async () => {
    const req = http.get(`http://127.0.0.1:${frontPort}/apis/apps/v1/deployments?watch=1`);

    await waitFor(() => openUpstream() === 1);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(openUpstream()).toBe(1);
    req.destroy();
    await waitFor(() => openUpstream() === 0);
    expect(openUpstream()).toBe(0);
  });

  it("does not interrupt completed (non-watch) responses", async () => {
    upstream.removeAllListeners("request");
    upstream.on("request", (req: http.IncomingMessage, res: http.ServerResponse) => res.end("{\"kind\":\"DeploymentList\"}"));

    const body = await new Promise<string>((resolve, reject) => {
      http.get(`http://127.0.0.1:${frontPort}/apis/apps/v1/deployments`, (res) => {
        let data = "";

        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => resolve(data));
      }).on("error", reject);
    });

    expect(body).toBe("{\"kind\":\"DeploymentList\"}");
  });
});
