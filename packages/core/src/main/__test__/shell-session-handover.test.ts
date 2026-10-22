/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { EventEmitter } from "events";
import { ShellSession, WebSocketCloseEvent } from "../shell-session/shell-session";
import { ShellSessionHandover } from "../shell-session/shell-session-handover.injectable";

class FakeSocket extends EventEmitter {
  OPEN = 1;
  readyState = 1;
  send = jest.fn();
  close = jest.fn((code: number) => {
    this.readyState = 3;
    // ws echoes the close code to the 'close' listeners
    this.emit("close", code);
  });
}

class TestSession extends ShellSession {
  ShellType = "test";
  protected get cwd() {
    return undefined;
  }
  open() {
    return this.openShellProcess("sh", [], {});
  }
}

function makeSession() {
  const processes = new Map<string, any>();
  const handover = new ShellSessionHandover();
  const pty = { pid: 1, kill: jest.fn(), write: jest.fn(), resize: jest.fn(), onData: jest.fn(() => ({ dispose: jest.fn() })), onExit: jest.fn() };
  const spawnPty = jest.fn(() => pty);
  const websocket = new FakeSocket();
  const session = new TestSession({
    isWindows: false,
    isMac: false,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), silly: jest.fn() },
    shellSessionProcesses: processes,
    shellSessionHandover: handover,
    spawnPty,
    emitAppEvent: jest.fn(),
    stat: jest.fn(async () => ({ isDirectory: () => true })),
  } as any, { websocket: websocket as any, cluster: { id: "c1", disconnected: { get: () => false }, getMeta: () => ({}) } as any, tabId: "t1", kubectl: {} as any });

  return { session, processes, handover, pty, spawnPty, websocket };
}

describe("R4-06B shell session handover", () => {
  it("closing the dock websocket normally still kills the PTY (regression)", async () => {
    const { session, pty, processes, websocket } = makeSession();

    await session.open();
    websocket.emit("close", WebSocketCloseEvent.NormalClosure);

    expect(pty.kill).toHaveBeenCalledTimes(1);
    expect(processes.has("c1:t1")).toBe(false);
  });

  it("closeConsumer disconnects the dock with the private handover code and the held PTY survives", async () => {
    const { session, pty, processes, websocket, handover } = makeSession();

    await session.open();
    handover.hold("c1:t1");
    handover.closeConsumer("c1:t1");

    expect(websocket.close).toHaveBeenCalledWith(WebSocketCloseEvent.DetachedHandover);
    expect(pty.kill).not.toHaveBeenCalled();
    expect(processes.get("c1:t1")).toBe(pty);
  });

  it("even a 1000 close while held does not kill the PTY", async () => {
    const { session, pty, processes, websocket, handover } = makeSession();

    await session.open();
    handover.hold("c1:t1");
    websocket.emit("close", WebSocketCloseEvent.NormalClosure);

    expect(pty.kill).not.toHaveBeenCalled();
    expect(processes.has("c1:t1")).toBe(true);
  });

  it("a dock connection while the PTY is held is refused: no second consumer, no spawn", async () => {
    const { session, spawnPty, websocket, handover, pty } = makeSession();

    handover.hold("c1:t1");
    await session.open();

    expect(spawnPty).not.toHaveBeenCalled();
    expect(pty.onData).not.toHaveBeenCalled();
    expect(websocket.close).toHaveBeenCalledWith(WebSocketCloseEvent.DetachedHandover);
  });

  it("after release the dock resumes the very same process", async () => {
    const { session, spawnPty, handover, processes, pty } = makeSession();

    processes.set("c1:t1", pty);
    handover.hold("c1:t1");
    handover.release("c1:t1");
    await session.open();

    expect(spawnPty).not.toHaveBeenCalled();
    expect(pty.onData).toHaveBeenCalledTimes(1);
  });
});
