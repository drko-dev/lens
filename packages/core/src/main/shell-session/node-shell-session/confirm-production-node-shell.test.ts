/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { DiContainer } from "@ogre-tools/injectable";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import electronDialogInjectable from "../../electron-app/features/electron-dialog.injectable";
import confirmProductionNodeShellInjectable from "./confirm-production-node-shell.injectable";
import type { ConfirmProductionNodeShell, ProductionNodeShellRequest } from "./confirm-production-node-shell.injectable";
import getDialogParentWindowInjectable from "../../routes/port-forward/get-dialog-parent-window.injectable";

describe("confirmProductionNodeShell", () => {
  let di: DiContainer;
  let showMessageBox: jest.Mock;
  let parent: { isDestroyed: jest.Mock; isMinimized: jest.Mock; restore: jest.Mock; focus: jest.Mock } | undefined;
  let confirm: ConfirmProductionNodeShell;

  const request: ProductionNodeShellRequest = {
    clusterId: "cluster-prod-1",
    clusterName: "production-eu-west",
    environmentLabel: "Production",
    nodeName: "prod-worker-1",
  };

  beforeEach(() => {
    di = getDiForUnitTesting();
    showMessageBox = jest.fn().mockResolvedValue({ response: 1 });
    parent = {
      isDestroyed: jest.fn().mockReturnValue(false),
      isMinimized: jest.fn().mockReturnValue(false),
      restore: jest.fn(),
      focus: jest.fn(),
    };

    di.override(electronDialogInjectable, () => ({ showMessageBox }) as any);
    di.override(getDialogParentWindowInjectable, () => () => parent as any);

    confirm = di.inject(confirmProductionNodeShellInjectable);
  });

  it("returns true when the operator clicks the confirm button", async () => {
    expect(await confirm(request)).toBe(true);
    expect(showMessageBox).toHaveBeenCalledWith(
      parent,
      expect.objectContaining({
        type: "warning",
        title: "Production Node Shell",
        buttons: ["Cancel", "Open Privileged Shell"],
        defaultId: 0,
        cancelId: 0,
      }),
    );
  });

  it("returns false when the operator clicks Cancel", async () => {
    showMessageBox.mockResolvedValue({ response: 0 });

    expect(await confirm(request)).toBe(false);
  });

  it("returns false when parent window is destroyed or unavailable", async () => {
    parent = undefined;

    expect(await confirm(request)).toBe(false);
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it("returns false without throwing when showMessageBox rejects", async () => {
    showMessageBox.mockRejectedValue(new Error("dialog crashed"));

    expect(await confirm(request)).toBe(false);
  });
});
