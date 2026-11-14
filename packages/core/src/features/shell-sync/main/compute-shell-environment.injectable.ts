/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { AsyncResult } from "@openlens/utilities";
import { getInjectable } from "@ogre-tools/injectable";
import isWindowsInjectable from "../../../common/vars/is-windows.injectable";
import computeUnixShellEnvironmentInjectable from "./compute-unix-shell-environment.injectable";

export type EnvironmentVariables = Partial<Record<string, string>>;
export type ComputeShellEnvironment = (shell: string) => AsyncResult<EnvironmentVariables | undefined, string>;

const SHELL_ENV_CACHE_TTL_MS = 60_000;

const computeShellEnvironmentInjectable = getInjectable({
  id: "compute-shell-environment",
  instantiate: (di): ComputeShellEnvironment => {
    const isWindows = di.inject(isWindowsInjectable);
    const computeUnixShellEnvironment = di.inject(computeUnixShellEnvironmentInjectable);

    if (isWindows) {
      return async () => ({
        callWasSuccessful: true,
        response: undefined,
      });
    }

    const cachedEnvs = new Map<string, { result: AsyncResult<EnvironmentVariables | undefined, string> extends Promise<infer T> ? T : never; resolvedAt: number }>();
    const inflightRefreshes = new Set<string>();

    const resolveUnixEnv = async (shell: string) => {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), 30_000);
      const result = await computeUnixShellEnvironment(shell, { signal: controller.signal });

      clearTimeout(timeoutHandle);

      if (result.callWasSuccessful) {
        cachedEnvs.set(shell, { result, resolvedAt: Date.now() });

        return result;
      }

      if (controller.signal.aborted) {
        return {
          callWasSuccessful: false as const,
          error: `Resolving shell environment is taking very long. Please review your shell configuration: ${result.error}`,
        };
      }

      return result;
    };

    return async (shell) => {
      const cached = cachedEnvs.get(shell);

      if (cached) {
        if (Date.now() - cached.resolvedAt >= SHELL_ENV_CACHE_TTL_MS && !inflightRefreshes.has(shell)) {
          inflightRefreshes.add(shell);
          void resolveUnixEnv(shell).finally(() => inflightRefreshes.delete(shell));
        }

        return cached.result;
      }

      return resolveUnixEnv(shell);
    };
  },
});

export default computeShellEnvironmentInjectable;

