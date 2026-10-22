/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { TerminalApi } from "../terminal-api";

const makeApi = () => new TerminalApi({
  hostedClusterId: "c1",
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any,
  defaultParams: { logging: false, reconnectDelay: 10, flushOnOpen: false, pingMessage: "PING" } as any,
}, { id: "t1" });

describe("R4-06B TerminalApi suspend/resume", () => {
  afterEach(() => jest.useRealTimers());

  it("a suspended client never asks for a shell token, so it cannot connect or reconnect", async () => {
    const api = makeApi();
    const connect = jest.spyOn(api as any, "emitStatus");

    api.suspend();
    // would throw (ipcRenderer.invoke is not mocked) if the guard were missing
    await expect(api.connect()).resolves.toBeUndefined();
    expect(connect).not.toHaveBeenCalled();
    expect(api.isSuspended).toBe(true);
    api.destroy();
  });

  it("an abnormal close while suspended schedules no auto-reconnect", () => {
    jest.useFakeTimers();
    const api = makeApi();
    const connectSpy = jest.spyOn(api, "connect");

    (api as any).socket = { url: "ws://x" };
    api.suspend();
    (api as any)._onClose({ code: 4001, wasClean: true } as CloseEvent);
    jest.advanceTimersByTime(60_000);

    expect(connectSpy).not.toHaveBeenCalled();
  });

  it("resume re-enables connecting", async () => {
    const api = makeApi();
    const connectSpy = jest.spyOn(api, "connect").mockResolvedValue(undefined);

    api.suspend();
    await api.resume();

    expect(api.isSuspended).toBe(false);
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });
});
