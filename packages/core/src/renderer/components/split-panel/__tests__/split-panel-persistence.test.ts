/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SplitPanelStore } from "../split-panel-store";
import { sanitizeSplitLayout } from "../../../../common/workspace/session-snapshot";

describe("SplitPanel Persistence & Inert Restoration Suite", () => {
  let store: SplitPanelStore;
  let mockStorage: Map<string, string>;

  beforeEach(() => {
    mockStorage = new Map();
    store = new SplitPanelStore({
      initialClusterId: "cluster-inert-test",
      getLocalStorageItem: (key) => mockStorage.get(key) ?? null,
      setLocalStorageItem: (key, value) => mockStorage.set(key, value),
    });
  });

  describe("Layout Serialization", () => {
    it("serializes valid split configuration without credentials or tokens", () => {
      store.setRatio(0.62);
      store.swapPanels();
      store.setResourceBinding({
        kind: "Deployment",
        name: "payment-service",
        namespace: "production",
      });

      const serialized = store.serializeLayout(1);

      expect(serialized).toEqual({
        version: 1,
        ratio: 0.62,
        isSwapped: true,
        isLeftClosed: false,
        isRightClosed: false,
        isClassicMode: false,
        leftPanelKind: "kubetail",
        rightPanelKind: "resource-details",
        resourceBinding: {
          kind: "Deployment",
          name: "payment-service",
          namespace: "production",
        },
      });

      // Also verify V2 and LayoutV1 serialization
      const serializedV2 = store.serializeLayout(2);
      expect(serializedV2.version).toBe(2);

      const serializedV3 = store.serializeLayout();
      expect(serializedV3.schemaVersion).toBe("LayoutV1");

      // Assert zero sensitive keys in output
      const json = JSON.stringify(serialized);
      const jsonV2 = JSON.stringify(serializedV2);
      const jsonV3 = JSON.stringify(serializedV3);

      expect(json).not.toMatch(/token|password|secret|kubeconfig|pty|buffer/i);
      expect(jsonV2).not.toMatch(/token|password|secret|kubeconfig|pty|buffer/i);
      expect(jsonV3).not.toMatch(/token|password|secret|kubeconfig|pty|buffer/i);
    });
  });

  describe("Inert Restoration & Allowlist Sanitization", () => {
    it("inertly restores layout state from valid payload without network requests", () => {
      const validPayload = {
        version: 1,
        ratio: 0.70,
        isSwapped: false,
        isLeftClosed: false,
        isRightClosed: true,
        isClassicMode: false,
        resourceBinding: {
          kind: "Deployment",
          name: "auth-gateway",
          namespace: "prod",
        },
      };

      const restored = store.restoreLayout(validPayload);

      expect(restored).toBe(true);
      expect(store.ratio).toBe(0.70);
      expect(store.isRightClosed).toBe(true);
      expect(store.isLeftClosed).toBe(false);
      expect(store.resourceBinding).toEqual({
        kind: "Deployment",
        name: "auth-gateway",
        namespace: "prod",
      });
    });

    it("sanitizes payload through sanitizeSplitLayout allowlist", () => {
      const untrustedRaw = {
        version: 1,
        ratio: 0.55,
        isSwapped: true,
        isLeftClosed: false,
        isRightClosed: false,
        isClassicMode: false,
        maliciousToken: "bearer eyJhbGciOi...",
        kubeconfig: "/root/.kube/config",
        secretPayload: "password123",
        resourceBinding: {
          kind: "Deployment",
          name: "api-server",
          namespace: "default",
          extraDangerousField: "rm -rf /",
        },
      };

      const clean = sanitizeSplitLayout(untrustedRaw);

      expect(clean).toBeDefined();
      expect((clean as any)?.ratio).toBe(0.55);
      expect((clean as any)?.isSwapped).toBe(true);
      expect((clean as any).maliciousToken).toBeUndefined();
      expect((clean as any).kubeconfig).toBeUndefined();
      expect((clean as any).secretPayload).toBeUndefined();
      expect(((clean as any)?.resourceBinding as any).extraDangerousField).toBeUndefined();
    });

    it("gracefully rejects corrupt, unversioned, or array payloads", () => {
      expect(store.restoreLayout(null)).toBe(false);
      expect(store.restoreLayout(undefined)).toBe(false);
      expect(store.restoreLayout("not-an-object")).toBe(false);
      expect(store.restoreLayout([1, 2, 3])).toBe(false);
      expect(store.restoreLayout({ version: 99 })).toBe(false);

      expect(sanitizeSplitLayout(null)).toBeUndefined();
      expect(sanitizeSplitLayout([1, 2])).toBeUndefined();
      expect(sanitizeSplitLayout({ version: 99 })).toBeUndefined();
    });

    it("prevents impossible state where both left and right panels are closed", () => {
      const impossiblePayload = {
        version: 1,
        ratio: 0.50,
        isSwapped: false,
        isLeftClosed: true,
        isRightClosed: true,
        isClassicMode: false,
      };

      const clean = sanitizeSplitLayout(impossiblePayload);

      expect((clean as any)?.isLeftClosed).toBe(false);
      expect((clean as any)?.isRightClosed).toBe(false);

      store.restoreLayout(impossiblePayload);
      expect(store.isLeftClosed).toBe(false);
      expect(store.isRightClosed).toBe(false);
    });
  });
});
