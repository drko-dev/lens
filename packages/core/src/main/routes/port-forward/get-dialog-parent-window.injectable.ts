/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { BrowserWindow } from "electron";
import { BrowserWindow as ElectronBrowserWindow } from "electron";

export type GetDialogParentWindow = () => BrowserWindow | undefined;

const getDialogParentWindowInjectable = getInjectable({
  id: "get-port-forward-dialog-parent-window",
  instantiate: (): GetDialogParentWindow => () => (
    ElectronBrowserWindow.getFocusedWindow()
    ?? ElectronBrowserWindow.getAllWindows().find((window) => !window.isDestroyed() && window.isVisible())
  ),
  causesSideEffects: true,
});

export default getDialogParentWindowInjectable;
