/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { EndpointSlice, EndpointSliceApi } from "../endpoints/endpoint-slice.api";
import { Gateway, GatewayApi, GatewayClass, HTTPRoute } from "../endpoints/gateway.api";
import { EndpointSliceStore } from "../../../renderer/components/network-endpoint-slices/store";
import type { KubeJsonApi } from "../kube-json-api";

describe("R3-02 EndpointSlice & Optional Gateway API", () => {
  const dummyDeps = {
    logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() } as any,
    maybeKubeApi: undefined,
  };

  const dummyContext = {
    isLoadingAll: () => false,
    contextNamespaces: ["default"],
  } as any;

  describe("EndpointSlice Model & Store", () => {
    it("correctly parses addressType, endpoints, ports, and readiness", () => {
      const slice = new EndpointSlice({
        apiVersion: "discovery.k8s.io/v1",
        kind: "EndpointSlice",
        metadata: {
          name: "my-svc-abcde",
          namespace: "default",
          selfLink: "/apis/discovery.k8s.io/v1/namespaces/default/endpointslices/my-svc-abcde",
          uid: "slice-1",
          resourceVersion: "100",
          creationTimestamp: "2026-10-20T10:00:00Z",
          labels: {
            "kubernetes.io/service-name": "my-svc",
          },
        },
        addressType: "IPv4",
        endpoints: [
          {
            addresses: ["10.244.1.5"],
            conditions: { ready: true },
            nodeName: "node-1",
          },
          {
            addresses: ["10.244.2.8"],
            conditions: { ready: false },
            nodeName: "node-2",
          },
        ],
        ports: [
          { name: "http", port: 80, protocol: "TCP" },
          { name: "https", port: 443, protocol: "TCP" },
        ],
      });

      expect(slice.getServiceName()).toBe("my-svc");
      expect(slice.getAddressType()).toBe("IPv4");
      expect(slice.getEndpoints().length).toBe(2);
      expect(slice.getReadyEndpointsCount()).toBe(1);
      expect(slice.getEndpointsSummary()).toContain("1/2 ready");
      expect(slice.getPortsSummary()).toBe("80/TCP (http), 443/TCP (https)");
    });

    it("EndpointSliceApi prioritizes discovery.k8s.io/v1 over v1beta1", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation((url: string) => {
          if (url === "/apis/discovery.k8s.io") {
            return Promise.resolve({
              name: "discovery.k8s.io",
              versions: [
                { groupVersion: "discovery.k8s.io/v1", version: "v1" },
                { groupVersion: "discovery.k8s.io/v1beta1", version: "v1beta1" },
              ],
              preferredVersion: { groupVersion: "discovery.k8s.io/v1", version: "v1" },
            });
          }

          if (url === "/apis/discovery.k8s.io/v1") {
            return Promise.resolve({
              resources: [{ name: "endpointslices", kind: "EndpointSlice", namespaced: true }],
            });
          }

          return Promise.reject(new Error(`Endpoint not found: ${url}`));
        }),
      } as unknown as KubeJsonApi;

      const sliceApi = new EndpointSliceApi(dummyDeps, { request: mockRequest });

      await (sliceApi as any).checkPreferredVersion();
      expect(sliceApi.apiVersionWithGroup).toBe("discovery.k8s.io/v1");
    });

    it("EndpointSliceStore filters slices by service name and namespace", () => {
      const store = new EndpointSliceStore({
        context: dummyContext,
        logger: dummyDeps.logger,
      }, new EndpointSliceApi(dummyDeps, { request: {} as any }));

      const slice1 = new EndpointSlice({
        apiVersion: "discovery.k8s.io/v1",
        kind: "EndpointSlice",
        metadata: {
          name: "svc-a-1",
          namespace: "default",
          selfLink: "/apis/discovery.k8s.io/v1/namespaces/default/endpointslices/svc-a-1",
          uid: "s1",
          resourceVersion: "1",
          labels: { "kubernetes.io/service-name": "svc-a" },
        },
        addressType: "IPv4",
      });

      const slice2 = new EndpointSlice({
        apiVersion: "discovery.k8s.io/v1",
        kind: "EndpointSlice",
        metadata: {
          name: "svc-b-1",
          namespace: "default",
          selfLink: "/apis/discovery.k8s.io/v1/namespaces/default/endpointslices/svc-b-1",
          uid: "s2",
          resourceVersion: "1",
          labels: { "kubernetes.io/service-name": "svc-b" },
        },
        addressType: "IPv4",
      });

      store.items.push(slice1, slice2);

      const matching = store.getByService("svc-a", "default");

      expect(matching.length).toBe(1);
      expect(matching[0].getName()).toBe("svc-a-1");

      const empty = store.getByService("non-existent", "default");

      expect(empty.length).toBe(0);
    });
  });

  describe("Gateway API Models & Negotiation", () => {
    it("Gateway model parses listeners, addresses, and Programmed condition", () => {
      const gw = new Gateway({
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "Gateway",
        metadata: {
          name: "prod-gateway",
          namespace: "gateway-infra",
          selfLink: "/apis/gateway.networking.k8s.io/v1/namespaces/gateway-infra/gateways/prod-gateway",
          uid: "gw-1",
          resourceVersion: "1",
          creationTimestamp: "2026-10-20T10:00:00Z",
        },
        spec: {
          gatewayClassName: "envoy-gateway",
          listeners: [
            { name: "http", port: 80, protocol: "HTTP" },
            { name: "https", port: 443, protocol: "HTTPS" },
          ],
        },
        status: {
          addresses: [{ type: "IPAddress", value: "203.0.113.10" }],
          conditions: [
            { type: "Programmed", status: "True", reason: "Programmed" },
            { type: "Accepted", status: "True", reason: "Accepted" },
          ],
        },
      });

      expect(gw.getClassName()).toBe("envoy-gateway");
      expect(gw.getListenersSummary()).toBe("80/HTTP (http), 443/HTTPS (https)");
      expect(gw.getAddresses()).toEqual(["203.0.113.10"]);
      expect(gw.isProgrammed()).toBe(true);
      expect(gw.isAccepted()).toBe(true);
      expect(gw.getStatusSummary()).toBe("Programmed");
    });

    it("GatewayApi prioritizes v1 and supports fallback to v1beta1", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation((url: string) => {
          if (url === "/apis/gateway.networking.k8s.io") {
            return Promise.resolve({
              name: "gateway.networking.k8s.io",
              versions: [
                { groupVersion: "gateway.networking.k8s.io/v1", version: "v1" },
                { groupVersion: "gateway.networking.k8s.io/v1beta1", version: "v1beta1" },
              ],
              preferredVersion: { groupVersion: "gateway.networking.k8s.io/v1", version: "v1" },
            });
          }

          if (url === "/apis/gateway.networking.k8s.io/v1") {
            return Promise.resolve({
              resources: [{ name: "gateways", kind: "Gateway", namespaced: true }],
            });
          }

          return Promise.reject(new Error(`Endpoint not found: ${url}`));
        }),
      } as unknown as KubeJsonApi;

      const gwApi = new GatewayApi(dummyDeps, { request: mockRequest });

      await (gwApi as any).checkPreferredVersion();
      expect(gwApi.apiVersionWithGroup).toBe("gateway.networking.k8s.io/v1");
    });

    it("HTTPRoute model parses hostnames, parents, routes summary, and backend services", () => {
      const route = new HTTPRoute({
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "HTTPRoute",
        metadata: {
          name: "web-route",
          namespace: "default",
          selfLink: "/apis/gateway.networking.k8s.io/v1/namespaces/default/httproutes/web-route",
          uid: "route-1",
          resourceVersion: "1",
          creationTimestamp: "2026-10-20T10:00:00Z",
        },
        spec: {
          parentRefs: [
            { name: "prod-gateway", namespace: "gateway-infra" },
          ],
          hostnames: ["app.example.com", "api.example.com"],
          rules: [
            {
              matches: [
                { path: { type: "PathPrefix", value: "/api/v1" }},
                { path: { type: "Exact", value: "/healthz" }},
              ],
              backendRefs: [
                { name: "api-service", port: 8080 },
              ],
            },
          ],
        },
      });

      expect(route.getHostnames()).toEqual(["app.example.com", "api.example.com"]);
      expect(route.getParentGateways()).toEqual(["gateway-infra/prod-gateway"]);
      expect(route.getRoutesSummary()).toContain("/api/v1 (PathPrefix)");
      expect(route.getBackendServices()).toEqual(["api-service:8080"]);
    });

    it("GatewayClass model parses controllerName and Accepted condition", () => {
      const gc = new GatewayClass({
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "GatewayClass",
        metadata: {
          name: "cilium",
          selfLink: "/apis/gateway.networking.k8s.io/v1/gatewayclasses/cilium",
          uid: "gc-1",
          resourceVersion: "1",
          creationTimestamp: "2026-10-20T10:00:00Z",
        },
        spec: {
          controllerName: "io.cilium/gateway-controller",
          description: "Cilium Gateway Controller",
        },
        status: {
          conditions: [
            { type: "Accepted", status: "True", reason: "Accepted" },
          ],
        },
      });

      expect(gc.getControllerName()).toBe("io.cilium/gateway-controller");
      expect(gc.getDescription()).toBe("Cilium Gateway Controller");
      expect(gc.isAccepted()).toBe(true);
    });
  });

  describe("Absence and Safe Discovery", () => {
    it("GatewayApi throws gracefully when discovery fails and does not alter default apiBase", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation(() => {
          return Promise.reject(new Error("404 Not Found: group does not exist"));
        }),
      } as unknown as KubeJsonApi;

      const gwApi = new GatewayApi(dummyDeps, { request: mockRequest });

      await expect((gwApi as any).checkPreferredVersion()).rejects.toThrow("Can't find working API for the Kubernetes resource gateways");
      expect(gwApi.apiBase).toBe("/apis/gateway.networking.k8s.io/v1/gateways");
    });
  });
});
