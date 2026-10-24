/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  ResourceClaimTemplate,
  ResourceClaimTemplateApi,
  ResourceSlice,
  ResourceSliceApi,
} from "../endpoints/resource-dra.api";
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

describe("R8-04 Dynamic Resource Allocation (DRA) Extensions", () => {
  describe("ResourceClaimTemplate Model & API", () => {
    it("parses requested device classes from devices requests", () => {
      const template = new ResourceClaimTemplate({
        apiVersion: "resource.k8s.io/v1beta1",
        kind: "ResourceClaimTemplate",
        metadata: {
          name: "gpu-claim-template",
          namespace: "ml-training",
          selfLink: "/apis/resource.k8s.io/v1beta1/namespaces/ml-training/resourceclaimtemplates/gpu-claim-template",
          uid: "rct-1",
          resourceVersion: "1",
        },
        spec: {
          spec: {
            devices: {
              requests: [
                {
                  name: "h100-gpu",
                  deviceClassName: "nvidia-h100-gpu",
                },
              ],
            },
          },
        },
      });

      expect(template.getName()).toBe("gpu-claim-template");
      expect(template.getNs()).toBe("ml-training");
      expect(template.getRequestedDeviceClasses()).toEqual(["nvidia-h100-gpu"]);
    });

    it("ResourceClaimTemplateApi supports v1beta1 negotiation", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation((url: string) => {
          if (url === "/apis/resource.k8s.io") {
            return Promise.resolve({
              name: "resource.k8s.io",
              versions: [
                { groupVersion: "resource.k8s.io/v1beta1", version: "v1beta1" },
              ],
              preferredVersion: { groupVersion: "resource.k8s.io/v1beta1", version: "v1beta1" },
            });
          }

          if (url === "/apis/resource.k8s.io/v1beta1") {
            return Promise.resolve({
              resources: [{ name: "resourceclaimtemplates", kind: "ResourceClaimTemplate", namespaced: true }],
            });
          }

          return Promise.reject(new Error(`Not found: ${url}`));
        }),
      } as unknown as KubeJsonApi;

      const api = new ResourceClaimTemplateApi(dummyDeps, { request: mockRequest });

      await (api as any).checkPreferredVersion();
      expect(api.apiVersionWithGroup).toBe("resource.k8s.io/v1beta1");
    });
  });

  describe("ResourceSlice Model & API", () => {
    it("parses nodeName, driver, pool, and devices list", () => {
      const slice = new ResourceSlice({
        apiVersion: "resource.k8s.io/v1beta1",
        kind: "ResourceSlice",
        metadata: {
          name: "worker-gpu-node-slice",
          selfLink: "/apis/resource.k8s.io/v1beta1/resourceslices/worker-gpu-node-slice",
          uid: "slice-1",
          resourceVersion: "1",
        },
        spec: {
          nodeName: "gpu-node-01",
          driver: "gpu.nvidia.com",
          pool: {
            name: "gpu-pool-a",
            generation: 1,
            resourceSliceCount: 2,
          },
          devices: [
            { name: "gpu-0" },
            { name: "gpu-1" },
            { name: "gpu-2" },
            { name: "gpu-3" },
          ],
        },
      });

      expect(slice.getName()).toBe("worker-gpu-node-slice");
      expect(slice.getNodeName()).toBe("gpu-node-01");
      expect(slice.getDriverName()).toBe("gpu.nvidia.com");
      expect(slice.getPoolName()).toBe("gpu-pool-a");
      expect(slice.getDevicesCount()).toBe(4);
    });

    it("ResourceSliceApi supports v1beta1 negotiation", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation((url: string) => {
          if (url === "/apis/resource.k8s.io") {
            return Promise.resolve({
              name: "resource.k8s.io",
              versions: [
                { groupVersion: "resource.k8s.io/v1beta1", version: "v1beta1" },
              ],
              preferredVersion: { groupVersion: "resource.k8s.io/v1beta1", version: "v1beta1" },
            });
          }

          if (url === "/apis/resource.k8s.io/v1beta1") {
            return Promise.resolve({
              resources: [{ name: "resourceslices", kind: "ResourceSlice", namespaced: false }],
            });
          }

          return Promise.reject(new Error(`Not found: ${url}`));
        }),
      } as unknown as KubeJsonApi;

      const api = new ResourceSliceApi(dummyDeps, { request: mockRequest });

      await (api as any).checkPreferredVersion();
      expect(api.apiVersionWithGroup).toBe("resource.k8s.io/v1beta1");
    });
  });
});
