/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";

/**
 * R4-06B: tracks PTYs whose single consumer was handed over to a detached terminal window.
 * While a terminalId is held the shell session must neither kill its PTY when the dock
 * websocket closes nor accept a second (dock) websocket.
 */
export class ShellSessionHandover {
  private readonly held = new Set<string>();
  private readonly consumers = new Map<string, () => void>();

  isHeld(terminalId: string): boolean {
    return this.held.has(terminalId);
  }

  hold(terminalId: string): void {
    this.held.add(terminalId);
  }

  release(terminalId: string): void {
    this.held.delete(terminalId);
  }

  /** The dock websocket of a terminal registers how to close itself; returns the unregister function. */
  registerConsumer(terminalId: string, close: () => void): () => void {
    this.consumers.set(terminalId, close);

    return () => {
      if (this.consumers.get(terminalId) === close) {
        this.consumers.delete(terminalId);
      }
    };
  }

  /** Disconnects the dock consumer (if any). Callers must `hold()` first so the PTY survives. */
  closeConsumer(terminalId: string): void {
    const close = this.consumers.get(terminalId);

    this.consumers.delete(terminalId);
    close?.();
  }
}

const shellSessionHandoverInjectable = getInjectable({
  id: "shell-session-handover",
  instantiate: () => new ShellSessionHandover(),
});

export default shellSessionHandoverInjectable;
