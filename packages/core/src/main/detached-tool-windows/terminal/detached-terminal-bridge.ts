/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { DetachedTerminalWindowEvent } from "../../../common/terminal/detached-terminal-channels";
import { MAX_TERMINAL_COLS, MAX_TERMINAL_INPUT_LENGTH, MAX_TERMINAL_ROWS } from "../../../common/terminal/detached-terminal-channels";
import type { DetachedWindowRecord } from "../detached-window-registry";
import { DetachedWindowError } from "../detached-window-registry";
import type { ShellSessionHandover } from "../../shell-session/shell-session-handover.injectable";

/** The only PTY surface the bridge uses. `kill` is deliberately absent. */
export interface BridgedPty {
  onData(listener: (data: string) => void): { dispose(): void };
  onExit(listener: (event: { exitCode: number }) => void): { dispose(): void };
  write(data: string): void;
  resize(cols: number, rows: number): void;
}

export interface DetachedTerminalBridgeDependencies {
  readonly processes: Map<string, BridgedPty>;
  readonly handover: Pick<ShellSessionHandover, "hold" | "release" | "closeConsumer">;
  readonly sendToWindow: (windowId: number, payload: DetachedTerminalWindowEvent) => void;
  /** The shell ended while a window owned it (window stays open, showing "session ended"). */
  readonly onPtyExit: (record: DetachedWindowRecord, exitCode: number) => void;
  readonly logger: { info(message: string): void; warn(message: string): void };
}

const MAX_PENDING_OUTPUT = 256 * 1024;

interface Attachment {
  readonly record: DetachedWindowRecord;
  readonly terminalId: string;
  readonly pty: BridgedPty;
  readonly disposables: { dispose(): void }[];
  started: boolean;
  ended: boolean;
  exitCode: number;
  pending: string[];
  pendingLength: number;
}

export const terminalIdOf = (clusterId: string, tabId: string) => `${clusterId}:${tabId}`;

/**
 * R4-06B: connects ONE detached window to the PTY that Main already owns.
 * Never spawns, never kills: it only adds/removes its own listeners, so the same
 * process survives detach, redock and window crashes.
 */
export class DetachedTerminalBridge {
  private readonly attachments = new Map<number, Attachment>();

  constructor(private readonly deps: DetachedTerminalBridgeDependencies) {}

  hasPty(clusterId: string, tabId: string): boolean {
    return this.deps.processes.has(terminalIdOf(clusterId, tabId));
  }

  /** Takes the PTY over from the dock: holds it, disconnects the dock websocket, then listens. */
  attach(record: DetachedWindowRecord): void {
    const { clusterId, tabId } = record.descriptor;
    const terminalId = terminalIdOf(clusterId, tabId);
    const pty = this.deps.processes.get(terminalId);

    if (!pty) {
      throw new DetachedWindowError("The terminal session is not running.");
    }

    for (const other of this.attachments.values()) {
      if (other.terminalId === terminalId) {
        throw new DetachedWindowError("The terminal session is already attached to a window.");
      }
    }

    const attachment: Attachment = { record, terminalId, pty, disposables: [], started: false, ended: false, exitCode: 0, pending: [], pendingLength: 0 };

    // Hold first: closing the dock websocket must not kill the PTY.
    this.deps.handover.hold(terminalId);
    this.attachments.set(record.windowId, attachment);
    attachment.disposables.push(
      pty.onData(data => this.output(attachment, data)),
      pty.onExit(({ exitCode }) => this.exited(attachment, exitCode)),
    );
    this.deps.handover.closeConsumer(terminalId);
    this.deps.logger.info(`[DETACHED-TERMINAL]: window ${record.windowId} attached to ${terminalId}`);
  }

  /** The page registered its listener: flush what the PTY produced meanwhile. */
  start(windowId: number): void {
    const attachment = this.attachments.get(windowId);

    if (!attachment || attachment.started) {
      return;
    }

    attachment.started = true;

    const buffered = attachment.pending.join("");

    attachment.pending = [];
    attachment.pendingLength = 0;

    if (buffered) {
      this.deps.sendToWindow(windowId, { type: "output", data: buffered });
    }

    if (attachment.ended) {
      this.deps.sendToWindow(windowId, { type: "exit", exitCode: attachment.exitCode });
    }
  }

  input(windowId: number, data: unknown): void {
    if (typeof data !== "string" || data.length === 0 || data.length > MAX_TERMINAL_INPUT_LENGTH) {
      throw new DetachedWindowError("Invalid terminal input.");
    }

    const attachment = this.attachments.get(windowId);

    if (attachment && !attachment.ended) {
      attachment.pty.write(data);
    }
  }

  resize(windowId: number, size: unknown): void {
    const { cols, rows } = (size ?? {}) as { cols?: unknown; rows?: unknown };

    if (!isPlainSize(size) || !Number.isInteger(cols) || !Number.isInteger(rows)
      || (cols as number) < 1 || (cols as number) > MAX_TERMINAL_COLS
      || (rows as number) < 1 || (rows as number) > MAX_TERMINAL_ROWS) {
      throw new DetachedWindowError("Invalid terminal size.");
    }

    const attachment = this.attachments.get(windowId);

    if (attachment && !attachment.ended) {
      attachment.pty.resize(cols as number, rows as number);
    }
  }

  /** Redock / window closed / renderer crashed: stop listening, keep the shell alive. */
  release(windowId: number): void {
    const attachment = this.attachments.get(windowId);

    if (!attachment) {
      return;
    }

    this.attachments.delete(windowId);
    attachment.disposables.forEach(d => d.dispose());
    this.deps.handover.release(attachment.terminalId);
    this.deps.logger.info(`[DETACHED-TERMINAL]: window ${windowId} released ${attachment.terminalId} (PTY left running)`);
  }

  isAttached(windowId: number): boolean {
    return this.attachments.has(windowId);
  }

  private output(attachment: Attachment, data: string): void {
    if (attachment.started) {
      this.deps.sendToWindow(attachment.record.windowId, { type: "output", data });

      return;
    }

    attachment.pending.push(data);
    attachment.pendingLength += data.length;

    while (attachment.pendingLength > MAX_PENDING_OUTPUT && attachment.pending.length > 1) {
      attachment.pendingLength -= (attachment.pending.shift() as string).length;
    }
  }

  private exited(attachment: Attachment, exitCode: number): void {
    if (attachment.ended) {
      return;
    }

    attachment.ended = true;
    attachment.exitCode = exitCode;
    attachment.disposables.forEach(d => d.dispose());
    attachment.disposables.length = 0;

    // The dead process must not be "resumed" by a later dock connection.
    if (this.deps.processes.get(attachment.terminalId) === attachment.pty) {
      this.deps.processes.delete(attachment.terminalId);
    }

    this.deps.handover.release(attachment.terminalId);

    if (attachment.started) {
      this.deps.sendToWindow(attachment.record.windowId, { type: "exit", exitCode });
    }

    this.deps.onPtyExit(attachment.record, exitCode);
  }
}

function isPlainSize(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;

  return Object.keys(value as object).every(key => key === "cols" || key === "rows");
}
