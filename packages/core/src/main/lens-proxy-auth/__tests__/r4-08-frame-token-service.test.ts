/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { IpcMainInvokeEvent } from "electron";
import { proxyAuthChannels } from "../../../common/lens-proxy-auth/proxy-auth";
import { APP_SCOPE, ProxyAuthTokens } from "../../lens-proxy/proxy-auth-tokens";
import { FrameTokenService } from "../frame-token-service";

const PORT = 4321;

describe("R4-08 frame token service", () => {
  let tokens: ProxyAuthTokens;
  let service: FrameTokenService;
  let sent: Array<{ frame: [number, number]; channel: string; payload: unknown; sender: string }>;

  const makeSender = (name: string) => ({
    isDestroyed: () => false,
    sendToFrame: (frame: [number, number], channel: string, payload: unknown) => sent.push({ frame, channel, payload, sender: name }),
  });

  const event = (over: { processId?: unknown; frameId?: unknown; url?: unknown; parent?: unknown; senderFrame?: unknown; sender?: unknown }): IpcMainInvokeEvent => ({
    processId: 1,
    frameId: 10,
    sender: makeSender("wc"),
    senderFrame: { url: `https://a.lens.app:${PORT}/`, parent: {}},
    ...over,
    ...("url" in over || "parent" in over ? { senderFrame: { url: over.url ?? `https://a.lens.app:${PORT}/`, parent: "parent" in over ? over.parent : {}}} : {}),
  }) as unknown as IpcMainInvokeEvent;

  beforeEach(() => {
    sent = [];
    tokens = new ProxyAuthTokens();
    const frames = new Map([
      ["a", { processId: 1, frameId: 10 }],
      ["b", { processId: 1, frameId: 11 }],
    ]);

    service = new FrameTokenService({
      getClusterFrames: () => frames,
      getPort: () => PORT,
      getToken: scope => tokens.get(scope),
    });
  });

  it("gives cluster a its own token", () => {
    expect(service.handleGetFrameToken(event({}))).toBe(tokens.get("a"));
  });

  it("gives cluster b its own, different token", () => {
    const token = service.handleGetFrameToken(event({ frameId: 11, url: `https://b.lens.app:${PORT}/x` }));

    expect(token).toBe(tokens.get("b"));
    expect(token).not.toBe(tokens.get("a"));
  });

  it("gives the app token to the top frame of lens.app", () => {
    expect(service.handleGetFrameToken(event({ processId: 2, frameId: 1, url: `https://lens.app:${PORT}/`, parent: null }))).toBe(tokens.get(APP_SCOPE));
  });

  it.each([
    ["frame of a claiming b (origin b)", { url: `https://b.lens.app:${PORT}/` }],
    ["frame of b claiming a (origin a)", { frameId: 11 }],
    ["forged frame id", { frameId: 99 }],
    ["forged process id", { processId: 99 }],
    ["wrong port", { url: `https://a.lens.app:1/` }],
    ["wrong scheme", { url: `http://a.lens.app:${PORT}/` }],
    ["lookalike host", { url: `https://a.lens.app.evil.com:${PORT}/` }],
    ["unknown cluster origin", { url: `https://zzz.lens.app:${PORT}/` }],
    ["detached window file url", { url: "file:///app/detached.html", parent: null }],
    ["non-string url", { url: 5 }],
    ["unparsable url", { url: "not a url" }],
    ["lens.app non-top frame", { url: `https://lens.app:${PORT}/`, parent: {}}],
    ["missing senderFrame", { senderFrame: null }],
    ["non-numeric frameId", { frameId: "10" }],
  ])("denies %s", (_name, over) => {
    expect(() => service.handleGetFrameToken(event(over))).toThrow("Unauthorized frame token request.");
  });

  it("denies when a payload is present", () => {
    expect(() => service.handleGetFrameToken(event({}), "a")).toThrow("Unauthorized frame token request.");
    expect(() => service.handleGetFrameToken(event({}), undefined)).toThrow("Unauthorized frame token request.");
  });

  it("denies a missing event", () => {
    expect(() => service.handleGetFrameToken(undefined as never)).toThrow("Unauthorized frame token request.");
  });

  it("error message carries no token or detail", () => {
    try {
      service.handleGetFrameToken(event({ frameId: 99 }));
    } catch (error) {
      expect(String(error)).not.toContain(tokens.get("a"));
      expect(String(error)).toBe("Error: Unauthorized frame token request.");
    }
  });

  describe("rotation", () => {
    it("pushes only to the frame owning the scope", () => {
      const senderA = makeSender("A");
      const senderB = makeSender("B");
      const senderRoot = makeSender("root");

      service.handleGetFrameToken(event({ sender: senderA }));
      service.handleGetFrameToken(event({ frameId: 11, url: `https://b.lens.app:${PORT}/`, sender: senderB }));
      service.handleGetFrameToken(event({ processId: 2, frameId: 1, url: `https://lens.app:${PORT}/`, parent: null, sender: senderRoot }));

      tokens.onRotated((scope, token) => service.handleRotated(scope, token));
      tokens.rotate("a");

      expect(sent).toEqual([{ frame: [1, 10], channel: proxyAuthChannels.frameTokenRotated, payload: { token: tokens.get("a") }, sender: "A" }]);

      sent.length = 0;
      tokens.rotate(APP_SCOPE);

      expect(sent).toEqual([{ frame: [2, 1], channel: proxyAuthChannels.frameTokenRotated, payload: { token: tokens.get(APP_SCOPE) }, sender: "root" }]);
    });

    it("sends nothing for a scope without an authorized frame", () => {
      service.handleRotated("a", "x");
      expect(sent).toEqual([]);
    });

    it("does not throw when the frame is gone", () => {
      const broken = { isDestroyed: () => false, sendToFrame: () => { throw new Error("gone"); } };

      service.handleGetFrameToken(event({ sender: broken }));
      expect(() => service.handleRotated("a", "x")).not.toThrow();
    });
  });
});
