/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * R4-06B: IPC contract of the detachable terminal. Main owns the PTY; these channels
 * only carry identities (never a cluster URL, command or PTY handle).
 */
export const detachedTerminalFrameChannels = Object.freeze({
  /** cluster frame -> Main (invoke) */
  requestDetach: "detached-terminal:request-detach",
  /** cluster frame -> Main (invoke) */
  requestRedock: "detached-terminal:frame-request-redock",
  /** Main -> originating cluster frame only (webContents.sendToFrame) */
  redocked: "detached-terminal:redocked",
});

export const detachedTerminalWindowChannels = Object.freeze({
  getContext: "detached-terminal:get-context",
  start: "detached-terminal:start",
  input: "detached-terminal:input",
  resize: "detached-terminal:resize",
  redock: "detached-terminal:redock",
});

/** Main -> detached window (webContents.send). */
export const detachedTerminalEventChannel = "detached-terminal:event";

export const DETACHED_TERMINAL_WORKSPACE_ID = "default";
export const MAX_TERMINAL_INPUT_LENGTH = 65536;
export const MAX_TERMINAL_COLS = 1000;
export const MAX_TERMINAL_ROWS = 500;

export interface DetachTerminalRequest {
  clusterId: string;
  workspaceId: string;
  tabId: string;
}

export type DetachTerminalResult =
  | { accepted: true; windowId: number; reused: boolean }
  | { accepted: false; reason: "declined" };

export type RedockTerminalRequest = DetachTerminalRequest;

export interface TerminalRedockedNotice extends DetachTerminalRequest {
  /** "exited": the shell ended while detached (the window stays open until redocked/closed). */
  reason: "redock" | "crash" | "exited";
}

export type DetachedTerminalWindowEvent =
  | { type: "output"; data: string }
  | { type: "exit"; exitCode: number };
