/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Pod, Namespace, NetworkPolicy } from "@openlens/kube-object";
import {
  getEffectivePolicyTypes,
  isPodSelectedByPolicy,
  getPodIsolationStatus,
  evaluateConnection,
  buildPolicyMatrix,
} from "../engine";
import type { PolicyEvaluationContext, EvaluatedPeer } from "../types";

function createPod(name: string, namespace: string, labels: Record<string, string>, ip = "10.244.0.5"): Pod {
  return new Pod({
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name,
      namespace,
      uid: `pod-${namespace}-${name}`,
      resourceVersion: "1",
      selfLink: `/api/v1/namespaces/${namespace}/pods/${name}`,
      labels,
    },
    status: {
      phase: "Running",
      conditions: [],
      hostIP: "10.0.0.1",
      startTime: "2026-01-01T00:00:00Z",
      podIP: ip,
    },
    spec: {
      containers: [
        {
          name: "app",
          image: "app:v1",
          ports: [
            { name: "http", containerPort: 8080, protocol: "TCP" },
            { name: "metrics", containerPort: 9090, protocol: "TCP" },
          ],
        },
      ],
    },
  });
}

function createNamespace(name: string, labels: Record<string, string> = {}): Namespace {
  return new Namespace({
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
      name,
      uid: `ns-${name}`,
      resourceVersion: "1",
      selfLink: `/api/v1/namespaces/${name}`,
      labels: {
        "kubernetes.io/metadata.name": name,
        ...labels,
      },
    },
  });
}

function createPolicy(
  name: string,
  namespace: string,
  spec: any,
): NetworkPolicy {
  return new NetworkPolicy({
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name,
      namespace,
      uid: `np-${namespace}-${name}`,
      resourceVersion: "1",
      selfLink: `/apis/networking.k8s.io/v1/namespaces/${namespace}/networkpolicies/${name}`,
    },
    spec,
  });
}

