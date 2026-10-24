/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { ExecFileException } from "child_process";
import execFileInjectable from "../../../common/fs/exec-file.injectable";
import type { AsyncResult } from "@openlens/utilities";
import helmBinaryPathInjectable from "../helm-binary-path.injectable";
import execHelmEnvInjectable from "./exec-env.injectable";

export interface ExecHelmOptions {
  /** Maximum bytes for stdout/stderr buffer. Defaults to 32 MiB (32 * 1024 * 1024). */
  maxBuffer?: number;
  /** Timeout in milliseconds before process is forcibly killed. Defaults to 60,000 ms (60 seconds). */
  timeout?: number;
  /** Termination signal sent to the child process on timeout/cancellation. Defaults to "SIGKILL". */
  killSignal?: NodeJS.Signals | number;
  /** Optional AbortSignal for cooperative cancellation. */
  signal?: AbortSignal;
}

export type ExecHelm = (
  args: string[],
  options?: ExecHelmOptions,
) => AsyncResult<string, ExecFileException & { stderr: string }>;

export const DEFAULT_HELM_MAX_BUFFER = 32 * 1024 * 1024; // 32 MiB
export const DEFAULT_HELM_TIMEOUT = 60_000; // 60s
export const DEFAULT_HELM_KILL_SIGNAL = "SIGKILL";

const execHelmInjectable = getInjectable({
  id: "exec-helm",

  instantiate: (di): ExecHelm => {
    const execFile = di.inject(execFileInjectable);
    const execHelmEnv = di.inject(execHelmEnvInjectable);
    const helmBinaryPath = di.inject(helmBinaryPathInjectable);

    return async (args, options = {}) => execFile(helmBinaryPath, args, {
      maxBuffer: options.maxBuffer ?? DEFAULT_HELM_MAX_BUFFER,
      timeout: options.timeout ?? DEFAULT_HELM_TIMEOUT,
      killSignal: options.killSignal ?? DEFAULT_HELM_KILL_SIGNAL,
      signal: options.signal,
      env: execHelmEnv.get(),
    });
  },
});


export default execHelmInjectable;
