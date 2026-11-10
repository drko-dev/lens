/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { AiDefaultProfileService } from "../ai-default-profile-service";
import { AuthorizedOpenAiNetworkEngine, DefaultSecureAiTransport } from "../transport/secure-ai-transport";

describe("H8.8-06b: OpenAI-only authorization cannot enable DeepSeek", () => {
  it("does not incorrectly mark a DeepSeek default as available when only OpenAI is authorized", async () => {
    const engine = new AuthorizedOpenAiNetworkEngine();
    const transport = new DefaultSecureAiTransport({ engine });
    transport.authorizeOpenAiNetwork();
    const sqlite = { getDb: () => ({ prepare: () => ({ get: () => ({ default_profile_id: "deepseek-profile" }) }) }) };
    const profileManager = {
      getProfile: async () => ({
        id: "deepseek-profile",
        name: "DeepSeek",
        status: "active",
        provider: "deepseek",
        model: "deepseek-flash",
        availabilityStatus: "available",
      }),
    };
    const service = new AiDefaultProfileService(
      sqlite as any,
      profileManager as any,
      transport,
      { revokeConsentsForProfile: jest.fn() } as any,
    );

    expect(transport.isProviderNetworkEnabled("openai")).toBe(true);
    expect(transport.isProviderNetworkEnabled("deepseek")).toBe(false);
    const status = await service.getStatus();
    expect(status.state).toBe("blocked");
    expect(status.reason).toBe("external_network_disabled");
  });
});
