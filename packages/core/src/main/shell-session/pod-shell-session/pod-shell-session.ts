/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { ShellSessionArgs, ShellSessionDependencies } from "../shell-session";
import { ShellSession } from "../shell-session";

export interface PodShellSessionArgs extends ShellSessionArgs {
  podName: string;
  namespace: string;
  containerName: string;
}

export interface PodShellSessionDependencies extends ShellSessionDependencies {
  readonly directoryContainingKubectl: string;
  readonly proxyKubeconfigPath: string;
}

export class PodShellSession extends ShellSession {
  ShellType = "pod-shell";

  protected readonly podName: string;
  protected readonly namespace: string;
  protected readonly containerName: string;
  protected readonly cwd: string | undefined = undefined;

  constructor(
    protected readonly dependencies: PodShellSessionDependencies,
    { podName, namespace, containerName, ...args }: PodShellSessionArgs,
  ) {
    super(dependencies, args);
    this.podName = podName;
    this.namespace = namespace;
    this.containerName = containerName;
  }

  public async open() {
    const env = await this.getCachedShellEnv();
    const args = [
      "exec",
      "-i",
      "-t",
      "-n",
      this.namespace,
      this.podName,
      "-c",
      this.containerName,
      "--",
      "sh",
      "-c",
      "((clear && bash) || (clear && ash) || (clear && sh))",
    ];

    await this.openShellProcess(await this.kubectl.getPath(), args, env);
  }
}
