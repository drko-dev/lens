/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getApplicationMenuOperationSystemActionInjectable } from "../../get-application-menu-operation-system-action-injectable";
import { getApplicationMenuSeparatorInjectable } from "../../get-application-menu-separator-injectable";

export const actionForMinimize = getApplicationMenuOperationSystemActionInjectable({
  id: "minimize",
  parentId: "window",
  orderNumber: 10,
  actionName: "minimize",
});

export const actionForZoom = getApplicationMenuOperationSystemActionInjectable({
  id: "zoom",
  parentId: "window",
  orderNumber: 20,
  actionName: "zoom",
});

export const separator1InWindow = getApplicationMenuSeparatorInjectable({
  id: "separator-1-in-window",
  parentId: "window",
  orderNumber: 30,
});

export const actionForFront = getApplicationMenuOperationSystemActionInjectable({
  id: "front",
  parentId: "window",
  orderNumber: 40,
  actionName: "front",
});