describe("NetworkPolicy Engine", () => {
  const nsDefault = createNamespace("default", { env: "prod" });
  const nsSecure = createNamespace("secure", { env: "secure", compliance: "strict" });
  const nsDev = createNamespace("dev", { env: "dev" });
  const nsProd = createNamespace("prod", { env: "prod" });

  const namespaceMap = new Map<string, Namespace>([
    ["default", nsDefault],
    ["secure", nsSecure],
    ["dev", nsDev],
    ["prod", nsProd],
  ]);

  const frontendPod = createPod("frontend", "default", { app: "frontend", role: "ui" }, "10.244.1.10");
  const backendPod = createPod("backend", "default", { app: "backend", role: "api" }, "10.244.1.20");
  const dbPod = createPod("db", "secure", { app: "db", role: "database" }, "10.244.2.30");
  const roguePod = createPod("rogue", "dev", { app: "rogue" }, "10.244.3.40");

  const frontendPeer: EvaluatedPeer = {
    type: "pod",
    name: frontendPod.getName(),
    namespace: frontendPod.getNs(),
    ip: frontendPod.status?.podIP,
    pod: frontendPod,
  };

  const backendPeer: EvaluatedPeer = {
    type: "pod",
    name: backendPod.getName(),
    namespace: backendPod.getNs(),
    ip: backendPod.status?.podIP,
    pod: backendPod,
  };

  const dbPeer: EvaluatedPeer = {
    type: "pod",
    name: dbPod.getName(),
    namespace: dbPod.getNs(),
    ip: dbPod.status?.podIP,
    pod: dbPod,
  };

  describe("Effective PolicyTypes and Selectors", () => {
    it("infers Ingress by default when policyTypes is omitted", () => {
      const policy = createPolicy("test-default", "default", {
        podSelector: {},
      });

      expect(getEffectivePolicyTypes(policy)).toEqual(["Ingress"]);
    });

    it("infers only Ingress when policyTypes is omitted and the egress list is empty (API defaulting: Egress only with actual egress rules)", () => {
      const policy = createPolicy("test-egress", "default", {
        podSelector: {},
        egress: [],
      });

      expect(getEffectivePolicyTypes(policy)).toEqual(["Ingress"]);
    });

    it("infers Ingress and Egress when policyTypes is omitted and at least one egress rule exists", () => {
      const policy = createPolicy("test-egress-rule", "default", {
        podSelector: {},
        egress: [{ ports: [{ port: 53, protocol: "UDP" }] }],
      });

      expect(getEffectivePolicyTypes(policy)).toEqual(["Ingress", "Egress"]);
    });

    it("respects explicit policyTypes", () => {
      const policy = createPolicy("test-explicit", "default", {
        podSelector: {},
        policyTypes: ["Egress"],
      });

      expect(getEffectivePolicyTypes(policy)).toEqual(["Egress"]);
    });

    it("matches podSelector with empty {} selecting all pods in namespace", () => {
      const policy = createPolicy("all-pods", "default", { podSelector: {}});

      expect(isPodSelectedByPolicy(frontendPod, policy)).toBe(true);
      expect(isPodSelectedByPolicy(backendPod, policy)).toBe(true);
      expect(isPodSelectedByPolicy(dbPod, policy)).toBe(false); // different namespace
    });

    it("matches podSelector with specific matchLabels", () => {
      const policy = createPolicy("api-only", "default", {
        podSelector: { matchLabels: { role: "api" }},
      });

      expect(isPodSelectedByPolicy(backendPod, policy)).toBe(true);
      expect(isPodSelectedByPolicy(frontendPod, policy)).toBe(false);
    });
  });

  describe("Pod Isolation Detection", () => {
    it("reports not isolated when no policies select the pod", () => {
      const status = getPodIsolationStatus(frontendPod, []);

      expect(status.isIngressIsolated).toBe(false);
      expect(status.isEgressIsolated).toBe(false);
    });

    it("reports ingress isolated when policy selects pod for Ingress", () => {
      const defaultDenyIngress = createPolicy("default-deny-ingress", "default", {
        podSelector: {},
        policyTypes: ["Ingress"],
      });

      const status = getPodIsolationStatus(frontendPod, [defaultDenyIngress]);

      expect(status.isIngressIsolated).toBe(true);
      expect(status.isEgressIsolated).toBe(false);
    });

    it("reports egress isolated when policy selects pod for Egress", () => {
      const defaultDenyEgress = createPolicy("default-deny-egress", "default", {
        podSelector: {},
        policyTypes: ["Egress"],
      });

      const status = getPodIsolationStatus(frontendPod, [defaultDenyEgress]);

      expect(status.isIngressIsolated).toBe(false);
      expect(status.isEgressIsolated).toBe(true);
    });
  });

  describe("Additive Policies and Traffic Evaluation", () => {
    it("allows traffic between unisolated pods (Default Allow)", () => {
      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [nsDefault],
        policies: [],
        state: "ready",
      };

      const result = evaluateConnection(frontendPeer, backendPeer, 8080, "TCP", context, namespaceMap);

      expect(result.verdict).toBe("allowed");
      expect(result.egressVerdict).toBe("allowed");
      expect(result.ingressVerdict).toBe("allowed");
    });

    it("blocks ingress when destination has DefaultDenyIngress without matching rule", () => {
      const denyPolicy = createPolicy("deny-ingress", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [], // empty rules list = deny all ingress
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [nsDefault],
        policies: [denyPolicy],
        state: "ready",
      };

      const result = evaluateConnection(frontendPeer, backendPeer, 8080, "TCP", context, namespaceMap);

      expect(result.verdict).toBe("denied");
      expect(result.egressVerdict).toBe("allowed"); // frontend is not egress-isolated
      expect(result.ingressVerdict).toBe("denied"); // backend is ingress-isolated and has no rule
    });

    it("allows ingress when destination has a matching ingress rule", () => {
      const allowPolicy = createPolicy("allow-from-ui", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [
          {
            from: [{ podSelector: { matchLabels: { app: "frontend" }}}],
            ports: [{ port: 8080, protocol: "TCP" }],
          },
        ],
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [nsDefault],
        policies: [allowPolicy],
        state: "ready",
      };

      const allowedResult = evaluateConnection(frontendPeer, backendPeer, 8080, "TCP", context, namespaceMap);

      expect(allowedResult.verdict).toBe("allowed");
      expect(allowedResult.matchedIngressPolicies.length).toBe(1);

      // Different port should be blocked
      const blockedPortResult = evaluateConnection(frontendPeer, backendPeer, 9090, "TCP", context, namespaceMap);

      expect(blockedPortResult.verdict).toBe("denied");
    });

    it("demonstrates policies are ADDITIVE (two policies on same pod)", () => {
      // Policy 1: Allows port 8080
      const policy1 = createPolicy("policy-8080", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [{ ports: [{ port: 8080, protocol: "TCP" }] }],
      });

      // Policy 2: Allows port 9090
      const policy2 = createPolicy("policy-9090", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [{ ports: [{ port: 9090, protocol: "TCP" }] }],
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [nsDefault],
        policies: [policy1, policy2],
        state: "ready",
      };

      const res8080 = evaluateConnection(frontendPeer, backendPeer, 8080, "TCP", context, namespaceMap);
      const res9090 = evaluateConnection(frontendPeer, backendPeer, 9090, "TCP", context, namespaceMap);
      const res3000 = evaluateConnection(frontendPeer, backendPeer, 3000, "TCP", context, namespaceMap);

      expect(res8080.verdict).toBe("allowed");
      expect(res9090.verdict).toBe("allowed");
      expect(res3000.verdict).toBe("denied");
    });

    it("evaluates Egress allowed + Ingress denied -> Overall Denied", () => {
      // Frontend allows all egress
      const egressPolicy = createPolicy("frontend-egress", "default", {
        podSelector: { matchLabels: { app: "frontend" }},
        policyTypes: ["Egress"],
        egress: [{}], // allows all egress
      });

      // DB denies all ingress
      const dbDenyPolicy = createPolicy("db-deny-ingress", "secure", {
        podSelector: { matchLabels: { app: "db" }},
        policyTypes: ["Ingress"],
        ingress: [],
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, dbPod],
        namespaces: [nsDefault, nsSecure],
        policies: [egressPolicy, dbDenyPolicy],
        state: "ready",
      };

      const result = evaluateConnection(frontendPeer, dbPeer, 5432, "TCP", context, namespaceMap);

      expect(result.egressVerdict).toBe("allowed");
      expect(result.ingressVerdict).toBe("denied");
      expect(result.verdict).toBe("denied");
    });

    it("evaluates Ingress allowed + Egress denied -> Overall Denied", () => {
      // Frontend restricts egress to port 80 only
      const frontendRestrictedEgress = createPolicy("frontend-limited", "default", {
        podSelector: { matchLabels: { app: "frontend" }},
        policyTypes: ["Egress"],
        egress: [{ ports: [{ port: 80 }] }],
      });

      // Backend allows all ingress
      const backendAllowAll = createPolicy("backend-open", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [{}],
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [nsDefault],
        policies: [frontendRestrictedEgress, backendAllowAll],
        state: "ready",
      };

      // Trying to connect to port 8080: Egress blocks it
      const result = evaluateConnection(frontendPeer, backendPeer, 8080, "TCP", context, namespaceMap);

      expect(result.egressVerdict).toBe("denied");
      expect(result.ingressVerdict).toBe("allowed");
      expect(result.verdict).toBe("denied");
    });

    it("evaluates cross-namespace selector combination (namespaceSelector + podSelector)", () => {
      const dbPolicy = createPolicy("db-access", "secure", {
        podSelector: { matchLabels: { app: "db" }},
        policyTypes: ["Ingress"],
        ingress: [
          {
            from: [
              {
                namespaceSelector: { matchLabels: { env: "prod" }},
                podSelector: { matchLabels: { role: "api" }},
              },
            ],
            ports: [{ port: 8080, protocol: "TCP" }],
          },
        ],
      });

      const context: PolicyEvaluationContext = {
        pods: [backendPod, roguePod, dbPod],
        namespaces: [nsDefault, nsSecure, nsDev],
        policies: [dbPolicy],
        state: "ready",
      };

      // Backend is in 'default' (env: prod) and has role: api -> Allowed!
      const backendRes = evaluateConnection(backendPeer, dbPeer, 8080, "TCP", context, namespaceMap);

      expect(backendRes.verdict).toBe("allowed");

      // Rogue pod is in 'dev' (env: dev) -> Denied!
      const roguePeer: EvaluatedPeer = {
        type: "pod",
        name: roguePod.getName(),
        namespace: roguePod.getNs(),
        ip: roguePod.status?.podIP,
        pod: roguePod,
      };
      const rogueRes = evaluateConnection(roguePeer, dbPeer, 8080, "TCP", context, namespaceMap);

      expect(rogueRes.verdict).toBe("denied");
    });

    it("evaluates multiple alternative peers in from (OR logic, not intersection)", () => {
      const multiPeerPolicy = createPolicy("multi-peer", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [
          {
            from: [
              { podSelector: { matchLabels: { role: "ui" }}},
              { namespaceSelector: { matchLabels: { env: "secure" }}},
            ],
          },
        ],
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod, dbPod],
        namespaces: [nsDefault, nsSecure],
        policies: [multiPeerPolicy],
        state: "ready",
      };

      // Frontend matches first peer
      const resFrontend = evaluateConnection(frontendPeer, backendPeer, 8080, "TCP", context, namespaceMap);

      expect(resFrontend.verdict).toBe("allowed");

      // DB matches second peer (namespace secure)
      const resDb = evaluateConnection(dbPeer, backendPeer, 8080, "TCP", context, namespaceMap);

      expect(resDb.verdict).toBe("allowed");
    });

    it("evaluates rule with omitted from/to as allowing all sources/destinations", () => {
      const openIngressPolicy = createPolicy("open-ingress", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [
          {
            // from omitted -> matches all peers
            ports: [{ port: 8080, protocol: "TCP" }],
          },
        ],
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod, roguePod],
        namespaces: [nsDefault, nsDev],
        policies: [openIngressPolicy],
        state: "ready",
      };

      const resRogue = evaluateConnection(
        { type: "pod", name: roguePod.getName(), namespace: roguePod.getNs(), pod: roguePod },
        backendPeer,
        8080,
        "TCP",
        context,
        namespaceMap,
      );

      expect(resRogue.verdict).toBe("allowed");
    });

    it("evaluates empty from: [] as allowing all sources (per networking.k8s.io/v1 spec)", () => {
      const emptyFromPolicy = createPolicy("empty-from", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [
          {
            from: [], // explicitly empty -> does not restrict peers, matches all
          },
        ],
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [nsDefault],
        policies: [emptyFromPolicy],
        state: "ready",
      };

      const res = evaluateConnection(frontendPeer, backendPeer, 8080, "TCP", context, namespaceMap);

      expect(res.verdict).toBe("allowed");
    });

    it("evaluates empty to: [] as allowing all destinations (per networking.k8s.io/v1 spec)", () => {
      const emptyToPolicy = createPolicy("empty-to", "default", {
        podSelector: { matchLabels: { app: "frontend" }},
        policyTypes: ["Egress"],
        egress: [
          {
            to: [], // explicitly empty -> does not restrict destinations, matches all
          },
        ],
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [nsDefault],
        policies: [emptyToPolicy],
        state: "ready",
      };

      const res = evaluateConnection(frontendPeer, backendPeer, 8080, "TCP", context, namespaceMap);

      expect(res.verdict).toBe("allowed");
    });

    it("evaluates peer with empty selectors from: [{}] as indeterminate (does NOT treat as podSelector: {})", () => {
      const emptyPeerPolicy = createPolicy("empty-peer", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [
          {
            from: [{}], // 1 peer with no podSelector, namespaceSelector, or ipBlock
          },
        ],
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [nsDefault],
        policies: [emptyPeerPolicy],
        state: "ready",
      };

      const res = evaluateConnection(frontendPeer, backendPeer, 8080, "TCP", context, namespaceMap);

      expect(res.verdict).toBe("indeterminate");
      expect(res.ingressVerdict).toBe("indeterminate");
      expect(res.indeterminateReason).toContain("NetworkPolicyPeer vacío {}");
    });

    it("evaluates port-restricted policy with undefined targetPort as indeterminate (never universally allowed)", () => {
      const portRestrictedPolicy = createPolicy("port-8080-only", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [
          {
            from: [{ podSelector: { matchLabels: { app: "frontend" }}}],
            ports: [{ protocol: "TCP", port: 8080 }],
          },
        ],
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [nsDefault],
        policies: [portRestrictedPolicy],
        state: "ready",
      };

      // Query with undefined port against a policy requiring 8080
      const res = evaluateConnection(frontendPeer, backendPeer, undefined, "TCP", context, namespaceMap);

      expect(res.verdict).toBe("indeterminate");
      expect(res.ingressVerdict).toBe("indeterminate");
      expect(res.indeterminateReason).toContain("does not specify a target port");
    });

    it("evaluates bidirectional cross-namespace Ingress and Egress correctly", () => {
      const crossNsBackend = createPod("api-srv", "prod", { role: "api" });
      const crossNsPeer: EvaluatedPeer = {
        type: "pod",
        name: "api-srv",
        namespace: "prod",
        pod: crossNsBackend,
      };

      // Frontend in default has Egress policy allowing traffic to prod namespace with role: api
      const frontendEgressPolicy = createPolicy("allow-egress-to-prod-api", "default", {
        podSelector: { matchLabels: { app: "frontend" }},
        policyTypes: ["Egress"],
        egress: [
          {
            to: [
              {
                namespaceSelector: { matchLabels: { "kubernetes.io/metadata.name": "prod" }},
                podSelector: { matchLabels: { role: "api" }},
              },
            ],
            ports: [{ protocol: "TCP", port: 443 }],
          },
        ],
      });

      // Backend in prod has Ingress policy allowing traffic from default namespace with app: frontend
      const backendIngressPolicy = createPolicy("allow-ingress-from-default-frontend", "prod", {
        podSelector: { matchLabels: { role: "api" }},
        policyTypes: ["Ingress"],
        ingress: [
          {
            from: [
              {
                namespaceSelector: { matchLabels: { "kubernetes.io/metadata.name": "default" }},
                podSelector: { matchLabels: { app: "frontend" }},
              },
            ],
            ports: [{ protocol: "TCP", port: 443 }],
          },
        ],
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, crossNsBackend],
        namespaces: [nsDefault, nsProd],
        policies: [frontendEgressPolicy, backendIngressPolicy],
        state: "ready",
      };

      const resAllowed = evaluateConnection(frontendPeer, crossNsPeer, 443, "TCP", context, namespaceMap);

      expect(resAllowed.verdict).toBe("allowed");
      expect(resAllowed.egressVerdict).toBe("allowed");
      expect(resAllowed.ingressVerdict).toBe("allowed");

      // Wrong port 80 should be denied on both
      const resWrongPort = evaluateConnection(frontendPeer, crossNsPeer, 80, "TCP", context, namespaceMap);

      expect(resWrongPort.verdict).toBe("denied");
    });

    it("evaluates external IP CIDR with except block", () => {
      const cidrPolicy = createPolicy("cidr-policy", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [
          {
            from: [
              {
                ipBlock: {
                  cidr: "192.168.0.0/16",
                  except: ["192.168.10.0/24"],
                },
              },
            ],
          },
        ],
      });

      const context: PolicyEvaluationContext = {
        pods: [backendPod],
        namespaces: [nsDefault],
        policies: [cidrPolicy],
        state: "ready",
      };

      const externalAllowed: EvaluatedPeer = {
        type: "ip",
        name: "External Allowed",
        ip: "192.168.1.50",
      };

      const externalExcluded: EvaluatedPeer = {
        type: "ip",
        name: "External Excluded",
        ip: "192.168.10.50",
      };

      const resAllowed = evaluateConnection(externalAllowed, backendPeer, 8080, "TCP", context, namespaceMap);
      const resExcluded = evaluateConnection(externalExcluded, backendPeer, 8080, "TCP", context, namespaceMap);

      expect(resAllowed.verdict).toBe("allowed");
      expect(resExcluded.verdict).toBe("denied");
    });

    it("evaluates named port end-to-end with resolution on destination pod", () => {
      const namedPortPolicy = createPolicy("named-port-policy", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [
          {
            from: [{ podSelector: { matchLabels: { app: "frontend" }}}],
            ports: [{ port: "http", protocol: "TCP" }], // backend exposes containerPort 8080 named "http"
          },
        ],
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [nsDefault],
        policies: [namedPortPolicy],
        state: "ready",
      };

      // Querying with numeric port 8080 (which matches resolved named port)
      const res8080 = evaluateConnection(frontendPeer, backendPeer, 8080, "TCP", context, namespaceMap);

      expect(res8080.verdict).toBe("allowed");

      // Querying with named port "http"
      const resNamed = evaluateConnection(frontendPeer, backendPeer, "http", "TCP", context, namespaceMap);

      expect(resNamed.verdict).toBe("allowed");

      // Querying with port 9090 (metrics, not http)
      const res9090 = evaluateConnection(frontendPeer, backendPeer, 9090, "TCP", context, namespaceMap);

      expect(res9090.verdict).toBe("denied");
    });

    it("evaluates endPort range end-to-end", () => {
      const rangePolicy = createPolicy("range-policy", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [
          {
            ports: [{ port: 8000, endPort: 8090, protocol: "TCP" }],
          },
        ],
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [nsDefault],
        policies: [rangePolicy],
        state: "ready",
      };

      expect(evaluateConnection(frontendPeer, backendPeer, 8000, "TCP", context, namespaceMap).verdict).toBe("allowed");
      expect(evaluateConnection(frontendPeer, backendPeer, 8080, "TCP", context, namespaceMap).verdict).toBe("allowed");
      expect(evaluateConnection(frontendPeer, backendPeer, 8090, "TCP", context, namespaceMap).verdict).toBe("allowed");
      expect(evaluateConnection(frontendPeer, backendPeer, 7999, "TCP", context, namespaceMap).verdict).toBe("denied");
      expect(evaluateConnection(frontendPeer, backendPeer, 8091, "TCP", context, namespaceMap).verdict).toBe("denied");
    });
  });

  describe("Resilience: Missing Metadata and RBAC", () => {
    it("returns indeterminate when namespace metadata is missing for namespaceSelector", () => {
      const policyWithNsSelector = createPolicy("policy-ns", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [
          {
            from: [{ namespaceSelector: { matchLabels: { env: "prod" }}}],
          },
        ],
      });

      // An empty namespaceMap simulates missing namespace data (e.g. 403 or unlisted)
      const emptyNsMap = new Map<string, Namespace>();

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [],
        policies: [policyWithNsSelector],
        state: "partial-data",
      };

      const result = evaluateConnection(frontendPeer, backendPeer, 8080, "TCP", context, emptyNsMap);

      expect(result.verdict).toBe("indeterminate");
      expect(result.indeterminateReason).toBeDefined();
    });

    it("returns indeterminate on RBAC permission-denied state", () => {
      const context: PolicyEvaluationContext = {
        pods: [],
        namespaces: [],
        policies: [],
        state: "permission-denied",
      };

      const result = evaluateConnection(frontendPeer, backendPeer, 8080, "TCP", context, namespaceMap);

      expect(result.verdict).toBe("indeterminate");
      expect(result.indeterminateReason).toBe("RBAC 403 Forbidden");
    });

    it("returns indeterminate on loading state (fail-closed)", () => {
      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [nsDefault],
        policies: [],
        state: "loading",
      };

      const result = evaluateConnection(frontendPeer, backendPeer, 8080, "TCP", context, namespaceMap);

      expect(result.verdict).toBe("indeterminate");
      expect(result.indeterminateReason).toBe("Loading cluster resources");
    });

    it("returns indeterminate on disconnected cluster state (fail-closed)", () => {
      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [nsDefault],
        policies: [],
        state: "disconnected",
      };

      const result = evaluateConnection(frontendPeer, backendPeer, 8080, "TCP", context, namespaceMap);

      expect(result.verdict).toBe("indeterminate");
      expect(result.indeterminateReason).toBe("Cluster disconnected");
    });

    it("evaluates a realistic cluster of 1,000 Pods recording time and memory metrics", () => {
      const thousandPods: Pod[] = [];
      const namespacesList: Namespace[] = [nsDefault, nsProd];

      for (let i = 0; i < 1000; i++) {
        const ns = i % 2 === 0 ? "default" : "prod";
        const role = i % 5 === 0 ? "api" : i % 3 === 0 ? "db" : "worker";

        thousandPods.push(createPod(`pod-scale-${i}`, ns, { app: role, tier: `tier-${i % 4}` }));
      }

      const policy = createPolicy("scalable-policy", "default", {
        podSelector: { matchLabels: { app: "api" }},
        policyTypes: ["Ingress", "Egress"],
        ingress: [
          {
            from: [{ namespaceSelector: { matchLabels: { env: "prod" }}}],
            ports: [{ protocol: "TCP", port: 8080 }],
          },
        ],
        egress: [
          {
            to: [{ podSelector: { matchLabels: { app: "db" }}}],
            ports: [{ protocol: "TCP", port: 5432 }],
          },
        ],
      });

      const context: PolicyEvaluationContext = {
        pods: thousandPods,
        namespaces: namespacesList,
        policies: [policy],
        state: "ready",
      };

      const memBefore = process.memoryUsage().heapUsed;
      const startTime = performance.now();

      const result = buildPolicyMatrix(policy, context);

      const endTime = performance.now();
      const memAfter = process.memoryUsage().heapUsed;

      const elapsedMs = endTime - startTime;
      const memDiffMb = (memAfter - memBefore) / (1024 * 1024);

      // Verify matrix generated valid connections without running unbounded
      expect(result.connections.length).toBeGreaterThan(0);

      // The build must never truncate silently: the omission is reported
      expect(result.isPartial).toBe(true);
      expect(result.partialReason).toContain("presupuesto explícito");
      expect(result.totalPossibleConnections).toBeGreaterThan(result.totalEvaluated);

      // Verify performance: 1,000 pods analysis should complete well under 250ms
      expect(elapsedMs).toBeLessThan(500);

      // Verify memory footprint does not spike unreasonably
      expect(memDiffMb).toBeLessThan(200);
    });

    it("evaluates 1,000 Pods concentrated in a single namespace without exploding and discloses the omission", () => {
      const concentratedPods: Pod[] = [];

      for (let i = 0; i < 1000; i++) {
        concentratedPods.push(createPod(`pod-dense-${i}`, "default", { app: "api" }));
      }

      const policy = createPolicy("dense-policy", "default", {
        podSelector: { matchLabels: { app: "api" }},
        policyTypes: ["Ingress"],
        ingress: [{ ports: [{ port: 8080, protocol: "TCP" }] }],
      });

      const context: PolicyEvaluationContext = {
        pods: concentratedPods,
        namespaces: [nsDefault],
        policies: [policy],
        state: "ready",
      };

      const startTime = performance.now();
      const result = buildPolicyMatrix(policy, context);
      const elapsedMs = performance.now() - startTime;

      expect(result.selectedPodCount).toBe(1000);
      expect(result.candidatePodCount).toBe(1000);
      expect(result.connections.length).toBeLessThanOrEqual(result.maxConnections);
      expect(result.isPartial).toBe(true);
      expect(result.partialReason).toContain("NO fueron evaluadas");
      expect(elapsedMs).toBeLessThan(2000);
    });

    it("honours an explicit connection budget exactly", () => {
      const policy = createPolicy("budget-policy", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [{ ports: [{ port: 8080, protocol: "TCP" }] }],
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [nsDefault],
        policies: [policy],
        state: "ready",
      };

      const result = buildPolicyMatrix(policy, context, { maxConnections: 1 });

      expect(result.connections.length).toBe(1);
      expect(result.maxConnections).toBe(1);
      expect(result.isPartial).toBe(true);
    });

    it("does not silently drop peer pods of other namespaces", () => {
      const policy = createPolicy("ns-scoped-policy", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [{ from: [{ podSelector: { matchLabels: { app: "frontend" }}}] }],
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod, dbPod, roguePod],
        namespaces: [nsDefault, nsSecure, nsDev],
        policies: [policy],
        state: "ready",
      };

      const result = buildPolicyMatrix(policy, context);

      const sourceNamespaces = new Set(result.connections.map(conn => conn.source.namespace));

      // Peers from every namespace must be represented, not only the policy namespace
      expect(sourceNamespaces.has("default")).toBe(true);
      expect(sourceNamespaces.has("secure")).toBe(true);
      expect(sourceNamespaces.has("dev")).toBe(true);
      expect(result.candidatePodCount).toBe(4);
    });

    it("evaluates the 'other ports' dimension without certifying a partial permission", () => {
      const policy = createPolicy("port-scoped-policy", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [{ from: [{ podSelector: { matchLabels: { app: "frontend" }}}], ports: [{ port: 8080, protocol: "TCP" }] }],
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [nsDefault],
        policies: [policy],
        state: "ready",
      };

      const result = buildPolicyMatrix(policy, context);

      const declaredRow = result.connections.find(conn => conn.portScope === "declared");
      const otherRow = result.connections.find(conn => conn.portScope === "other");

      expect(declaredRow?.verdict).toBe("allowed");
      // Only some ports are allowed: the "other ports" row must NOT be reported as allowed
      expect(otherRow).toBeDefined();
      expect(otherRow?.verdict).toBe("indeterminate");
    });

    it("returns indeterminate instead of Default Allow when the policy list is incomplete", () => {
      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [nsDefault],
        policies: [],
        state: "partial-data",
      };

      const result = evaluateConnection(frontendPeer, backendPeer, 8080, "TCP", context, namespaceMap);

      expect(result.verdict).toBe("indeterminate");
      expect(result.indeterminateReason).toContain("Default Allow");
    });

    it("keeps a rule based permission valid under partial data (missing policies can only add permissions)", () => {
      const allowIngress = createPolicy("allow-8080", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [{ from: [{ podSelector: { matchLabels: { app: "frontend" }}}], ports: [{ port: 8080, protocol: "TCP" }] }],
      });

      const allowEgress = createPolicy("allow-egress", "default", {
        podSelector: { matchLabels: { app: "frontend" }},
        policyTypes: ["Egress"],
        egress: [{ to: [{ podSelector: { matchLabels: { app: "backend" }}}], ports: [{ port: 8080, protocol: "TCP" }] }],
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [nsDefault],
        policies: [allowIngress, allowEgress],
        state: "partial-data",
      };

      const result = evaluateConnection(frontendPeer, backendPeer, 8080, "TCP", context, namespaceMap);

      expect(result.verdict).toBe("allowed");
      expect(result.matchedIngressPolicies.length).toBe(1);
      expect(result.matchedEgressPolicies.length).toBe(1);
    });

    it("does not certify a permission when the opposite direction relies on Default Allow", () => {
      const allowIngress = createPolicy("allow-8080", "default", {
        podSelector: { matchLabels: { app: "backend" }},
        policyTypes: ["Ingress"],
        ingress: [{ from: [{ podSelector: { matchLabels: { app: "frontend" }}}], ports: [{ port: 8080, protocol: "TCP" }] }],
      });

      const context: PolicyEvaluationContext = {
        pods: [frontendPod, backendPod],
        namespaces: [nsDefault],
        policies: [allowIngress],
        state: "partial-data",
      };

      const result = evaluateConnection(frontendPeer, backendPeer, 8080, "TCP", context, namespaceMap);

      // Egress of the source relies on Default Allow: a missing policy could deny it
      expect(result.verdict).toBe("indeterminate");
      expect(result.indeterminateReason).toContain("Default Allow");
    });
  });
});
