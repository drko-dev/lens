/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { spawnSync } from "child_process";
import path from "path";
import { PassThrough } from "stream";
import { startMcpStdio } from "../mcp-stdio";

describe("R4-01A stdio entrypoint", () => {
  it("keeps stdout protocol-only and reports missing Kubernetes backend explicitly", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const stop = startMcpStdio(input, output);
    const responseText = new Promise<string>(resolve => output.once("data", chunk => resolve(chunk.toString())));

    input.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_cluster_info", arguments: { clusterId: "cluster-dev-01" }},
    })}\n`);

    const response = JSON.parse((await responseText).trim());

    expect(response.jsonrpc).toBe("2.0");
    expect(response.error.code).toBe(-32003);
    expect(response.error.message).toContain("NOT_CONFIGURED");
    expect(response.result).toBeUndefined();
    stop();
    input.destroy();
    output.destroy();
  });

  it("bounds partial input lines before a newline and resumes after discarding an oversized line", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const stop = startMcpStdio(input, output);
    const responses: any[] = [];
    const waiters: Array<(response: any) => void> = [];
    let pendingText = "";

    output.on("data", chunk => {
      const lines = `${pendingText}${chunk.toString()}`.split("\n");

      pendingText = lines.pop() ?? "";

      for (const line of lines.filter(Boolean)) {
        const response = JSON.parse(line);
        const resolve = waiters.shift();

        if (resolve) resolve(response);
        else responses.push(response);
      }
    });

    const nextResponse = () => responses.length
      ? Promise.resolve(responses.shift())
      : new Promise<any>(resolve => waiters.push(resolve));

    input.write("x".repeat(256 * 1024 + 1));

    const oversized = await nextResponse();

    expect(oversized.error.code).toBe(-32600);

    input.write(`\n${JSON.stringify({ jsonrpc: "2.0", id: 9, method: "ping" })}\n`);
    input.end();

    const ping = await nextResponse();

    expect(ping.result).toEqual({});
    stop();
    input.destroy();
    output.destroy();
  });

  it("runs the executable stdio entrypoint without kubeconfig and emits only NOT_CONFIGURED", () => {
    const entrypoint = path.resolve(__dirname, "../mcp-stdio.ts");
    const openLensDirectory = path.resolve(__dirname, "../../../../../../../open-lens");
    const result = spawnSync(process.execPath, ["-r", "ts-node/register/transpile-only", entrypoint], {
      cwd: openLensDirectory,
      env: { ...process.env, KUBECONFIG: "/dev/null" },
      input: `${JSON.stringify({
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: { name: "list_resources", arguments: { clusterId: "cluster-dev-01", resourceKind: "pods" }},
      })}\n`,
      encoding: "utf8",
      timeout: 10_000,
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split(/\r?\n/)).toHaveLength(1);
    expect(JSON.parse(result.stdout.trim()).error.message).toContain("NOT_CONFIGURED");
  });
});
