/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 *
 * Native permission gate with a fake Electron dialog; no real network.
 */
import { registerIncidentIpcHandlers } from "../setup-incident-ipc.injectable";
import { incidentIpcChannels } from "../../../common/incident/incident-ipc";

jest.mock("electron", () => ({
  ipcMain: { handle: jest.fn() },
  BrowserWindow: { fromWebContents: jest.fn(() => ({ isDestroyed: () => false })) },
  dialog: { showMessageBox: jest.fn() },
}));

const trustedEvent = {
  sender: { id: 42, isDestroyed: () => false },
  senderFrame: { url: "file:///index.html", parent: null, isDestroyed: () => false },
};
const untrustedEvent = {
  sender: { id: 43, isDestroyed: () => false },
  senderFrame: { url: "https://attacker.example.net", parent: null, isDestroyed: () => false },
};

describe("H8.8-06b: native OpenAI connection consent", () => {
  it("denies until the real user confirms an OS dialog, and rejects a foreign IPC sender", async () => {
    const registered = new Map<string, (event: any, ...args: any[]) => Promise<any>>();
    const ipc = { handle: (channel: string, handler: any) => registered.set(channel, handler) };
    let enabled = false;
    const oauth = {
      isExternalNetworkAvailable: jest.fn(() => enabled),
      authorizeExternalNetwork: jest.fn(() => { enabled = true; return true; }),
    };
    const electron = require("electron");
    const prompt = electron.dialog.showMessageBox as jest.Mock;

    registerIncidentIpcHandlers({} as any, {} as any, undefined, undefined,
      { profileManager: {} as any, oauthManager: oauth as any },
      ipc as any);

    const status = registered.get(incidentIpcChannels.aiGetOpenAiNetworkStatus)!;
    const authorize = registered.get(incidentIpcChannels.aiAuthorizeOpenAiNetwork)!;
    expect(await status(trustedEvent)).toBe(false);

    await expect(authorize(untrustedEvent)).rejects.toThrow();
    expect(prompt).not.toHaveBeenCalled();
    expect(oauth.authorizeExternalNetwork).not.toHaveBeenCalled();

    prompt.mockResolvedValueOnce({ response: 0 });
    expect(await authorize(trustedEvent)).toBe(false);
    expect(oauth.authorizeExternalNetwork).not.toHaveBeenCalled();
    expect(await status(trustedEvent)).toBe(false);

    prompt.mockResolvedValueOnce({ response: 1 });
    expect(await authorize(trustedEvent)).toBe(true);
    expect(oauth.authorizeExternalNetwork).toHaveBeenCalledTimes(1);
    expect(await status(trustedEvent)).toBe(true);

    // Same session: no needless extra prompt or credential transmission.
    expect(await authorize(trustedEvent)).toBe(true);
    expect(prompt).toHaveBeenCalledTimes(2);
    const consentText = JSON.stringify(prompt.mock.calls[0][1]);
    expect(consentText).toContain("auth.openai.com");
    expect(consentText).toContain("api.openai.com");
    expect(consentText).toContain("autorización separada");
  });
});
