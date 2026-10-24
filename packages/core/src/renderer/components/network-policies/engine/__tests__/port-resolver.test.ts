/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Pod } from "@openlens/kube-object";
import { matchesPolicyPort, matchesAnyPolicyPort, resolveNamedPortOnPod } from "../port-resolver";

describe("Port and Protocol Resolver", () => {
  const fakePod = new Pod({
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: "web-pod",
      namespace: "default",
      uid: "pod-1",
      resourceVersion: "1",
      selfLink: "/api/v1/namespaces/default/pods/web-pod",
    },
    spec: {
      containers: [
        {
          name: "nginx",
          image: "nginx:latest",
          ports: [
            { name: "http", containerPort: 80, protocol: "TCP" },
            { name: "https", containerPort: 443, protocol: "TCP" },
            { name: "dns", containerPort: 53, protocol: "UDP" },
          ],
        },
      ],
    },
  });

  describe("resolveNamedPortOnPod", () => {
    it("resolves named port correctly", () => {
      expect(resolveNamedPortOnPod(fakePod, "http", "TCP")).toBe(80);
      expect(resolveNamedPortOnPod(fakePod, "https", "TCP")).toBe(443);
      expect(resolveNamedPortOnPod(fakePod, "dns", "UDP")).toBe(53);
    });

    it("returns null for non-matching protocol or missing port name", () => {
      expect(resolveNamedPortOnPod(fakePod, "http", "UDP")).toBeNull();
      expect(resolveNamedPortOnPod(fakePod, "ssh", "TCP")).toBeNull();
      expect(resolveNamedPortOnPod(undefined, "http", "TCP")).toBeNull();
    });
  });

  describe("Numeric ports and endPort ranges", () => {
    it("matches exact numeric port", () => {
      const rule = { protocol: "TCP", port: 8080 };

      expect(matchesPolicyPort(rule, 8080, "TCP")).toEqual({ matched: true });
      expect(matchesPolicyPort(rule, 80, "TCP")).toEqual({ matched: false });
      expect(matchesPolicyPort(rule, 8080, "UDP")).toEqual({ matched: false });
    });

    it("returns indeterminate when targetPort is undefined on port-restricted rule (never assumes universal allow)", () => {
      const rule = { protocol: "TCP", port: 8080 };
      const res = matchesPolicyPort(rule, undefined, "TCP");

      expect(res.matched).toBe("indeterminate");

      if (res.matched === "indeterminate") {
        expect(res.reason).toContain("does not specify a target port");
      }
    });

    it("returns indeterminate for undefined targetPort against endPort range", () => {
      const rule = { protocol: "TCP", port: 8000, endPort: 8010 };
      const res = matchesPolicyPort(rule, undefined, "TCP");

      expect(res.matched).toBe("indeterminate");
    });

    it("supports endPort range", () => {
      const rule = { protocol: "TCP", port: 8000, endPort: 8010 };

      expect(matchesPolicyPort(rule, 8000, "TCP")).toEqual({ matched: true });
      expect(matchesPolicyPort(rule, 8005, "TCP")).toEqual({ matched: true });
      expect(matchesPolicyPort(rule, 8010, "TCP")).toEqual({ matched: true });
      expect(matchesPolicyPort(rule, 8011, "TCP")).toEqual({ matched: false });
      expect(matchesPolicyPort(rule, 7999, "TCP")).toEqual({ matched: false });
    });

    it("matches any port when port field is undefined", () => {
      const rule = { protocol: "UDP" };

      expect(matchesPolicyPort(rule, 53, "UDP")).toEqual({ matched: true });
      expect(matchesPolicyPort(rule, 1234, "UDP")).toEqual({ matched: true });
      expect(matchesPolicyPort(rule, 53, "TCP")).toEqual({ matched: false });
    });

    it("supports SCTP protocol", () => {
      const rule = { protocol: "SCTP", port: 38412 };

      expect(matchesPolicyPort(rule, 38412, "SCTP")).toEqual({ matched: true });
      expect(matchesPolicyPort(rule, 38412, "TCP")).toEqual({ matched: false });
    });
  });

  describe("Named ports in rules", () => {
    it("matches when named port resolves on destination pod", () => {
      const rule = { protocol: "TCP", port: "http" };

      expect(matchesPolicyPort(rule, 80, "TCP", fakePod)).toEqual({ matched: true });
      expect(matchesPolicyPort(rule, 443, "TCP", fakePod)).toEqual({ matched: false });
    });

    it("returns indeterminate when named port cannot be resolved", () => {
      const rule = { protocol: "TCP", port: "metrics" };
      const res = matchesPolicyPort(rule, 9090, "TCP", fakePod);

      expect(res.matched).toBe("indeterminate");
    });

    it("returns indeterminate when destination pod is not available for named port", () => {
      const rule = { protocol: "TCP", port: "http" };
      const res = matchesPolicyPort(rule, 80, "TCP", undefined);

      expect(res.matched).toBe("indeterminate");
    });
  });

  describe("matchesAnyPolicyPort", () => {
    it("returns true for empty ports list", () => {
      expect(matchesAnyPolicyPort([], 80, "TCP")).toEqual({ matched: true });
      expect(matchesAnyPolicyPort(undefined, 80, "TCP")).toEqual({ matched: true });
    });

    it("matches if any port in list matches", () => {
      const ports = [
        { protocol: "TCP", port: 80 },
        { protocol: "TCP", port: 443 },
      ];

      expect(matchesAnyPolicyPort(ports, 80, "TCP")).toEqual({ matched: true });
      expect(matchesAnyPolicyPort(ports, 443, "TCP")).toEqual({ matched: true });
      expect(matchesAnyPolicyPort(ports, 8080, "TCP")).toEqual({ matched: false });
    });
  });
});
