/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  ArgoApplication,
  ArgoApplicationApi,
  ArgoAppProject,
} from "../endpoints/argocd.api";
import {
  FluxKustomization,
  FluxKustomizationApi,
  FluxHelmRelease,
} from "../endpoints/fluxcd.api";
import type { KubeJsonApi } from "../kube-json-api";

describe("R3-04 GitOps Integration (Argo CD & Flux CD)", () => {
  const dummyDeps = {
    logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() } as any,
    maybeKubeApi: undefined,
  };

  describe("Argo CD Models & Negotiation", () => {
    it("ArgoApplication parses project, health, sync status and destinations", () => {
      const app = new ArgoApplication({
        apiVersion: "argoproj.io/v1alpha1",
        kind: "Application",
        metadata: {
          name: "production-payment-api",
          namespace: "argocd",
          selfLink: "/apis/argoproj.io/v1alpha1/namespaces/argocd/applications/production-payment-api",
          uid: "argo-app-1",
          resourceVersion: "1001",
          creationTimestamp: "2026-10-20T10:00:00Z",
        },
        spec: {
          project: "banking-core",
          source: {
            repoURL: "https://github.com/company/banking-manifests.git",
            path: "envs/prod",
            targetRevision: "main",
          },
          destination: {
            name: "prod-cluster-us-east",
            namespace: "payments",
          },
        },
        status: {
          health: {
            status: "Healthy",
            message: "All 12 resources synced and operational",
          },
          sync: {
            status: "Synced",
            revision: "a1b2c3d4e5f678901234567890abcdef12345678",
          },
        },
      });

      expect(app.getName()).toBe("production-payment-api");
      expect(app.getProject()).toBe("banking-core");
      expect(app.getHealthStatus()).toBe("Healthy");
      expect(app.getSyncStatus()).toBe("Synced");
      expect(app.getRepoURL()).toBe("https://github.com/company/banking-manifests.git");
      expect(app.getPath()).toBe("envs/prod");
      expect(app.getTargetRevision()).toBe("main");
      expect(app.getDestinationSummary()).toBe("prod-cluster-us-east / payments");
      expect(app.getSyncRevision()).toBe("a1b2c3d");
    });

    it("ArgoAppProject parses sourceRepos and destinations count", () => {
      const project = new ArgoAppProject({
        apiVersion: "argoproj.io/v1alpha1",
        kind: "AppProject",
        metadata: {
          name: "banking-core",
          namespace: "argocd",
          selfLink: "/apis/argoproj.io/v1alpha1/namespaces/argocd/appprojects/banking-core",
          uid: "proj-1",
          resourceVersion: "1002",
          creationTimestamp: "2026-10-20T10:00:00Z",
        },
        spec: {
          description: "Core banking microservices",
          sourceRepos: ["https://github.com/company/*"],
          destinations: [
            { server: "https://kubernetes.default.svc", namespace: "payments" },
            { server: "https://kubernetes.default.svc", namespace: "ledger" },
          ],
        },
      });

      expect(project.getDescription()).toBe("Core banking microservices");
      expect(project.getSourceReposCount()).toBe(1);
      expect(project.getDestinationsCount()).toBe(2);
    });

    it("ArgoApplicationApi negotiates v1alpha1 and handles absence", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation((url: string) => {
          if (url === "/apis/argoproj.io") {
            return Promise.resolve({
              name: "argoproj.io",
              versions: [{ groupVersion: "argoproj.io/v1alpha1", version: "v1alpha1" }],
              preferredVersion: { groupVersion: "argoproj.io/v1alpha1", version: "v1alpha1" },
            });
          }

          if (url === "/apis/argoproj.io/v1alpha1") {
            return Promise.resolve({
              resources: [{ name: "applications", kind: "Application", namespaced: true }],
            });
          }

          return Promise.reject(new Error("404 Not Found"));
        }),
      } as unknown as KubeJsonApi;

      const api = new ArgoApplicationApi(dummyDeps, { request: mockRequest });

      await (api as any).checkPreferredVersion();
      expect(api.apiVersionWithGroup).toBe("argoproj.io/v1alpha1");
    });
  });

  describe("Flux CD Models & Negotiation", () => {
    it("FluxKustomization parses Ready condition, revision and sourceRef", () => {
      const k = new FluxKustomization({
        apiVersion: "kustomize.toolkit.fluxcd.io/v1",
        kind: "Kustomization",
        metadata: {
          name: "infra-networking",
          namespace: "flux-system",
          selfLink: "/apis/kustomize.toolkit.fluxcd.io/v1/namespaces/flux-system/kustomizations/infra-networking",
          uid: "flux-k-1",
          resourceVersion: "2001",
          creationTimestamp: "2026-10-20T10:00:00Z",
        },
        spec: {
          path: "./infrastructure/networking",
          sourceRef: {
            kind: "GitRepository",
            name: "fleet-infra",
          },
          interval: "5m",
        },
        status: {
          conditions: [
            {
              type: "Ready",
              status: "True",
              reason: "ReconciliationSucceeded",
              message: "Applied revision: main@sha1:9f8e7d6c5b4a3210",
            },
          ],
          lastAppliedRevision: "main@sha1:9f8e7d6c5b4a3210",
        },
      });

      expect(k.getName()).toBe("infra-networking");
      expect(k.isReady()).toBe(true);
      expect(k.isSuspended()).toBe(false);
      expect(k.getStatusSummary()).toBe("Ready");
      expect(k.getLastAppliedRevision()).toBe("main@9f8e7d6");
      expect(k.getSourceRefSummary()).toBe("GitRepository/fleet-infra");
      expect(k.getPath()).toBe("./infrastructure/networking");
    });

    it("FluxHelmRelease parses chart spec, Ready condition and lastRevision", () => {
      const hr = new FluxHelmRelease({
        apiVersion: "helm.toolkit.fluxcd.io/v2",
        kind: "HelmRelease",
        metadata: {
          name: "ingress-nginx",
          namespace: "ingress-nginx",
          selfLink: "/apis/helm.toolkit.fluxcd.io/v2/namespaces/ingress-nginx/helmreleases/ingress-nginx",
          uid: "hr-1",
          resourceVersion: "3001",
          creationTimestamp: "2026-10-20T10:00:00Z",
        },
        spec: {
          chart: {
            spec: {
              chart: "ingress-nginx",
              version: "4.8.3",
              sourceRef: {
                kind: "HelmRepository",
                name: "ingress-nginx",
              },
            },
          },
        },
        status: {
          conditions: [
            {
              type: "Ready",
              status: "True",
              reason: "InstallSucceeded",
              message: "Release reconciliation succeeded",
            },
          ],
          lastAppliedRevision: "4.8.3",
        },
      });

      expect(hr.getName()).toBe("ingress-nginx");
      expect(hr.isReady()).toBe(true);
      expect(hr.getChartSummary()).toBe("ingress-nginx (4.8.3)");
      expect(hr.getLastRevision()).toBe("4.8.3");
    });

    it("FluxKustomizationApi prioritizes v1 and falls back to v1beta2", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation((url: string) => {
          if (url === "/apis/kustomize.toolkit.fluxcd.io") {
            return Promise.resolve({
              name: "kustomize.toolkit.fluxcd.io",
              versions: [
                { groupVersion: "kustomize.toolkit.fluxcd.io/v1", version: "v1" },
                { groupVersion: "kustomize.toolkit.fluxcd.io/v1beta2", version: "v1beta2" },
              ],
              preferredVersion: { groupVersion: "kustomize.toolkit.fluxcd.io/v1", version: "v1" },
            });
          }

          if (url === "/apis/kustomize.toolkit.fluxcd.io/v1") {
            return Promise.resolve({
              resources: [{ name: "kustomizations", kind: "Kustomization", namespaced: true }],
            });
          }

          return Promise.reject(new Error("404 Not Found"));
        }),
      } as unknown as KubeJsonApi;

      const api = new FluxKustomizationApi(dummyDeps, { request: mockRequest });

      await (api as any).checkPreferredVersion();
      expect(api.apiVersionWithGroup).toBe("kustomize.toolkit.fluxcd.io/v1");
    });
  });

  describe("Absence and Error Resilience", () => {
    it("handles cluster without Argo CD or Flux CD gracefully", async () => {
      const mockRequest = {
        get: jest.fn().mockImplementation(() => {
          return Promise.reject(new Error("404 Not Found"));
        }),
      } as unknown as KubeJsonApi;

      const argoApi = new ArgoApplicationApi(dummyDeps, { request: mockRequest });

      await expect((argoApi as any).checkPreferredVersion()).rejects.toThrow("Can't find working API for the Kubernetes resource applications");

      const fluxApi = new FluxKustomizationApi(dummyDeps, { request: mockRequest });

      await expect((fluxApi as any).checkPreferredVersion()).rejects.toThrow("Can't find working API for the Kubernetes resource kustomizations");
    });
  });
});
