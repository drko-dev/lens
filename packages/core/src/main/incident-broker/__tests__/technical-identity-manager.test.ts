/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { KubernetesTechnicalIdentityManager } from "../technical-identity-manager";
import { MAX_TOKEN_TTL_SECONDS } from "../../../common/incident/broker-types";

describe("H8-010: KubernetesTechnicalIdentityManager", () => {
  it("requests and bounds ServiceAccount token TTL to maximum allowed", async () => {
    let capturedTtl = 0;
    const mockExecutor = jest.fn().mockImplementation(async params => {
      capturedTtl = params.ttlSeconds;

      return {
        token: "synthetic-token-bounded-12345",
        expirationTimestamp: Date.now() + params.ttlSeconds * 1000,
      };
    });

    const manager = new KubernetesTechnicalIdentityManager(mockExecutor);

    // Request with 24 hours (exceeding MAX_TOKEN_TTL_SECONDS)
    const identity = await manager.requestTechnicalToken({
      clusterId: "cluster-1",
      ttlSeconds: 86400,
    });

    expect(capturedTtl).toBe(MAX_TOKEN_TTL_SECONDS); // Bounded to 3600s
    expect(identity.token).toBe("synthetic-token-bounded-12345");
    expect(identity.audience).toBe("openlens-ai-investigator");

    // Token retrieved from memory
    const active = manager.getActiveIdentity("cluster-1");
    expect(active?.token).toBe("synthetic-token-bounded-12345");
  });

  it("revokes token immediately from RAM", () => {
    const manager = new KubernetesTechnicalIdentityManager();
    manager.registerTechnicalIdentity("cluster-1", {
      serviceAccountName: "openlens-ai-investigator",
      serviceAccountNamespace: "kube-system",
      audience: "openlens-ai-investigator",
      token: "secret-token",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60000,
    });

    expect(manager.getActiveIdentity("cluster-1")).toBeDefined();

    manager.revokeToken("cluster-1");

    expect(manager.getActiveIdentity("cluster-1")).toBeUndefined();
  });

  it("automatically purges and refuses expired tokens", () => {
    const manager = new KubernetesTechnicalIdentityManager();
    // Register token with expiration within the 5-second grace window
    (manager as any).tokensByCluster.set("cluster-1", {
      serviceAccountName: "openlens-ai-investigator",
      serviceAccountNamespace: "kube-system",
      audience: "openlens-ai-investigator",
      token: "expired-token",
      issuedAt: Date.now() - 10000,
      expiresAt: Date.now() + 2000, // 2s remaining < 5s grace window
    });

    expect(manager.getActiveIdentity("cluster-1")).toBeUndefined();
  });
});
