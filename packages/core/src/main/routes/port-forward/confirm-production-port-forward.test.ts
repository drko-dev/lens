/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { DiContainer } from "@ogre-tools/injectable";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import electronDialogInjectable from "../../electron-app/features/electron-dialog.injectable";
import confirmProductionPortForwardInjectable from "./confirm-production-port-forward.injectable";
import type { ConfirmProductionPortForward, ProductionPortForwardRequest } from "./confirm-production-port-forward.injectable";
import getDialogParentWindowInjectable from "./get-dialog-parent-window.injectable";

describe("confirmProductionPortForward", () => {
  let di: DiContainer;
  let showMessageBox: jest.Mock;
  let parent: { isDestroyed: jest.Mock; isMinimized: jest.Mock; restore: jest.Mock; focus: jest.Mock } | undefined;
  let confirm: ConfirmProductionPortForward;

  const request: ProductionPortForwardRequest = {
    clusterId: "cluster-id-1",
    clusterName: "my-prod-cluster",
    environmentLabel: "Production",
    namespace: "payments",
    kind: "pod",
    name: "api-0",
    port: 8080,
    forwardPort: 9090,
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

    confirm = di.inject(confirmProductionPortForwardInjectable);
  });

  it("returns true when the user picks the confirm button", async () => {
    expect(await confirm(request)).toBe(true);
  });

  it("returns false when the user picks Cancel", async () => {
    showMessageBox.mockResolvedValue({ response: 0 });

    expect(await confirm(request)).toBe(false);
  });

  it("returns false when the dialog is closed with Escape (cancelId response)", async () => {
    showMessageBox.mockImplementation(async (_parent, options) => ({ response: options.cancelId }));

    expect(await confirm(request)).toBe(false);
  });

  it("returns false without throwing when showMessageBox rejects", async () => {
    showMessageBox.mockRejectedValue(new Error("boom"));

    expect(await confirm(request)).toBe(false);
  });

  it("returns false and shows no dialog when there is no parent window", async () => {
    parent = undefined;

    expect(await confirm(request)).toBe(false);
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it("returns false and shows no dialog when the parent window is destroyed", async () => {
    parent?.isDestroyed.mockReturnValue(true);

    expect(await confirm(request)).toBe(false);
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it("restores a minimized parent window before showing the dialog", async () => {
    parent?.isMinimized.mockReturnValue(true);

    await confirm(request);

    expect(parent?.restore).toHaveBeenCalledTimes(1);
    expect(parent?.restore.mock.invocationCallOrder[0]).toBeLessThan(showMessageBox.mock.invocationCallOrder[0]);
  });

  it("does not restore a window that is not minimized", async () => {
    await confirm(request);

    expect(parent?.restore).not.toHaveBeenCalled();
  });

  it("focuses the parent window before showing the dialog", async () => {
    await confirm(request);

    expect(parent?.focus).toHaveBeenCalledTimes(1);
    expect(parent?.focus.mock.invocationCallOrder[0]).toBeLessThan(showMessageBox.mock.invocationCallOrder[0]);
  });

  it("attaches the dialog to the parent window", async () => {
    await confirm(request);

    expect(showMessageBox.mock.calls[0][0]).toBe(parent);
  });

  it("defaults and cancels to the Cancel button", async () => {
    await confirm(request);

    expect(showMessageBox.mock.calls[0][1]).toMatchObject({
      defaultId: 0,
      cancelId: 0,
      buttons: ["Cancel", "Start port-forward"],
    });
  });

  it("shows cluster name and id in the detail", async () => {
    await confirm(request);

    expect(showMessageBox.mock.calls[0][1].detail).toContain("my-prod-cluster (cluster-id-1)");
  });

  it("shows the environment label in the detail", async () => {
    await confirm(request);

    expect(showMessageBox.mock.calls[0][1].detail).toContain("Environment: Production");
  });

  it("shows resource kind, name and namespace in the detail", async () => {
    await confirm(request);

    expect(showMessageBox.mock.calls[0][1].detail).toContain("pod/api-0 in namespace payments");
  });

  it("shows loopback forward port and remote port in the detail", async () => {
    await confirm(request);

    expect(showMessageBox.mock.calls[0][1].detail).toContain("127.0.0.1:9090 -> 8080");
  });

  it("shows 'random port' in the detail when forwardPort is 0", async () => {
    await confirm({ ...request, forwardPort: 0 });

    expect(showMessageBox.mock.calls[0][1].detail).toContain("127.0.0.1:random port -> 8080");
  });
});
