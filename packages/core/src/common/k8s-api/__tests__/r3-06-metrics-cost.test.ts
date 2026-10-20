/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  parseCpuQuantity,
  parseMemoryQuantity,
  computeResourceCost,
  computeWorkloadCostAllocations,
  DEFAULT_COST_RATES,
  COST_ASSUMPTIONS_DECLARATION,
} from "../endpoints/cost-observability";
import { getOperatorLikeQueryFor } from "../../../main/prometheus/operator-provider.injectable.ts";

describe("OpenLens DevOps R3-06: Observability, VictoriaMetrics & Cost Modeling", () => {
  describe("Resource Quantity Parsers", () => {
    it("parses millicores and whole cores correctly", () => {
      expect(parseCpuQuantity("500m")).toBe(0.5);
      expect(parseCpuQuantity("250m")).toBe(0.25);
      expect(parseCpuQuantity("2")).toBe(2.0);
      expect(parseCpuQuantity(undefined)).toBe(0);
      expect(parseCpuQuantity("invalid")).toBe(0);
    });

    it("parses memory quantities into gigabytes", () => {
      expect(parseMemoryQuantity("1G")).toBe(1.0);
      expect(parseMemoryQuantity("500M")).toBe(0.5);
      expect(parseMemoryQuantity("1024Mi")).toBeCloseTo(1.074, 2);
      expect(parseMemoryQuantity(undefined)).toBe(0);
    });
  });

  describe("Cost Computation Engine & Formulas", () => {
    it("computes hourly, daily and monthly cost adhering to declared formulas", () => {
      const cpu = 2.0; // 2 vCPU
      const ram = 4.0; // 4 GB

      const cost = computeResourceCost(cpu, ram, 0, DEFAULT_COST_RATES);

      // Hourly = (2 * 0.031611) + (4 * 0.004237) = 0.063222 + 0.016948 = 0.08017
      expect(cost.hourly).toBeCloseTo(0.0802, 3);
      expect(cost.daily).toBeCloseTo(cost.hourly * 24, 1);
      expect(cost.monthly).toBeCloseTo(cost.hourly * 730, 0);
    });

    it("aggregates workloads by namespace and calculates percentage share", () => {
      const workloads = [
        {
          kind: "Deployment",
          name: "web",
          namespace: "frontend",
          containers: [
            {
              resources: {
                requests: {
                  cpu: "500m",
                  memory: "1Gi",
                },
              },
            },
          ],
        },
        {
          kind: "Deployment",
          name: "database",
          namespace: "backend",
          containers: [
            {
              resources: {
                requests: {
                  cpu: "1500m",
                  memory: "3Gi",
                },
              },
            },
          ],
        },
      ];

      const { workloadAllocations, namespaceAllocations, clusterSummary } = computeWorkloadCostAllocations(workloads);

      expect(workloadAllocations.length).toBe(2);
      expect(namespaceAllocations.length).toBe(2);

      // Backend should have higher cost than frontend
      expect(namespaceAllocations[0].namespace).toBe("backend");
      expect(namespaceAllocations[1].namespace).toBe("frontend");

      expect(clusterSummary.totalCpuCores).toBeCloseTo(2.0, 1);
      expect(clusterSummary.assumptions).toEqual(COST_ASSUMPTIONS_DECLARATION);
      expect(clusterSummary.provider).toBe("local-estimation-engine");
    });
  });

  describe("VictoriaMetrics Provider Query Generation", () => {
    it("generates operator-like PromQL queries for VictoriaMetrics compatibility", () => {
      const getQuery = getOperatorLikeQueryFor({ rateAccuracy: "2m" });

      const memoryQuery = getQuery({ category: "cluster", nodes: "node-1|node-2" }, "memoryUsage");
      expect(memoryQuery).toContain("node_memory_MemTotal_bytes");
      expect(memoryQuery).toContain("node-1|node-2");

      const cpuQuery = getQuery({ category: "cluster", nodes: "node-1" }, "cpuUsage");
      expect(cpuQuery).toContain("rate(node_cpu_seconds_total");
      expect(cpuQuery).toContain("2m");
    });
  });
});
