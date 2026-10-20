/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/** Escape arguments before sending a command to the cluster-scoped PTY shell. */
const shellQuote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

/** Open an interactive shell in the selected container, without using the host kubeconfig. */
export function buildPodExecCommand(namespace: string, pod: string, container: string): string {
  if (!namespace || !pod || !container) {
    throw new Error("A namespace, pod, and container must be selected");
  }

  return `kubectl exec -it --namespace ${shellQuote(namespace)} ${shellQuote(pod)} --container ${shellQuote(container)} -- /bin/sh`;
}
