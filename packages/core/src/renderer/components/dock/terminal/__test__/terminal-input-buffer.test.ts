/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { EventEmitter } from "events";
import { computed } from "mobx";
import { TerminalChannels } from "../../../../../common/terminal/channels";
import { WebSocketApiState } from "../../../../api/websocket-api";
import { Terminal } from "../terminal";

jest.mock("xterm", () => ({
  Terminal: class MockXterm {
    element?: HTMLElement;
    options: Record<string, unknown> = {};
    inputHandler?: (data: string) => void;
    focus = jest.fn();

    open(parent: HTMLElement) {
      this.element = document.createElement("div");
      this.element.innerHTML = '<div class="xterm-viewport"></div>';
      parent.appendChild(this.element);
    }

    loadAddon() {}
    attachCustomKeyEventHandler() {}
    onSelectionChange() { return { dispose() {} }; }
    onData(handler: (data: string) => void) {
      this.inputHandler = handler;
      return { dispose() {} };
    }
    onResize() { return { dispose() {} }; }
    registerLinkProvider() { return { dispose() {} }; }
    clear() {}
    dispose() {}
    write() {}
    paste() {}
    getSelection() { return ""; }
  },
}));

jest.mock("xterm-addon-fit", () => ({
  FitAddon: class {
    fit() {}
    dispose() {}
  },
}));

jest.mock("xterm-addon-search", () => ({
  SearchAddon: class {
    dispose() {}
  },
}));

jest.mock("xterm-link-provider", () => ({
  LinkProvider: class {},
}));

describe("Terminal initial input buffering", () => {
  const createTerminal = () => {
    const api = Object.assign(new EventEmitter(), {
      isReady: false,
      readyState: WebSocketApiState.CONNECTING,
      sendMessage: jest.fn(),
    });
    const terminal = new Terminal({
      spawningPool: document.createElement("div"),
      terminalConfig: computed(() => ({ fontFamily: "monospace", fontSize: 14, scrollback: 100 } as any)),
      terminalCopyOnSelect: computed(() => false),
      isMac: false,
      xtermColorTheme: computed(() => ({})),
      logger: { info: jest.fn() } as any,
      openLinkInBrowser: jest.fn(),
    }, { tabId: "terminal-test", api: api as any });

    return { api, terminal, xterm: (terminal as any).xterm as { inputHandler: (data: string) => void; focus: jest.Mock } };
  };

  it("retains input emitted before readiness and sends each chunk once in order", async () => {
    const { api, terminal, xterm } = createTerminal();

    xterm.inputHandler("kubectl ");
    xterm.inputHandler("get pods\r");

    expect(api.sendMessage).not.toHaveBeenCalled();

    api.isReady = true;
    api.readyState = WebSocketApiState.OPEN;
    api.emit("ready");
    xterm.inputHandler("after-ready\r");
    await Promise.resolve();

    expect(api.sendMessage.mock.calls).toEqual([
      [{ type: TerminalChannels.STDIN, data: "kubectl " }],
      [{ type: TerminalChannels.STDIN, data: "get pods\r" }],
      [{ type: TerminalChannels.STDIN, data: "after-ready\r" }],
    ]);
    terminal.destroy();
  });

  it("focuses xterm synchronously when attached to the visible terminal view", () => {
    jest.useFakeTimers();
    const { terminal, xterm } = createTerminal();

    try {
      terminal.attachTo(document.createElement("div"));

      expect(xterm.focus).toHaveBeenCalledTimes(1);
    } finally {
      terminal.destroy();
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    }
  });

  it("retains input entered during a later reconnect and sends it once ready again", async () => {
    const { api, terminal, xterm } = createTerminal();

    api.isReady = true;
    api.readyState = WebSocketApiState.OPEN;
    api.emit("ready");
    xterm.inputHandler("first\r");
    await Promise.resolve();
    expect(api.sendMessage).toHaveBeenCalledTimes(1);

    api.isReady = false;
    api.readyState = WebSocketApiState.RECONNECTING;
    xterm.inputHandler("during-reconnect\r");
    expect(api.sendMessage).toHaveBeenCalledTimes(1);

    api.isReady = true;
    api.readyState = WebSocketApiState.OPEN;
    api.emit("ready");
    xterm.inputHandler("after-reconnect\r");
    await Promise.resolve();

    expect(api.sendMessage.mock.calls).toEqual([
      [{ type: TerminalChannels.STDIN, data: "first\r" }],
      [{ type: TerminalChannels.STDIN, data: "during-reconnect\r" }],
      [{ type: TerminalChannels.STDIN, data: "after-reconnect\r" }],
    ]);
    terminal.destroy();
  });

  it("discards buffered input when the terminal is closed before readiness", () => {
    const { api, terminal, xterm } = createTerminal();

    xterm.inputHandler("stale-command\r");
    terminal.destroy();
    expect(api.listenerCount("ready")).toBe(0);
    api.isReady = true;
    api.emit("ready");

    expect(api.sendMessage).not.toHaveBeenCalled();
  });
});
