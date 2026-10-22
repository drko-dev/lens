/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { observable } from "mobx";
import type { ClusterFrameInfo } from "../../../../../common/cluster-frames.injectable";

const handlers = new Map<string, (...args: any[]) => any>();

jest.mock("../../../../../common/ipc", () => ({
  ipcMainHandle: (channel: string, handler: (...args: any[]) => any) => handlers.set(channel, handler),
  ipcMainOn: jest.fn(),
  broadcastMainChannel: "broadcast",
  broadcastMessage: jest.fn(),
}));
jest.mock("electron", () => ({ BrowserWindow: {}, Menu: {}}));
jest.mock("../../../../ipc/window", () => ({ handleWindowAction: jest.fn(), onLocationChange: jest.fn() }));
jest.mock("../../../../../features/application-menu/main/populate-application-menu.injectable", () => ({ getApplicationMenuTemplate: jest.fn() }));

import { setupIpcMainHandlers } from "../setup-ipc-main-handlers";
import { clusterSetFrameIdHandler } from "../../../../../common/ipc/cluster";

const PORT = 4321;
const frame = (url: string, parent: unknown = {}) => ({ senderFrame: { url, parent }, frameId: 7, processId: 3 });

describe("R4-09 cluster:set-frame-id sender validation", () => {
  let clusterFrames: ReturnType<typeof observable.map<string, ClusterFrameInfo>>;
  let push: jest.Mock;
  let warn: jest.Mock;
  let call: (event: unknown, payload: unknown) => void;

  beforeEach(() => {
    handlers.clear();
    clusterFrames = observable.map<string, ClusterFrameInfo>();
    push = jest.fn();
    warn = jest.fn();
    setupIpcMainHandlers({
      applicationMenuItemComposite: {} as never,
      getClusterById: (id: string) => (["a", "b"].includes(id) ? ({ id } as never) : undefined),
      pushCatalogToRenderer: push,
      clusterFrames,
      clusters: { get: () => [] } as never,
      getLensProxyPort: () => PORT,
      logger: { warn } as never,
    });
    const handler = handlers.get(clusterSetFrameIdHandler) as (...args: any[]) => any;

    call = (event, payload) => handler(event, payload);
  });

  const expectRejected = (event: unknown, payload: unknown) => {
    clusterFrames.set("a", { frameId: 1, processId: 1 });
    call(event, payload);
    expect(clusterFrames.get("a")).toEqual({ frameId: 1, processId: 1 });
    expect(clusterFrames.has("b")).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  };

  it("rejects wrong origin", () => expectRejected(frame(`https://evil.example:${PORT}/`), "a"));
  it("rejects wrong port", () => expectRejected(frame(`https://a.lens.app:${PORT + 1}/`), "a"));
  it("rejects another cluster's origin overwriting a mapping", () => expectRejected(frame(`https://b.lens.app:${PORT}/`), "a"));
  it("rejects the top frame", () => expectRejected(frame(`https://a.lens.app:${PORT}/`, null), "a"));
  it("rejects a missing senderFrame", () => expectRejected({ frameId: 1, processId: 1 }, "a"));
  it("rejects a non-string payload", () => expectRejected(frame(`https://a.lens.app:${PORT}/`), { toString: () => "a" }));

  it("rejects an unknown cluster even with a matching origin", () => {
    call(frame(`https://zzz.lens.app:${PORT}/`), "zzz");
    expect(clusterFrames.size).toBe(0);
    expect(push).not.toHaveBeenCalled();
  });

  it("accepts own origin and a reload re-registration", () => {
    call(frame(`https://a.lens.app:${PORT}/`), "a");
    expect(clusterFrames.get("a")).toEqual({ frameId: 7, processId: 3 });
    call({ ...frame(`https://a.lens.app:${PORT}/`), frameId: 9 }, "a");
    expect(clusterFrames.get("a")).toEqual({ frameId: 9, processId: 3 });
    expect(push).toHaveBeenCalledTimes(2);
  });
});
