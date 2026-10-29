/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { createContainer } from "@ogre-tools/injectable";
import type { ExecFileException } from "child_process";
import * as childProcess from "child_process";
import type { ExecFile } from "./exec-file.injectable";
import execFileInjectable from "./exec-file.injectable";

jest.mock("child_process", () => {
  const actual = jest.requireActual<typeof childProcess>("child_process");

  return { ...actual, execFile: jest.fn(actual.execFile) };
});

const actualExecFile = jest.requireActual<typeof childProcess>("child_process").execFile;
const mockedExecFile = jest.mocked(childProcess.execFile);

describe("exec-file", () => {
  let execFile: ExecFile;
  let unhandledRejections: unknown[];
  const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);

  beforeEach(() => {
    const di = createContainer("exec-file-test");

    di.register(execFileInjectable);
    execFile = di.inject(execFileInjectable);
    mockedExecFile.mockImplementation(actualExecFile);
    unhandledRejections = [];
    process.on("unhandledRejection", onUnhandledRejection);
  });

  afterEach(() => {
    process.off("unhandledRejection", onUnhandledRejection);
  });

  it("resolves with stdout when the command succeeds", async () => {
    expect(await execFile("/bin/echo", ["hello"])).toEqual({
      callWasSuccessful: true,
      response: "hello\n",
    });
  });

  it("resolves with an error result carrying stderr on a non-zero exit code", async () => {
    const result = await execFile("/bin/sh", ["-c", "echo oops >&2; exit 3"]);

    expect(result).toMatchObject({
      callWasSuccessful: false,
      error: { code: 3, stderr: "oops\n" },
    });
  });

  it("resolves with an error result when the callback receives a spawn error", async () => {
    const result = await execFile("/nonexistent/binary");

    expect(result).toMatchObject({
      callWasSuccessful: false,
      error: { code: "ENOENT", stderr: "" },
    });
  });

  it("resolves with an error result instead of rejecting when execFile throws synchronously (spawn EPERM)", async () => {
    const eperm: ExecFileException = Object.assign(new Error("spawn EPERM"), { code: "EPERM", syscall: "spawn" });

    mockedExecFile.mockImplementation(() => {
      throw eperm;
    });

    const result = await execFile("/usr/bin/security", ["find-certificate", "-a", "-p"]);

    expect(result).toEqual({
      callWasSuccessful: false,
      error: Object.assign(eperm, { stderr: "" }),
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(unhandledRejections).toEqual([]);
  });
});
