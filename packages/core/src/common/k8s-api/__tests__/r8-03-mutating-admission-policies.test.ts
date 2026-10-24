/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  MutatingAdmissionPolicy,
  MutatingAdmissionPolicyApi,
  MutatingAdmissionPolicyBinding,
} from "../endpoints/validating-admission-policy.api";
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

describe("R8-03 Mutating Admission Policies (CEL)", () => {
  describe("MutatingAdmissionPolicy Model & API", () => {
    it("parses mutations, failure policy, match constraints, and param kind", () => {
      const policy = new MutatingAdmissionPolicy({
        apiVersion: "admissionregistration.k8s.io/v1alpha1",
        kind: "MutatingAdmissionPolicy",
        metadata: {
          name: "inject-sidecar-policy",
          selfLink: "/apis/admissionregistration.k8s.io/v1alpha1/mutatingadmissionpolicies/inject-sidecar-policy",
          uid: "map-1",
          resourceVersion: "1",
        },
        spec: {
          failurePolicy: "Fail",
          matchConstraints: {
            resourceRules: [
              {
                apiGroups: [""],
                apiVersions: ["v1"],
                resources: ["pods"],
                operations: ["CREATE"],
              },
            ],
          },
          mutations: [
            {
              patchType: "JSONPatch",
              jsonPatch: {
                expression: "[JSONPatch{op: 'add', path: '/metadata/labels/mutated', value: 'true'}]",
              },
            },
          ],
          paramKind: {
            apiVersion: "v1",
            kind: "ConfigMap",
          },
        },
      });

      expect(policy.getName()).toBe("inject-sidecar-policy");
      expect(policy.getFailurePolicy()).toBe("Fail");
      expect(policy.getMutationsCount()).toBe(1);
      expect(policy.getMatchResourcesSummary()).toBe("pods");
      expect(policy.getParamKind()).toBe("ConfigMap (v1)");
    });

    it("MutatingAdmissionPolicyApi negotiates v1alpha1 apiBase", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation((url: string) => {
          if (url === "/apis/admissionregistration.k8s.io") {
            return Promise.resolve({
              name: "admissionregistration.k8s.io",
              versions: [
                { groupVersion: "admissionregistration.k8s.io/v1alpha1", version: "v1alpha1" },
              ],
              preferredVersion: { groupVersion: "admissionregistration.k8s.io/v1alpha1", version: "v1alpha1" },
            });
          }

          if (url === "/apis/admissionregistration.k8s.io/v1alpha1") {
            return Promise.resolve({
              resources: [{ name: "mutatingadmissionpolicies", kind: "MutatingAdmissionPolicy", namespaced: false }],
            });
          }

          return Promise.reject(new Error(`Not found: ${url}`));
        }),
      } as unknown as KubeJsonApi;

      const api = new MutatingAdmissionPolicyApi(dummyDeps, { request: mockRequest });

      await (api as any).checkPreferredVersion();
      expect(api.apiVersionWithGroup).toBe("admissionregistration.k8s.io/v1alpha1");
    });
  });

  describe("MutatingAdmissionPolicyBinding Model", () => {
    it("parses policyName and paramRef", () => {
      const binding = new MutatingAdmissionPolicyBinding({
        apiVersion: "admissionregistration.k8s.io/v1alpha1",
        kind: "MutatingAdmissionPolicyBinding",
        metadata: {
          name: "inject-sidecar-binding",
          selfLink: "/apis/admissionregistration.k8s.io/v1alpha1/mutatingadmissionpolicybindings/inject-sidecar-binding",
          uid: "mapb-1",
          resourceVersion: "1",
        },
        spec: {
          policyName: "inject-sidecar-policy",
          paramRef: {
            name: "sidecar-params",
            namespace: "kube-system",
          },
        },
      });

      expect(binding.getName()).toBe("inject-sidecar-binding");
      expect(binding.getPolicyName()).toBe("inject-sidecar-policy");
      expect(binding.getParamRefSummary()).toBe("kube-system/sidecar-params");
    });
  });
});
