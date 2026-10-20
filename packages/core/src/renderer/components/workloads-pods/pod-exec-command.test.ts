/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { buildPodExecCommand } from "./pod-exec-command";

describe("buildPodExecCommand", () => {
  it("targets the exact namespace, pod and container", () => {
    expect(buildPodExecCommand("editor-lab", "sample-123", "web"))
      .toBe("kubectl exec -it --namespace 'editor-lab' 'sample-123' --container 'web' -- /bin/sh");
  });

  it("escapes shell metacharacters in resource names", () => {
    const command = buildPodExecCommand("team'; touch /tmp/injected; echo '", "pod", "main");

    expect(command).toContain("'team'\\''; touch /tmp/injected; echo '\\'''");
    expect(command).toContain(" --container 'main' -- /bin/sh");
  });

  it("refuses to execute without an explicit container", () => {
    expect(() => buildPodExecCommand("default", "pod", "")).toThrow();
  });
});
