/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/** R4-06: fixed channels between a cluster frame and Electron Main. */
export const detachedToolFrameChannels = Object.freeze({
  /** cluster frame -> Main (invoke) */
  requestDetach: "detached-tool:request-detach",
  /** cluster frame -> Main (invoke): the dock placeholder asks to bring its tool back */
  requestRedock: "detached-tool:frame-request-redock",
  /** cluster frame -> Main (invoke): which tabs of THIS cluster (derived from the sender frame) are detached right now */
  listDetached: "detached-tool:frame-list-detached",
  /** Main -> the originating cluster frame only */
  redocked: "detached-tool:redocked",
});

export interface DetachToolRequest {
  clusterId: string;
  workspaceId: string;
  tabId: string;
  toolKind: "logs" | "inspector";
  resource: {
    apiVersion?: string;
    kind: string;
    namespace?: string;
    name: string;
    uid?: string;
  };
  logs?: {
    container: string;
    tailLines: number;
    previous: boolean;
    timestamps: boolean;
    pod?: string;
  };
}

export type FrameRedockRequest = Pick<DetachToolRequest, "clusterId" | "workspaceId" | "tabId" | "toolKind">;

export interface DetachedTabsResult {
  /** R5-07F: terminal windows are listed too (ids only), so a reloaded dock can show the placeholder. */
  tabs: (Pick<DetachToolRequest, "workspaceId" | "tabId"> & { toolKind: DetachToolRequest["toolKind"] | "terminal" })[];
}

export interface DetachToolResult {
  windowId: number;
  reused: boolean;
}

export interface RedockedNotice {
  clusterId: string;
  workspaceId: string;
  tabId: string;
  toolKind: "logs" | "inspector" | "terminal";
}

/** R5-07: theme sync. Payload is always a DetachedThemePayload (colours + type only). */
export const detachedThemeChannels = Object.freeze({
  /** app window root frame -> Main (send) */
  update: "detached-theme:update",
  /** detached window -> Main (invoke): cached sanitized payload or undefined */
  get: "detached-theme:get",
  /** Main -> every detached window */
  changed: "detached-theme:changed",
});
