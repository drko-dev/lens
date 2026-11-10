/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 *
 * H8.8-06b: all tests intercept DNS/HTTPS; no external requests or credentials.
 */

import dns from "node:dns/promises";
import https from "node:https";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { AuthorizedOpenAiNetworkEngine, DefaultSecureAiTransport } from "../secure-ai-transport";
import type { AiTransportRequest } from "../ai-transport-types";

const authRequest = (): AiTransportRequest => ({
  endpoint: "https://auth.openai.com/api/accounts/oauth/token",
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: "grant_type=authorization_code&code=synthetic",
  timeoutMs: 1500,
  provider: "openai",
});

afterEach(() => jest.restoreAllMocks());

describe("H8.8-06b OpenAI opt-in and DNS-pinned TLS transport", () => {
  it("remains offline by default, even with a physically capable engine", async () => {
    const engine = new AuthorizedOpenAiNetworkEngine();
    const transport = new DefaultSecureAiTransport({ engine });
    const network = jest.spyOn(https, "request");
    const lookup = jest.spyOn(dns, "lookup");

    expect(transport.isExternalNetworkEnabled()).toBe(false);
    await expect(transport.execute(authRequest())).rejects.toThrow(/disabled/i);
    expect(network).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
    expect(engine.isAuthorized()).toBe(false);
    expect(transport.isProviderNetworkEnabled("openai")).toBe(false);
    expect(transport.isProviderNetworkEnabled("deepseek")).toBe(false);
  });

  it("requires explicit authorization and forbids all other hosts and providers before DNS", async () => {
    const transport = new DefaultSecureAiTransport({ engine: new AuthorizedOpenAiNetworkEngine() });
    const lookup = jest.spyOn(dns, "lookup");
    const network = jest.spyOn(https, "request");

    expect(transport.authorizeOpenAiNetwork()).toBe(true);
    expect(transport.isExternalNetworkEnabled()).toBe(true);
    expect(transport.isProviderNetworkEnabled("openai")).toBe(true);
    expect(transport.isProviderNetworkEnabled("deepseek")).toBe(false);

    await expect(transport.execute({
      ...authRequest(),
      endpoint: "https://api.deepseek.com/v1/chat/completions",
      provider: "deepseek",
    })).rejects.toThrow(/only official OpenAI HTTPS hosts/);
    await expect(transport.execute({
      ...authRequest(),
      endpoint: "https://evil.openai.com/oauth/token",
    })).rejects.toThrow(/only official OpenAI HTTPS hosts/);
    expect(network).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects DNS rebinding to local or metadata IP before any socket opens", async () => {
    const transport = new DefaultSecureAiTransport({ engine: new AuthorizedOpenAiNetworkEngine() });
    transport.authorizeOpenAiNetwork();
    jest.spyOn(dns, "lookup").mockResolvedValue([{ address: "169.254.169.254", family: 4 }] as any);
    const network = jest.spyOn(https, "request");

    await expect(transport.execute(authRequest())).rejects.toThrow(/private|reserved|blocked|SSRF|metadata|forbidden/i);
    expect(network).not.toHaveBeenCalled();
  });

  it("pins the validated public IP, checks TLS peer and accepts a bounded synthetic response", async () => {
    const selectedIp = "93.184.216.34";
    jest.spyOn(dns, "lookup").mockResolvedValue([{ address: selectedIp, family: 4 }] as any);
    let requestOptions: any;
    const network = jest.spyOn(https, "request").mockImplementation(((_url: any, options: any, callback: any) => {
      requestOptions = options;
      const request = new EventEmitter() as any;
      request.end = jest.fn((_body?: string) => {
        const response: any = Readable.from([Buffer.from('{"verified":true}')]);
        response.statusCode = 200;
        response.statusMessage = "OK";
        response.headers = { "content-type": "application/json" };
        response.socket = { remoteAddress: selectedIp, encrypted: true, authorized: true };
        callback(response);
      });
      request.destroy = jest.fn();
      return request;
    }) as any);

    const transport = new DefaultSecureAiTransport({ engine: new AuthorizedOpenAiNetworkEngine() });
    transport.authorizeOpenAiNetwork();
    const response = await transport.execute(authRequest());

    expect(response.json()).toEqual({ verified: true });
    expect(network).toHaveBeenCalledTimes(1);
    expect(requestOptions.servername).toBe("auth.openai.com");
    expect(requestOptions.rejectUnauthorized).toBe(true);
    expect(requestOptions.agent.options.keepAlive).toBe(false);
    const bound = await new Promise<string>((resolve, reject) => {
      requestOptions.agent.options.lookup("auth.openai.com", {}, (error: Error | null, address: string) => {
        if (error) reject(error); else resolve(address);
      });
    });
    expect(bound).toBe(selectedIp);
  });

  it("rejects a TLS socket at an unexpected address, even if DNS was previously safe", async () => {
    jest.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as any);
    jest.spyOn(https, "request").mockImplementation(((_url: any, _options: any, callback: any) => {
      const request = new EventEmitter() as any;
      request.end = jest.fn(() => {
        const response: any = Readable.from([]);
        response.on("error", () => {}); // prevent synthetic EventEmitter unhandled error
        response.statusCode = 200;
        response.statusMessage = "OK";
        response.headers = {};
        response.socket = { remoteAddress: "127.0.0.1", encrypted: true, authorized: true };
        callback(response);
      });
      request.destroy = jest.fn();
      return request;
    }) as any);
    const transport = new DefaultSecureAiTransport({ engine: new AuthorizedOpenAiNetworkEngine() });
    transport.authorizeOpenAiNetwork();
    await expect(transport.execute(authRequest())).rejects.toThrow(/peer does not match/);
  });
});
