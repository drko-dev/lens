/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { IpcMainInvokeEvent } from "electron";

/**
 * R4-09/R7-01: only a non-top frame whose origin is exactly the cluster's own origin may act as that
 * cluster's frame. The origin check also covers cross-cluster impersonation of an existing mapping.
 */
export const isClusterFrameSender = (event: IpcMainInvokeEvent, clusterId: unknown, port: number): boolean => {
  const senderFrame = event?.senderFrame;

  if (typeof clusterId !== "string" || !clusterId || !senderFrame || senderFrame.parent === null) {
    return false;
  }

  try {
    return new URL(senderFrame.url).origin.toLowerCase() === `https://${clusterId}.lens.app:${port}`.toLowerCase();
  } catch {
    return false;
  }
};
