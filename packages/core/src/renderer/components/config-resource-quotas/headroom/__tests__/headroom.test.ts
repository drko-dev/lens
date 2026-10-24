/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  parseCpuQuantity,
  parseMemoryQuantity,
  parseCountQuantity,
  parseK8sQuantity,
  formatQuantity,
} from "../quantity-parser";
import {
  calculateMetricHeadroom,
  calculateQuotaHeadroom,
  getHighestStatus,
} from "../headroom-calculator";
import { ResourceQuota } from "@openlens/kube-object";

describe("ResourceQuota Headroom & Pure Quantity Parser (R7-08)", () => {
  describe("Pure Quantity Parser", () => {
    it("parses CPU quantities correctly into millicores", () => {
      expect(parseCpuQuantity("1")).toBe(1000);
      expect(parseCpuQuantity("2.5")).toBe(2500);
      expect(parseCpuQuantity("500m")).toBe(500);
      expect(parseCpuQuantity("1000000n")).toBe(1); // 1,000,000 nano = 1 milli
      expect(parseCpuQuantity("1000u")).toBe(1);    // 1,000 micro = 1 milli
      expect(parseCpuQuantity("0")).toBe(0);
      expect(parseCpuQuantity("")).toBeUndefined();
      expect(parseCpuQuantity("invalid")).toBeUndefined();
      expect(parseCpuQuantity(undefined)).toBeUndefined();
    });

    it("parses Memory quantities correctly into bytes", () => {
      // Binary SI
      expect(parseMemoryQuantity("1Ki")).toBe(1024);
      expect(parseMemoryQuantity("4KiB")).toBe(4096);
      expect(parseMemoryQuantity("100Mi")).toBe(100 * 1024 * 1024);
      expect(parseMemoryQuantity("2Gi")).toBe(2 * 1024 * 1024 * 1024);
      expect(parseMemoryQuantity("1Ti")).toBe(1024 * 1024 * 1024 * 1024);

      // Decimal SI
      expect(parseMemoryQuantity("1000k")).toBe(1000 * 1000);
      expect(parseMemoryQuantity("500M")).toBe(500 * 1000 * 1000);
      expect(parseMemoryQuantity("1G")).toBe(1000 * 1000 * 1000);

      // Plain bytes
      expect(parseMemoryQuantity("1048576")).toBe(1048576);
      expect(parseMemoryQuantity("0")).toBe(0);
      expect(parseMemoryQuantity("invalid")).toBeUndefined();
    });

    it("parses count quantities (pods, etc.)", () => {
      expect(parseCountQuantity("10")).toBe(10);
      expect(parseCountQuantity("0")).toBe(0);
      expect(parseCountQuantity(15)).toBe(15);
      expect(parseCountQuantity("abc")).toBeUndefined();
    });

    it("dispatches automatically based on resource name", () => {
      expect(parseK8sQuantity("requests.cpu", "500m")).toBe(500);
      expect(parseK8sQuantity("limits.cpu", "2")).toBe(2000);
      expect(parseK8sQuantity("requests.memory", "512Mi")).toBe(512 * 1024 * 1024);
      expect(parseK8sQuantity("limits.memory", "1Gi")).toBe(1024 * 1024 * 1024);
      expect(parseK8sQuantity("pods", "20")).toBe(20);
    });

    it("strictly rejects malformed numbers, multiple dots, and trailing garbage", () => {
      // Multiple decimal dots
      expect(parseCpuQuantity("1..2")).toBeUndefined();
      expect(parseCpuQuantity("2.3.4m")).toBeUndefined();
      expect(parseMemoryQuantity("1.2.3Gi")).toBeUndefined();
      expect(parseCountQuantity("1..2")).toBeUndefined();

      // Trailing non-numeric garbage or unrecognised suffixes
      expect(parseCountQuantity("12pods")).toBeUndefined();
      expect(parseCpuQuantity("100cpus")).toBeUndefined();
      expect(parseMemoryQuantity("500MBs")).toBeUndefined();

      // Fractional values for strict integer counters (Pods)
      expect(parseCountQuantity("1.5")).toBeUndefined();
      expect(parseCountQuantity(1.5)).toBeUndefined();
    });

    it("preserves precision without distorting fractional CPU millicores", () => {
      expect(parseCpuQuantity("1.5m")).toBe(1.5);
      expect(parseCpuQuantity("0.5m")).toBe(0.5);
      expect(parseCpuQuantity("250.25m")).toBe(250.25);
    });

    it("formats quantities back into human-readable strings", () => {
      expect(formatQuantity("cpu", 500)).toBe("500m");
      expect(formatQuantity("cpu", 2000)).toBe("2");
      expect(formatQuantity("memory", 1024 * 1024 * 512)).toBe("512.0 MiB");
      expect(formatQuantity("memory", 1024 * 1024 * 1024 * 2)).toBe("2.0 GiB");
      expect(formatQuantity("pods", 10)).toBe("10");
    });
  });

  describe("Headroom Calculation & Brackets", () => {
    it("classifies < 80% as normal (79%)", () => {
      // 790m / 1000m = 79%
      const result = calculateMetricHeadroom("requests.cpu", "790m", "1");

      expect(result.status).toBe("normal");
      expect(result.percentage).toBeCloseTo(79, 1);
    });

    it("classifies exactly 80% to < 90% as warning (80% and 89.9%)", () => {
      const at80 = calculateMetricHeadroom("requests.cpu", "800m", "1");

      expect(at80.status).toBe("warning");
      expect(at80.percentage).toBe(80);

      const at89 = calculateMetricHeadroom("requests.memory", "899Mi", "1000Mi");

      expect(at89.status).toBe("warning");
      expect(at89.percentage).toBeCloseTo(89.9, 1);
    });

    it("classifies >= 90% as critical (90% and 100%)", () => {
      const at90 = calculateMetricHeadroom("requests.cpu", "900m", "1");

      expect(at90.status).toBe("critical");
      expect(at90.percentage).toBe(90);

      const at100 = calculateMetricHeadroom("pods", "10", "10");

      expect(at100.status).toBe("critical");
      expect(at100.percentage).toBe(100);
    });

    it("does not clamp percentage to 100% when exceeded", () => {
      // 12 pods used out of 10 hard = 120%
      const exceeded = calculateMetricHeadroom("pods", "12", "10");

      expect(exceeded.status).toBe("critical");
      expect(exceeded.percentage).toBe(120);
    });

    it("returns N/A when hard limit is missing, zero, or unparsable", () => {
      const zeroHard = calculateMetricHeadroom("pods", "5", "0");

      expect(zeroHard.status).toBe("N/A");
      expect(zeroHard.percentage).toBeUndefined();

      const missingHard = calculateMetricHeadroom("cpu", "500m", undefined);

      expect(missingHard.status).toBe("N/A");

      const invalidHard = calculateMetricHeadroom("memory", "100Mi", "invalid");

      expect(invalidHard.status).toBe("N/A");

      // Verify that invalid/malformed inputs yield N/A, never a pseudo-valid percentage
      expect(calculateMetricHeadroom("requests.cpu", "2.3.4m", "1").status).toBe("N/A");
      expect(calculateMetricHeadroom("requests.cpu", "2.3.4m", "1").percentage).toBeUndefined();

      expect(calculateMetricHeadroom("pods", "1.5", "10").status).toBe("N/A");
      expect(calculateMetricHeadroom("pods", "1.5", "10").percentage).toBeUndefined();

      expect(calculateMetricHeadroom("requests.memory", "1.2.3Gi", "2Gi").status).toBe("N/A");
      expect(calculateMetricHeadroom("requests.memory", "1.2.3Gi", "2Gi").percentage).toBeUndefined();

      expect(calculateMetricHeadroom("pods", "12pods", "10").status).toBe("N/A");
    });

    it("strictly distinguishes between explicit zero usage and unknown / missing usage (Hallazgo B)", () => {
      // 1. Explicit zero usage with valid hard limit -> 0% consumption, status: normal
      const explicitZeroCpu = calculateMetricHeadroom("requests.cpu", "0", "4");

      expect(explicitZeroCpu.status).toBe("normal");
      expect(explicitZeroCpu.percentage).toBe(0);
      expect(explicitZeroCpu.usedFormatted).toBe("0m");
      expect(explicitZeroCpu.hardFormatted).toBe("4");

      const explicitZeroMillicores = calculateMetricHeadroom("requests.cpu", "0m", "4");

      expect(explicitZeroMillicores.status).toBe("normal");
      expect(explicitZeroMillicores.percentage).toBe(0);

      const explicitZeroMemory = calculateMetricHeadroom("requests.memory", "0Ki", "8Gi");

      expect(explicitZeroMemory.status).toBe("normal");
      expect(explicitZeroMemory.percentage).toBe(0);

      const explicitZeroPods = calculateMetricHeadroom("pods", "0", "20");

      expect(explicitZeroPods.status).toBe("normal");
      expect(explicitZeroPods.percentage).toBe(0);

      // 2. Missing or undefined usedRaw -> unknown utilization -> status: N/A, percentage: undefined
      const missingUsed = calculateMetricHeadroom("requests.cpu", undefined, "4");

      expect(missingUsed.status).toBe("N/A");
      expect(missingUsed.percentage).toBeUndefined();
      expect(missingUsed.usedFormatted).toBe("N/A");
      expect(missingUsed.hardFormatted).toBe("4");

      const emptyUsed = calculateMetricHeadroom("requests.memory", "", "8Gi");

      expect(emptyUsed.status).toBe("N/A");
      expect(emptyUsed.percentage).toBeUndefined();
      expect(emptyUsed.usedFormatted).toBe("N/A");

      const whitespaceUsed = calculateMetricHeadroom("pods", "   ", "10");

      expect(whitespaceUsed.status).toBe("N/A");
      expect(whitespaceUsed.percentage).toBeUndefined();
    });
  });

  describe("ResourceQuota Object Processing & Semantic Boundaries", () => {
    it("correctly evaluates a full ResourceQuota object without confusing requests and limits", () => {
      const quota = new ResourceQuota({
        apiVersion: "v1",
        kind: "ResourceQuota",
        metadata: {
          name: "compute-quota",
          namespace: "production",
          uid: "quota-123",
          resourceVersion: "1",
          selfLink: "/api/v1/namespaces/production/resourcequotas/compute-quota",
        },
        spec: {
          hard: {
            "requests.cpu": "4",
            "limits.cpu": "8",
            "requests.memory": "8Gi",
            "limits.memory": "16Gi",
            "pods": "10",
          },
          scopes: ["NotTerminating"],
        } as any,
        status: {
          hard: {
            "requests.cpu": "4",
            "limits.cpu": "8",
            "requests.memory": "8Gi",
            "limits.memory": "16Gi",
            "pods": "10",
          },
          used: {
            "requests.cpu": "3800m", // 95% -> critical
            "limits.cpu": "6400m",   // 80% -> warning
            "requests.memory": "4Gi", // 50% -> normal
            "limits.memory": "8Gi",  // 50% -> normal
            "pods": "7",             // 70% -> normal
          },
        },
      });

      const report = calculateQuotaHeadroom(quota);

      expect(report.quotaName).toBe("compute-quota");
      expect(report.namespace).toBe("production");
      expect(report.scopes).toEqual(["NotTerminating"]);
      expect(report.highestStatus).toBe("critical");

      const reqCpu = report.metrics.find(m => m.resourceName === "requests.cpu");

      expect(reqCpu?.status).toBe("critical");
      expect(reqCpu?.percentage).toBe(95);

      const limCpu = report.metrics.find(m => m.resourceName === "limits.cpu");

      expect(limCpu?.status).toBe("warning");
      expect(limCpu?.percentage).toBe(80);

      const reqMem = report.metrics.find(m => m.resourceName === "requests.memory");

      expect(reqMem?.status).toBe("normal");
      expect(reqMem?.percentage).toBe(50);
    });

    it("evaluates quotas when status or status.used is completely missing (Hallazgo B)", () => {
      // Quota with spec.hard defined, but status completely undefined
      const quotaNoStatus = new ResourceQuota({
        apiVersion: "v1",
        kind: "ResourceQuota",
        metadata: {
          name: "quota-no-status",
          namespace: "test-ns",
          selfLink: "/api/v1/namespaces/test-ns/resourcequotas/quota-no-status",
        },
        spec: {
          hard: {
            "requests.cpu": "4",
            "pods": "10",
          },
        } as any,
      });

      const report1 = calculateQuotaHeadroom(quotaNoStatus);

      expect(report1.highestStatus).toBe("N/A");
      expect(report1.metrics).toHaveLength(2);
      expect(report1.metrics.every(m => m.status === "N/A" && m.percentage === undefined)).toBe(true);

      // Quota with status.hard defined, but status.used missing
      const quotaNoUsed = new ResourceQuota({
        apiVersion: "v1",
        kind: "ResourceQuota",
        metadata: {
          name: "quota-no-used",
          namespace: "test-ns",
          selfLink: "/api/v1/namespaces/test-ns/resourcequotas/quota-no-used",
        },
        status: {
          hard: {
            "requests.cpu": "8",
          },
        } as any,
      });

      const report2 = calculateQuotaHeadroom(quotaNoUsed);

      expect(report2.highestStatus).toBe("N/A");
      expect(report2.metrics[0].status).toBe("N/A");
      expect(report2.metrics[0].percentage).toBeUndefined();
      expect(report2.metrics[0].usedFormatted).toBe("N/A");
    });

    it("evaluates quotas where specific keys are missing from status.used (Hallazgo B)", () => {
      const quotaPartialUsed = new ResourceQuota({
        apiVersion: "v1",
        kind: "ResourceQuota",
        metadata: {
          name: "quota-partial",
          namespace: "backend",
          selfLink: "/api/v1/namespaces/backend/resourcequotas/quota-partial",
        },
        status: {
          hard: {
            "requests.cpu": "4",
            "limits.cpu": "8",
            "pods": "10",
          },
          used: {
            // requests.cpu is missing!
            "limits.cpu": "0", // explicitly zero
            "pods": "9",       // 90% -> critical
          },
        } as any,
      });

      const report = calculateQuotaHeadroom(quotaPartialUsed);

      const reqCpu = report.metrics.find(m => m.resourceName === "requests.cpu");

      expect(reqCpu?.status).toBe("N/A");
      expect(reqCpu?.percentage).toBeUndefined();
      expect(reqCpu?.usedFormatted).toBe("N/A");

      const limCpu = report.metrics.find(m => m.resourceName === "limits.cpu");

      expect(limCpu?.status).toBe("normal");
      expect(limCpu?.percentage).toBe(0);
      expect(limCpu?.usedFormatted).toBe("0m");

      const pods = report.metrics.find(m => m.resourceName === "pods");

      expect(pods?.status).toBe("critical");
      expect(pods?.percentage).toBe(90);

      expect(report.highestStatus).toBe("critical");
    });

    it("handles multiple quotas in the same namespace independently without data pollution", () => {
      const quotaA = new ResourceQuota({
        apiVersion: "v1",
        kind: "ResourceQuota",
        metadata: {
          name: "quota-compute",
          namespace: "analytics",
          selfLink: "/api/v1/namespaces/analytics/resourcequotas/quota-compute",
        },
        status: {
          hard: { "requests.cpu": "10" },
          used: { "requests.cpu": "2" }, // 20%
        } as any,
      });

      const quotaB = new ResourceQuota({
        apiVersion: "v1",
        kind: "ResourceQuota",
        metadata: {
          name: "quota-memory",
          namespace: "analytics",
          selfLink: "/api/v1/namespaces/analytics/resourcequotas/quota-memory",
        },
        status: {
          hard: { "requests.memory": "10Gi" },
          used: { "requests.memory": "9Gi" }, // 90% -> critical
        } as any,
      });

      const reportA = calculateQuotaHeadroom(quotaA);
      const reportB = calculateQuotaHeadroom(quotaB);

      expect(reportA.quotaName).toBe("quota-compute");
      expect(reportA.namespace).toBe("analytics");
      expect(reportA.highestStatus).toBe("normal");
      expect(reportA.metrics[0].percentage).toBe(20);

      expect(reportB.quotaName).toBe("quota-memory");
      expect(reportB.namespace).toBe("analytics");
      expect(reportB.highestStatus).toBe("critical");
      expect(reportB.metrics[0].percentage).toBe(90);
    });

    it("evaluates highest status priority accurately", () => {
      expect(getHighestStatus(["normal", "normal"])).toBe("normal");
      expect(getHighestStatus(["normal", "warning"])).toBe("warning");
      expect(getHighestStatus(["normal", "warning", "critical"])).toBe("critical");
      expect(getHighestStatus(["N/A", "normal"])).toBe("normal");
      expect(getHighestStatus(["N/A", "N/A"])).toBe("N/A");
    });
  });
});
