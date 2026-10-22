/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { Server } from "net";
import { createServer } from "net";
import { isLocalPortInUse } from "./is-local-port-in-use";

const hold = (host?: string) => new Promise<Server>((resolve, reject) => {
  const server = createServer((socket) => socket.end());

  server.once("error", reject);
  server.listen(0, host as string, () => resolve(server));
});

describe("isLocalPortInUse (real sockets)", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
  });

  it.each(["127.0.0.1", "::1", "::", "0.0.0.0", undefined])("detects a holder on %s", async (host) => {
    const server = await hold(host).catch(() => undefined);

    if (!server) {
      return; // address family unavailable on this machine
    }

    servers.push(server);

    for (let i = 0; i < 10; i += 1) {
      expect(await isLocalPortInUse((server.address() as any).port)).toBe(true);
    }
  });

  it("reports a free port as free, 10 times", async () => {
    const server = await hold("127.0.0.1");
    const { port } = server.address() as any;

    await new Promise((r) => server.close(r));

    for (let i = 0; i < 10; i += 1) {
      expect(await isLocalPortInUse(port)).toBe(false);
    }
  });
});
