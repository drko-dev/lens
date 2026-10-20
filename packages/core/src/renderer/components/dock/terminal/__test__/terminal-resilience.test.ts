/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { TerminalStore } from "../store";
import type { TerminalApi } from "../../../../api/terminal-api";
import { WebSocketApiState } from "../../../../api/websocket-api";
import { TabKind } from "../../dock/store";

describe("Terminal Session Resilience (R2-04)", () => {
  let terminalStore: TerminalStore;
  let mockApi: Partial<TerminalApi>;
  let mockCreateTerminal: jest.Mock;
  let mockCreateTerminalApi: jest.Mock;

  const tabId = "term-tab-1";
  const mockTab = {
    id: tabId,
    kind: TabKind.TERMINAL,
    title: "Terminal 1",
    pinned: false,
  };

  beforeEach(() => {
    mockApi = {
      connect: jest.fn(),
      destroy: jest.fn(),
      readyState: WebSocketApiState.OPEN,
      isCleanExit: false,
    };

    mockCreateTerminal = jest.fn().mockReturnValue({
      destroy: jest.fn(),
    });

    mockCreateTerminalApi = jest.fn().mockReturnValue(mockApi);

    terminalStore = new TerminalStore({
      createTerminal: mockCreateTerminal,
      createTerminalApi: mockCreateTerminalApi,
    });
  });

  afterEach(() => {
    terminalStore.destroy(tabId);
  });

  it("establishes connection and tracks connected state", () => {
    terminalStore.connect(mockTab);

    expect(terminalStore.isConnected(tabId)).toBe(true);
    expect(terminalStore.isDisconnected(tabId)).toBe(false);
    expect(terminalStore.isCleanExit(tabId)).toBe(false);
  });

  it("distinguishes between unexpected disconnection and clean exit", () => {
    terminalStore.connect(mockTab);

    const api = terminalStore.getTerminalApi(tabId)!;

    // Simulate unexpected drop (e.g. computer sleep or network disconnect)
    api.readyState = WebSocketApiState.CLOSED;
    api.isCleanExit = false;

    expect(terminalStore.isDisconnected(tabId)).toBe(true);
    expect(terminalStore.isCleanExit(tabId)).toBe(false);

    // Simulate clean shell exit (e.g. user typed 'exit' -> code 1000)
    api.isCleanExit = true;
    expect(terminalStore.isCleanExit(tabId)).toBe(true);
  });

  it("allows reconnecting an unexpectedly disconnected session without destroying terminal instance", () => {
    terminalStore.connect(mockTab);

    const api = terminalStore.getTerminalApi(tabId)!;

    api.readyState = WebSocketApiState.CLOSED;
    expect(terminalStore.isDisconnected(tabId)).toBe(true);

    // Reconnecting invokes api.connect()
    terminalStore.reconnect(tabId);
    expect(mockApi.connect).toHaveBeenCalled();

    // Terminal instance was preserved
    expect(mockCreateTerminal).toHaveBeenCalledTimes(1);
  });
});
