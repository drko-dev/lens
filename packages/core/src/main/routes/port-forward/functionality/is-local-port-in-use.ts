/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { createServer } from "net";
import * as tcpPortUsed from "tcp-port-used";

// kubectl binds 127.0.0.1 (PORT_FORWARD_BIND_ADDRESS), but a holder may be on ::1, :: or 0.0.0.0 too
const loopbackHosts = ["127.0.0.1", "::1"];

// EADDRINUSE on bind catches non-accepting holders; the connect probe catches wildcard holders, because
// Node/Go bind with SO_REUSEADDR and macOS then lets a specific-address bind succeed next to a wildcard listener
const bindFails = (port: number, host: string) => new Promise<boolean>((resolve) => {
  const server = createServer();

  server.once("error", (error: NodeJS.ErrnoException) => resolve(error.code === "EADDRINUSE"));
  server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(false)));
});

const connectSucceeds = (port: number, host: string) => tcpPortUsed.check(port, host).catch(() => false);

const probe = async (port: number) => {
  const results = await Promise.all(loopbackHosts.map(async (host) => (
    await connectSucceeds(port, host) || await bindFails(port, host)
  )));

  return results.some(Boolean);
};

// Serialized: two concurrent bind probes of the same port would report each other as "in use"
let queue: Promise<unknown> = Promise.resolve();

export const isLocalPortInUse = (port: number) => {
  const result = queue.then(() => probe(port));

  queue = result.catch(() => undefined);

  return result;
};
