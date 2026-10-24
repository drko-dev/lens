/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { computed } from "mobx";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import execFileInjectable from "../../../../common/fs/exec-file.injectable";
import type { ExecFile } from "../../../../common/fs/exec-file.injectable";
import helmBinaryPathInjectable from "../../helm-binary-path.injectable";
import execHelmEnvInjectable from "../exec-env.injectable";
import execHelmInjectable, {
  DEFAULT_HELM_MAX_BUFFER,
  DEFAULT_HELM_TIMEOUT,
  DEFAULT_HELM_KILL_SIGNAL,
} from "../exec-helm.injectable";

describe("execHelmInjectable", () => {
  let execFileMock: jest.MockedFunction<ExecFile>;
  let di: ReturnType<typeof getDiForUnitTesting>;

  beforeEach(() => {
    di = getDiForUnitTesting();

    execFileMock = jest.fn();
    di.override(execFileInjectable, () => execFileMock);
    di.override(helmBinaryPathInjectable, () => "/path/to/helm");
    di.override(execHelmEnvInjectable, () => computed(() => ({ HELM_CONFIG_HOME: "/helm/config" })));
  });

  it("calls execFile with default 32 MiB buffer, 60s timeout, and SIGKILL", async () => {
    execFileMock.mockResolvedValue({ callWasSuccessful: true, response: "ok" });

    const execHelm = di.inject(execHelmInjectable);
    const result = await execHelm(["version"]);

    expect(result).toEqual({ callWasSuccessful: true, response: "ok" });
    expect(execFileMock).toHaveBeenCalledWith(
      "/path/to/helm",
      ["version"],
      expect.objectContaining({
        maxBuffer: DEFAULT_HELM_MAX_BUFFER,
        timeout: DEFAULT_HELM_TIMEOUT,
        killSignal: DEFAULT_HELM_KILL_SIGNAL,
        env: { HELM_CONFIG_HOME: "/helm/config" },
      }),
    );
    expect(DEFAULT_HELM_MAX_BUFFER).toBe(32 * 1024 * 1024); // exactly 32 MiB, not 32 GiB
    expect(DEFAULT_HELM_TIMEOUT).toBe(60_000);
    expect(DEFAULT_HELM_KILL_SIGNAL).toBe("SIGKILL");
  });

  it("passes custom maxBuffer, timeout, killSignal, and AbortSignal when supplied", async () => {
    execFileMock.mockResolvedValue({ callWasSuccessful: true, response: "pulled" });

    const execHelm = di.inject(execHelmInjectable);
    const ac = new AbortController();

    await execHelm(["pull", "my-chart"], {
      maxBuffer: 4 * 1024 * 1024,
      timeout: 15_000,
      killSignal: "SIGTERM",
      signal: ac.signal,
    });

    expect(execFileMock).toHaveBeenCalledWith(
      "/path/to/helm",
      ["pull", "my-chart"],
      expect.objectContaining({
        maxBuffer: 4 * 1024 * 1024,
        timeout: 15_000,
        killSignal: "SIGTERM",
        signal: ac.signal,
      }),
    );
  });

  it("propagates error when maxBuffer or timeout is exceeded", async () => {
    const error: any = new Error("stdout maxBuffer length exceeded");

    error.code = "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
    error.killed = true;
    error.stderr = "";

    execFileMock.mockResolvedValue({ callWasSuccessful: false, error });

    const execHelm = di.inject(execHelmInjectable);
    const result = await execHelm(["list"]);

    expect(result.callWasSuccessful).toBe(false);

    if (!result.callWasSuccessful) {
      expect(result.error?.message).toContain("maxBuffer");
    }
  });
});
