/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { HorizontalPodAutoscalerApi } from "../endpoints/horizontal-pod-autoscaler.api";
import { PodDisruptionBudgetApi } from "../endpoints/pod-disruption-budget.api";
import { PodSecurityPolicyApi } from "../endpoints/pod-security-policy.api";
import { KubeObjectStore } from "../kube-object.store";
import type { Pod } from "@openlens/kube-object";
import type { KubeJsonApi } from "../kube-json-api";

describe("R3-01 Kubernetes API Compatibility, Discovery & RBAC Handling", () => {
  const dummyDeps = {
    logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() } as any,
    maybeKubeApi: undefined,
  };
  describe("API Version Negotiation", () => {
    it("HorizontalPodAutoscalerApi prioritizes autoscaling/v2 over v2beta2 and v1", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation((url: string) => {
          if (url === "/apis/autoscaling") {
            return Promise.resolve({
              name: "autoscaling",
              versions: [
                { groupVersion: "autoscaling/v2", version: "v2" },
                { groupVersion: "autoscaling/v2beta2", version: "v2beta2" },
                { groupVersion: "autoscaling/v1", version: "v1" },
              ],
              preferredVersion: { groupVersion: "autoscaling/v2", version: "v2" },
            });
          }
          if (url === "/apis/autoscaling/v2") {
            return Promise.resolve({
              resources: [{ name: "horizontalpodautoscalers", kind: "HorizontalPodAutoscaler", namespaced: true }],
            });
          }
          return Promise.reject(new Error(`Endpoint not found: ${url}`));
        }),
      } as unknown as KubeJsonApi;

      const hpaApi = new HorizontalPodAutoscalerApi(
        dummyDeps,
        { request: mockRequest },
      );

      await (hpaApi as any).checkPreferredVersion();
      expect(hpaApi.apiVersionWithGroup).toBe("autoscaling/v2");
    });

    it("HorizontalPodAutoscalerApi falls back to v2beta2 on clusters that do not support v2", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation((url: string) => {
          if (url === "/apis/autoscaling") {
            return Promise.resolve({
              name: "autoscaling",
              versions: [
                { groupVersion: "autoscaling/v2beta2", version: "v2beta2" },
                { groupVersion: "autoscaling/v1", version: "v1" },
              ],
              preferredVersion: { groupVersion: "autoscaling/v2beta2", version: "v2beta2" },
            });
          }
          if (url === "/apis/autoscaling/v2beta2") {
            return Promise.resolve({
              resources: [{ name: "horizontalpodautoscalers", kind: "HorizontalPodAutoscaler", namespaced: true }],
            });
          }
          return Promise.reject(new Error(`Endpoint not found: ${url}`));
        }),
      } as unknown as KubeJsonApi;

      const hpaApi = new HorizontalPodAutoscalerApi(
        dummyDeps,
        { request: mockRequest },
      );

      await (hpaApi as any).checkPreferredVersion();
      expect(hpaApi.apiVersionWithGroup).toBe("autoscaling/v2beta2");
    });

    it("PodDisruptionBudgetApi prioritizes policy/v1 over policy/v1beta1", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation((url: string) => {
          if (url === "/apis/policy") {
            return Promise.resolve({
              name: "policy",
              versions: [
                { groupVersion: "policy/v1", version: "v1" },
                { groupVersion: "policy/v1beta1", version: "v1beta1" },
              ],
              preferredVersion: { groupVersion: "policy/v1", version: "v1" },
            });
          }
          if (url === "/apis/policy/v1") {
            return Promise.resolve({
              resources: [{ name: "poddisruptionbudgets", kind: "PodDisruptionBudget", namespaced: true }],
            });
          }
          return Promise.reject(new Error(`Endpoint not found: ${url}`));
        }),
      } as unknown as KubeJsonApi;

      const pdbApi = new PodDisruptionBudgetApi(
        dummyDeps,
        { request: mockRequest },
      );

      await (pdbApi as any).checkPreferredVersion();
      expect(pdbApi.apiVersionWithGroup).toBe("policy/v1");
    });

    it("PodSecurityPolicyApi throws clean error when API is completely removed in K8s 1.25+", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation((url: string) => {
          if (url === "/apis/policy") {
            return Promise.resolve({
              name: "policy",
              versions: [{ groupVersion: "policy/v1", version: "v1" }],
              preferredVersion: { groupVersion: "policy/v1", version: "v1" },
            });
          }
          if (url === "/apis/policy/v1") {
            return Promise.resolve({
              resources: [{ name: "poddisruptionbudgets", kind: "PodDisruptionBudget", namespaced: true }],
            });
          }
          return Promise.reject(new Error(`Endpoint not found: ${url}`));
        }),
      } as unknown as KubeJsonApi;

      const pspApi = new PodSecurityPolicyApi(
        dummyDeps,
        { request: mockRequest, checkPreferredVersion: true },
      );

      await expect((pspApi as any).checkPreferredVersion()).rejects.toThrow(
        /Can't find working API for the Kubernetes resource/i,
      );
    });
  });

  describe("KubeObjectStore Error & RBAC State Tracking", () => {
    class TestPodStore extends KubeObjectStore<Pod> {
      api: any;
      constructor(api: any, context: any) {
        super({ context } as any, api);
        this.api = api;
      }
    }

    it("captures lastError and sets failedLoading=true when loadAll fails with 403 Forbidden", async () => {
      const forbiddenError = Object.assign(new Error("User cannot list pods in namespace default: 403 Forbidden"), {
        statusCode: 403,
      });

      const mockApi = {
        apiBase: "/api/v1/pods",
        isNamespaced: true,
        kind: "Pod",
        list: jest.fn().mockRejectedValue(forbiddenError),
      };

      const mockContext = {
        contextNamespaces: ["default"],
        isLoadingAll: () => false,
      };

      const store = new TestPodStore(mockApi, mockContext);
      expect(store.lastError).toBeUndefined();
      expect(store.failedLoading).toBe(false);

      await store.loadAll();

      expect(store.failedLoading).toBe(true);
      expect(store.lastError).toBe(forbiddenError);
      expect(store.lastError.statusCode).toBe(403);
    });

    it("clears lastError and failedLoading on subsequent successful loadAll", async () => {
      const mockApi = {
        apiBase: "/api/v1/pods",
        isNamespaced: true,
        kind: "Pod",
        list: jest.fn()
          .mockRejectedValueOnce(Object.assign(new Error("503 Service Unavailable"), { statusCode: 503 }))
          .mockResolvedValueOnce([]),
      };

      const mockContext = {
        contextNamespaces: ["default"],
        isLoadingAll: () => false,
      };

      const store = new TestPodStore(mockApi, mockContext);

      // First attempt fails
      await store.loadAll();
      expect(store.failedLoading).toBe(true);
      expect(store.lastError).toBeDefined();

      // Second attempt succeeds
      await store.loadAll();
      expect(store.failedLoading).toBe(false);
      expect(store.lastError).toBeUndefined();
      expect(store.isLoaded).toBe(true);
    });
  });
});
