/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { observable } from "mobx";
import { NonInjectedPortForwardDialog } from "../port-forward-dialog";
import type { PortForwardDialogData } from "../port-forward-dialog-model/port-forward-dialog-model";

describe("R4-09 port-forward dialog open race (S6)", () => {
  // Same model shape as port-forward-dialog-model: render() passes `model.data.get()` to onOpen
  const create = (data: PortForwardDialogData) => {
    const model = { data: observable.box<PortForwardDialogData>(data), close: jest.fn() };
    const dialog = new NonInjectedPortForwardDialog({ model, portForwardStore: {}} as never);

    return { dialog, open: () => dialog.onOpen(model.data.get()), model };
  };
  const dataFor = (forwardPort: number) => ({ portForward: { forwardPort }, useHttps: false, openInBrowser: false }) as unknown as PortForwardDialogData;

  it("keeps a port typed before the dialog's onOpen runs", async () => {
    const { dialog, open } = create(dataFor(0));

    dialog.changePort("61791");
    await open();

    expect(dialog.desiredPort).toBe(61791);
  });

  it("initialises from the port-forward when nothing was typed, and on a new opening", async () => {
    const { dialog, open, model } = create(dataFor(8080));

    await open();
    expect(dialog.desiredPort).toBe(8080);

    dialog.changePort("9000");
    model.data.set(dataFor(7070));
    await open();
    expect(dialog.desiredPort).toBe(7070);
  });
});
