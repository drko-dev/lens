/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  ValidatingAdmissionPolicy,
  ValidatingAdmissionPolicyApi,
  ValidatingAdmissionPolicyBinding,
} from "../endpoints/validating-admission-policy.api";
import {
  DeviceClass,
  DeviceClassApi,
  ResourceClaim,
} from "../endpoints/resource-dra.api";
import type { KubeJsonApi } from "../kube-json-api";

describe("R3-03 Validating Admission Policies (CEL) & Dynamic Resource Allocation (DRA)", () => {
  const dummyDeps = {
    logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() } as any,
    maybeKubeApi: undefined,
  };

  describe("ValidatingAdmissionPolicy & CEL Models", () => {
    it("parses CEL validation expressions, match constraints and failure policy", () => {
      const policy = new ValidatingAdmissionPolicy({
        apiVersion: "admissionregistration.k8s.io/v1",
        kind: "ValidatingAdmissionPolicy",
        metadata: {
          name: "check-deployment-replicas",
          selfLink: "/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicies/check-deployment-replicas",
          uid: "vap-1",
          resourceVersion: "100",
          creationTimestamp: "2026-10-20T10:00:00Z",
        },
        spec: {
          failurePolicy: "Fail",
          matchConstraints: {
            resourceRules: [
              {
                apiGroups: ["apps"],
                apiVersions: ["v1"],
                resources: ["deployments"],
                operations: ["CREATE", "UPDATE"],
              },
            ],
          },
          validations: [
            {
              expression: "object.spec.replicas <= 50",
              message: "Deployments cannot have more than 50 replicas in this cluster",
            },
            {
              expression: "object.spec.replicas >= 2",
              message: "Production workloads must have at least 2 replicas for high availability",
            },
          ],
          paramKind: {
            apiVersion: "rules.company.com/v1",
            kind: "ReplicaLimitConfig",
          },
        },
      });

      expect(policy.getName()).toBe("check-deployment-replicas");
      expect(policy.getFailurePolicy()).toBe("Fail");
      expect(policy.getExpressionsCount()).toBe(2);
      expect(policy.getValidations()[0].expression).toBe("object.spec.replicas <= 50");
      expect(policy.getMatchResourcesSummary()).toBe("deployments");
      expect(policy.getParamKind()).toBe("ReplicaLimitConfig (rules.company.com/v1)");
    });

    it("ValidatingAdmissionPolicyApi negotiates v1 and falls back to v1beta1", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation((url: string) => {
          if (url === "/apis/admissionregistration.k8s.io") {
            return Promise.resolve({
              name: "admissionregistration.k8s.io",
              versions: [
                { groupVersion: "admissionregistration.k8s.io/v1", version: "v1" },
                { groupVersion: "admissionregistration.k8s.io/v1beta1", version: "v1beta1" },
              ],
              preferredVersion: { groupVersion: "admissionregistration.k8s.io/v1", version: "v1" },
            });
          }
          if (url === "/apis/admissionregistration.k8s.io/v1") {
            return Promise.resolve({
              resources: [
                { name: "validatingadmissionpolicies", kind: "ValidatingAdmissionPolicy", namespaced: false },
              ],
            });
          }
          return Promise.reject(new Error(`Endpoint not found: ${url}`));
        }),
      } as unknown as KubeJsonApi;

      const api = new ValidatingAdmissionPolicyApi(dummyDeps, { request: mockRequest });
      await (api as any).checkPreferredVersion();
      expect(api.apiVersionWithGroup).toBe("admissionregistration.k8s.io/v1");
    });

    it("ValidatingAdmissionPolicyBinding parses policyName, validationActions, and paramRef", () => {
      const binding = new ValidatingAdmissionPolicyBinding({
        apiVersion: "admissionregistration.k8s.io/v1",
        kind: "ValidatingAdmissionPolicyBinding",
        metadata: {
          name: "check-deployment-replicas-binding",
          selfLink: "/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicybindings/check-deployment-replicas-binding",
          uid: "vapb-1",
          resourceVersion: "101",
          creationTimestamp: "2026-10-20T10:00:00Z",
        },
        spec: {
          policyName: "check-deployment-replicas",
          validationActions: ["Deny", "Warn"],
          paramRef: {
            name: "standard-limits",
            namespace: "kube-system",
          },
        },
      });

      expect(binding.getPolicyName()).toBe("check-deployment-replicas");
      expect(binding.getValidationActions()).toEqual(["Deny", "Warn"]);
      expect(binding.getParamRefSummary()).toBe("kube-system/standard-limits");
    });
  });

  describe("Dynamic Resource Allocation (DRA) Models", () => {
    it("DeviceClass parses CEL selectors", () => {
      const dc = new DeviceClass({
        apiVersion: "resource.k8s.io/v1beta1",
        kind: "DeviceClass",
        metadata: {
          name: "gpu.nvidia.com",
          selfLink: "/apis/resource.k8s.io/v1beta1/deviceclasses/gpu.nvidia.com",
          uid: "dc-1",
          resourceVersion: "200",
          creationTimestamp: "2026-10-20T10:00:00Z",
        },
        spec: {
          selectors: [
            {
              cel: {
                expression: 'device.driver == "gpu.nvidia.com" && device.attributes["model"].string == "H100"',
              },
            },
          ],
        },
      });

      expect(dc.getName()).toBe("gpu.nvidia.com");
      expect(dc.getSelectors().length).toBe(1);
      expect(dc.getSelectorsSummary()).toContain('device.driver == "gpu.nvidia.com"');
    });

    it("ResourceClaim parses allocation and reservedFor references", () => {
      const rc = new ResourceClaim({
        apiVersion: "resource.k8s.io/v1beta1",
        kind: "ResourceClaim",
        metadata: {
          name: "ai-inference-gpu-claim",
          namespace: "ml-workloads",
          selfLink: "/apis/resource.k8s.io/v1beta1/namespaces/ml-workloads/resourceclaims/ai-inference-gpu-claim",
          uid: "rc-1",
          resourceVersion: "201",
          creationTimestamp: "2026-10-20T10:00:00Z",
        },
        spec: {
          devices: {
            requests: [
              {
                name: "gpu",
                deviceClassName: "gpu.nvidia.com",
              },
            ],
          },
        },
        status: {
          allocation: {
            devices: {
              results: [
                {
                  request: "gpu",
                  driver: "gpu.nvidia.com",
                  pool: "node-gpu-pool-1",
                  device: "gpu-0",
                },
              ],
            },
          },
          reservedFor: [
            {
              resource: "pods",
              name: "llama3-worker-0",
              uid: "pod-uid-99",
            },
          ],
        },
      });

      expect(rc.isAllocated()).toBe(true);
      expect(rc.getAllocationSummary()).toContain("gpu.nvidia.com/gpu-0");
      expect(rc.getReservedForSummary()).toBe("pods/llama3-worker-0");
      expect(rc.getRequestedDeviceClasses()).toEqual(["gpu.nvidia.com"]);
    });

    it("DeviceClassApi prioritizes v1beta1 and falls back to v1alpha3", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation((url: string) => {
          if (url === "/apis/resource.k8s.io") {
            return Promise.resolve({
              name: "resource.k8s.io",
              versions: [
                { groupVersion: "resource.k8s.io/v1beta1", version: "v1beta1" },
                { groupVersion: "resource.k8s.io/v1alpha3", version: "v1alpha3" },
              ],
              preferredVersion: { groupVersion: "resource.k8s.io/v1beta1", version: "v1beta1" },
            });
          }
          if (url === "/apis/resource.k8s.io/v1beta1") {
            return Promise.resolve({
              resources: [
                { name: "deviceclasses", kind: "DeviceClass", namespaced: false },
              ],
            });
          }
          return Promise.reject(new Error(`Endpoint not found: ${url}`));
        }),
      } as unknown as KubeJsonApi;

      const api = new DeviceClassApi(dummyDeps, { request: mockRequest });
      await (api as any).checkPreferredVersion();
      expect(api.apiVersionWithGroup).toBe("resource.k8s.io/v1beta1");
    });
  });

  describe("Absence Resilience", () => {
    it("ValidatingAdmissionPolicyApi handles cluster without 1.26+ CEL admission gracefully", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation(() => {
          return Promise.reject(new Error("404 Not Found"));
        }),
      } as unknown as KubeJsonApi;

      const api = new ValidatingAdmissionPolicyApi(dummyDeps, { request: mockRequest });
      await expect((api as any).checkPreferredVersion()).rejects.toThrow("Can't find working API for the Kubernetes resource validatingadmissionpolicies");
      expect(api.apiBase).toBe("/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicies");
    });

    it("DeviceClassApi handles cluster without DRA feature gate gracefully", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation(() => {
          return Promise.reject(new Error("404 Not Found"));
        }),
      } as unknown as KubeJsonApi;

      const api = new DeviceClassApi(dummyDeps, { request: mockRequest });
      await expect((api as any).checkPreferredVersion()).rejects.toThrow("Can't find working API for the Kubernetes resource deviceclasses");
      expect(api.apiBase).toBe("/apis/resource.k8s.io/v1beta1/deviceclasses");
    });
  });
});
