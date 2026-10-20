/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import createPodTerminalTabInjectable from "./create-pod-terminal-tab.injectable";
import dockStoreInjectable from "../dock/store.injectable";
import { TabKind } from "../dock/store";
import type { Pod } from "@openlens/kube-object";

describe("createPodTerminalTabInjectable", () => {
  it("creates a dock terminal tab with pod and container metadata", () => {
    const di = getDiForUnitTesting();
    const createTabMock = jest.fn().mockReturnValue({ id: "tab-pod-123" });

    di.override(dockStoreInjectable, () => ({
      createTab: createTabMock,
    }) as any);

    const createPodTerminalTab = di.inject(createPodTerminalTabInjectable);

    const mockPod = {
      getName: () => "api-gateway-xyz",
      getNs: () => "microservices",
    } as unknown as Pod;

    const tabId = createPodTerminalTab({
      selectedPod: mockPod,
      selectedContainer: { name: "gateway" },
    });

    expect(tabId).toBe("tab-pod-123");
    expect(createTabMock).toHaveBeenCalledWith({
      title: "Pod: api-gateway-xyz (gateway)",
      kind: TabKind.TERMINAL,
      pod: "api-gateway-xyz",
      namespace: "microservices",
      container: "gateway",
    });
  });
});
