/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  GRPCRoute,
  GRPCRouteApi,
  TLSRoute,
  ReferenceGrant,
  ReferenceGrantApi,
} from "../endpoints/gateway.api";
import type { KubeJsonApi } from "../../k8s-api/kube-json-api";

const dummyDeps = {
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  maybeKubeApi: jest.fn(),
} as any;

describe("R8-02 Gateway API Extension Models", () => {
  describe("GRPCRoute Model & API", () => {
    it("parses parent refs, hostnames, gRPC method rules, and backend services", () => {
      const route = new GRPCRoute({
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "GRPCRoute",
        metadata: {
          name: "grpc-auth-route",
          namespace: "prod",
          selfLink: "/apis/gateway.networking.k8s.io/v1/namespaces/prod/grpcroutes/grpc-auth-route",
          uid: "grpc-1",
          resourceVersion: "1",
          creationTimestamp: "2026-10-24T12:00:00Z",
        },
        spec: {
          parentRefs: [
            { name: "main-gateway", namespace: "infra" },
          ],
          hostnames: ["grpc.example.com"],
          rules: [
            {
              matches: [
                {
                  method: {
                    service: "auth.v1.AuthService",
                    method: "Authenticate",
                  },
                },
              ],
              backendRefs: [
                { name: "auth-svc", port: 50051 },
              ],
            },
          ],
        },
      });

      expect(route.getName()).toBe("grpc-auth-route");
      expect(route.getNs()).toBe("prod");
      expect(route.getHostnames()).toEqual(["grpc.example.com"]);
      expect(route.getParentGateways()).toEqual(["infra/main-gateway"]);
      expect(route.getServicesSummary()).toBe("auth.v1.AuthService.Authenticate");
      expect(route.getBackendServices()).toEqual(["auth-svc:50051"]);
    });

    it("falls back to * when no specific gRPC methods are defined", () => {
      const route = new GRPCRoute({
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "GRPCRoute",
        metadata: {
          name: "catchall-grpc",
          namespace: "default",
          selfLink: "/apis/gateway.networking.k8s.io/v1/namespaces/default/grpcroutes/catchall-grpc",
          uid: "grpc-catchall",
          resourceVersion: "1",
        },
        spec: {},
      });

      expect(route.getServicesSummary()).toBe("* (All Services)");
      expect(route.getBackendServices()).toEqual([]);
    });

    it("GRPCRouteApi supports v1 negotiation and v1alpha2 fallback", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation((url: string) => {
          if (url === "/apis/gateway.networking.k8s.io") {
            return Promise.resolve({
              name: "gateway.networking.k8s.io",
              versions: [
                { groupVersion: "gateway.networking.k8s.io/v1", version: "v1" },
                { groupVersion: "gateway.networking.k8s.io/v1alpha2", version: "v1alpha2" },
              ],
              preferredVersion: { groupVersion: "gateway.networking.k8s.io/v1", version: "v1" },
            });
          }

          if (url === "/apis/gateway.networking.k8s.io/v1") {
            return Promise.resolve({
              resources: [{ name: "grpcroutes", kind: "GRPCRoute", namespaced: true }],
            });
          }

          return Promise.reject(new Error(`Not found: ${url}`));
        }),
      } as unknown as KubeJsonApi;

      const api = new GRPCRouteApi(dummyDeps, { request: mockRequest });

      await (api as any).checkPreferredVersion();
      expect(api.apiVersionWithGroup).toBe("gateway.networking.k8s.io/v1");
    });
  });

  describe("TLSRoute Model", () => {
    it("parses parent refs, hostnames, and backend services", () => {
      const route = new TLSRoute({
        apiVersion: "gateway.networking.k8s.io/v1alpha2",
        kind: "TLSRoute",
        metadata: {
          name: "passthrough-tls",
          namespace: "security",
          selfLink: "/apis/gateway.networking.k8s.io/v1alpha2/namespaces/security/tlsroutes/passthrough-tls",
          uid: "tls-1",
          resourceVersion: "1",
        },
        spec: {
          parentRefs: [{ name: "tls-gateway" }],
          hostnames: ["secure.internal.net"],
          rules: [
            {
              backendRefs: [{ name: "vault-service", port: 8200 }],
            },
          ],
        },
      });

      expect(route.getName()).toBe("passthrough-tls");
      expect(route.getParentGateways()).toEqual(["tls-gateway"]);
      expect(route.getHostnames()).toEqual(["secure.internal.net"]);
      expect(route.getBackendServices()).toEqual(["vault-service:8200"]);
    });
  });

  describe("ReferenceGrant Model & API", () => {
    it("parses cross-namespace from and to rules", () => {
      const grant = new ReferenceGrant({
        apiVersion: "gateway.networking.k8s.io/v1beta1",
        kind: "ReferenceGrant",
        metadata: {
          name: "allow-cert-access",
          namespace: "pki-certs",
          selfLink: "/apis/gateway.networking.k8s.io/v1beta1/namespaces/pki-certs/referencegrants/allow-cert-access",
          uid: "grant-1",
          resourceVersion: "1",
        },
        spec: {
          from: [
            { group: "gateway.networking.k8s.io", kind: "Gateway", namespace: "gateway-infra" },
          ],
          to: [
            { group: "", kind: "Secret", name: "wildcard-tls-secret" },
          ],
        },
      });

      expect(grant.getName()).toBe("allow-cert-access");
      expect(grant.getNs()).toBe("pki-certs");
      expect(grant.getFromSummary()).toBe("Gateway (gateway-infra)");
      expect(grant.getToSummary()).toBe("Secret (wildcard-tls-secret)");
    });

    it("handles multiple from and to targets with summaries", () => {
      const grant = new ReferenceGrant({
        apiVersion: "gateway.networking.k8s.io/v1beta1",
        kind: "ReferenceGrant",
        metadata: {
          name: "multi-grant",
          namespace: "backend",
          selfLink: "/apis/gateway.networking.k8s.io/v1beta1/namespaces/backend/referencegrants/multi-grant",
          uid: "grant-2",
          resourceVersion: "1",
        },
        spec: {
          from: [
            { group: "gateway.networking.k8s.io", kind: "HTTPRoute", namespace: "frontend" },
            { group: "gateway.networking.k8s.io", kind: "GRPCRoute", namespace: "mobile-api" },
          ],
          to: [
            { group: "", kind: "Service", name: "auth-svc" },
            { group: "", kind: "Service" },
          ],
        },
      });

      expect(grant.getFromSummary()).toBe("HTTPRoute (frontend), GRPCRoute (mobile-api)");
      expect(grant.getToSummary()).toBe("Service (auth-svc), Service");
    });

    it("ReferenceGrantApi supports v1beta1 negotiation", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation((url: string) => {
          if (url === "/apis/gateway.networking.k8s.io") {
            return Promise.resolve({
              name: "gateway.networking.k8s.io",
              versions: [
                { groupVersion: "gateway.networking.k8s.io/v1beta1", version: "v1beta1" },
              ],
              preferredVersion: { groupVersion: "gateway.networking.k8s.io/v1beta1", version: "v1beta1" },
            });
          }

          if (url === "/apis/gateway.networking.k8s.io/v1beta1") {
            return Promise.resolve({
              resources: [{ name: "referencegrants", kind: "ReferenceGrant", namespaced: true }],
            });
          }

          return Promise.reject(new Error(`Not found: ${url}`));
        }),
      } as unknown as KubeJsonApi;

      const api = new ReferenceGrantApi(dummyDeps, { request: mockRequest });

      await (api as any).checkPreferredVersion();
      expect(api.apiVersionWithGroup).toBe("gateway.networking.k8s.io/v1beta1");
    });
  });
});
