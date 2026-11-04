/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { ipcRenderer } from "electron";
import { TERMINAL_AUTHORIZATION_CHANNEL } from "../../../common/terminal-shell-channels";
import { TerminalApi } from "../terminal-api";

jest.mock("electron", () => ({ ipcRenderer: { invoke: jest.fn() }}));

const invoke = ipcRenderer.invoke as jest.Mock;

const makeApi = (query: Record<string, string>) => new TerminalApi({
  hostedClusterId: "c1",
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any,
  defaultParams: { logging: false, reconnectDelay: 10, flushOnOpen: false, pingMessage: "PING" } as any,
}, { id: "t1", ...query } as any);

describe("H7.6.3E: terminal api asks Main for the PROD grant before connecting", () => {
  beforeEach(() => invoke.mockReset());

  it("local/pod: a denied grant stops the connection before any shell token is requested", async () => {
    invoke.mockResolvedValue({ granted: false, reason: "confirmation-denied" });
    const api = makeApi({});
    const emit = jest.spyOn(api as any, "emitError");

    await api.connect();

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(TERMINAL_AUTHORIZATION_CHANNEL, { clusterId: "c1", tabId: "t1" });
    expect(emit).toHaveBeenCalled();
  });

  it("local/pod: a malformed Main response fails closed", async () => {
    invoke.mockResolvedValue(Uint8Array.from([1]));

    await makeApi({ pod: "p" }).connect();

    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("node shells keep using their own Main-issued grant and skip this request", async () => {
    invoke.mockResolvedValue(undefined);

    await expect(makeApi({ node: "n1" }).connect()).rejects.toThrow("ShellApi token");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe("cluster:shell-api");
  });
});
