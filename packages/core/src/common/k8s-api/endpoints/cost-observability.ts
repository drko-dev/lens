/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export interface CostRates {
  cpuCorePerHour: number;
  ramGbPerHour: number;
  storageGbPerHour: number;
  currency: string;
}

export const DEFAULT_COST_RATES: CostRates = {
  cpuCorePerHour: 0.031611, // ~$23/month for 1 vCPU
  ramGbPerHour: 0.004237,   // ~$3.10/month for 1 GB RAM
  storageGbPerHour: 0.000137, // ~$0.10/month for 1 GB persistent storage
  currency: "USD",
};

export const COST_ASSUMPTIONS_DECLARATION = [
  "Formulas: Hourly Cost = (cpuCores * cpuRate) + (ramGb * ramRate) + (storageGb * storageRate)",
  "Daily Cost = Hourly Cost * 24 hours",
  "Monthly Cost = Hourly Cost * 730 hours (standard cloud billing month)",
  "Default Rates: CPU = $0.031611/vCPU-h, RAM = $0.004237/GB-h, Storage = $0.000137/GB-h",
  "OpenCost Integration: Discovers in-cluster OpenCost service (port 9003) without external SaaS dependency",
  "Advisory Notice: Cost allocations are estimates based on resource requests and do not constitute legal invoice billing",
];

export interface RawWorkloadCostItem {
  kind: string;
  name: string;
  namespace: string;
  containers?: Array<{
    name?: string;
    resources?: {
      requests?: {
        cpu?: string;
        memory?: string;
      };
      limits?: {
        cpu?: string;
        memory?: string;
      };
    };
  }>;
}

export interface WorkloadCostAllocation {
  id: string;
  kind: string;
  name: string;
  namespace: string;
  cpuCoresRequested: number;
  ramGbRequested: number;
  hourlyCost: number;
  dailyCost: number;
  monthlyCost: number;
}

export interface NamespaceCostAllocation {
  id: string;
  namespace: string;
  workloadCount: number;
  cpuCoresRequested: number;
  ramGbRequested: number;
  dailyCost: number;
  monthlyCost: number;
  percentageOfCluster: number;
}

export interface ClusterCostSummary {
  totalHourlyCost: number;
  totalDailyCost: number;
  totalMonthlyCost: number;
  totalCpuCores: number;
  totalRamGb: number;
  currency: string;
  rates: CostRates;
  provider: "opencost" | "local-estimation-engine";
  assumptions: string[];
}

/**
 * Parses Kubernetes CPU quantity (e.g. "500m", "2", "0.25") into fractional CPU cores.
 */
export function parseCpuQuantity(cpu: string | undefined): number {
  if (!cpu) return 0;
  const str = String(cpu).trim();

  if (str.endsWith("m")) {
    const val = parseFloat(str.slice(0, -1));

    return isNaN(val) ? 0 : val / 1000;
  }
  const val = parseFloat(str);

  return isNaN(val) ? 0 : val;
}

/**
 * Parses Kubernetes Memory quantity (e.g. "512Mi", "2Gi", "1024M") into Gigabytes (GB).
 */
export function parseMemoryQuantity(mem: string | undefined): number {
  if (!mem) return 0;
  const str = String(mem).trim();

  if (str.endsWith("Gi")) {
    const val = parseFloat(str.slice(0, -2));

    return isNaN(val) ? 0 : val * 1.073741824; // 1 GiB = 1.074 GB
  }

  if (str.endsWith("G")) {
    const val = parseFloat(str.slice(0, -1));

    return isNaN(val) ? 0 : val;
  }

  if (str.endsWith("Mi")) {
    const val = parseFloat(str.slice(0, -2));

    return isNaN(val) ? 0 : (val * 1.048576) / 1000;
  }

  if (str.endsWith("M")) {
    const val = parseFloat(str.slice(0, -1));

    return isNaN(val) ? 0 : val / 1000;
  }

  if (str.endsWith("Ki")) {
    const val = parseFloat(str.slice(0, -2));

    return isNaN(val) ? 0 : val / (1024 * 1024);
  }
  const val = parseFloat(str);

  return isNaN(val) ? 0 : val / (1000 * 1000 * 1000);
}

/**
 * Computes cost for given CPU cores, RAM GB, and storage GB.
 */
export function computeResourceCost(
  cpuCores: number,
  ramGb: number,
  storageGb = 0,
  rates: CostRates = DEFAULT_COST_RATES,
): { hourly: number; daily: number; monthly: number } {
  const hourly = (cpuCores * rates.cpuCorePerHour) + (ramGb * rates.ramGbPerHour) + (storageGb * rates.storageGbPerHour);
  const daily = hourly * 24;
  const monthly = hourly * 730;

  return {
    hourly: Math.round(hourly * 10000) / 10000,
    daily: Math.round(daily * 100) / 100,
    monthly: Math.round(monthly * 100) / 100,
  };
}

/**
 * Computes cost breakdown for a collection of Kubernetes workloads.
 */
export function computeWorkloadCostAllocations(
  workloads: RawWorkloadCostItem[],
  rates: CostRates = DEFAULT_COST_RATES,
): {
  workloadAllocations: WorkloadCostAllocation[];
  namespaceAllocations: NamespaceCostAllocation[];
  clusterSummary: ClusterCostSummary;
} {
  const workloadAllocations: WorkloadCostAllocation[] = [];
  const nsMap = new Map<string, {
    workloadCount: number;
    cpuCores: number;
    ramGb: number;
  }>();

  let totalCores = 0;
  let totalRam = 0;

  for (const w of workloads) {
    let cores = 0;
    let ram = 0;

    for (const c of w.containers || []) {
      cores += parseCpuQuantity(c.resources?.requests?.cpu);
      ram += parseMemoryQuantity(c.resources?.requests?.memory);
    }

    const cost = computeResourceCost(cores, ram, 0, rates);
    const id = `${w.namespace}/${w.kind}/${w.name}`;

    workloadAllocations.push({
      id,
      kind: w.kind,
      name: w.name,
      namespace: w.namespace,
      cpuCoresRequested: Math.round(cores * 1000) / 1000,
      ramGbRequested: Math.round(ram * 100) / 100,
      hourlyCost: cost.hourly,
      dailyCost: cost.daily,
      monthlyCost: cost.monthly,
    });

    totalCores += cores;
    totalRam += ram;

    const ns = w.namespace || "default";

    let nsEntry = nsMap.get(ns);

    if (!nsEntry) {
      nsEntry = { workloadCount: 0, cpuCores: 0, ramGb: 0 };
      nsMap.set(ns, nsEntry);
    }

    nsEntry.workloadCount += 1;
    nsEntry.cpuCores += cores;
    nsEntry.ramGb += ram;
  }

  const clusterCost = computeResourceCost(totalCores, totalRam, 0, rates);
  const namespaceAllocations: NamespaceCostAllocation[] = [];

  for (const [ns, entry] of nsMap.entries()) {
    const cost = computeResourceCost(entry.cpuCores, entry.ramGb, 0, rates);
    const percentage = clusterCost.monthly > 0
      ? Math.round((cost.monthly / clusterCost.monthly) * 1000) / 10
      : 0;

    namespaceAllocations.push({
      id: ns,
      namespace: ns,
      workloadCount: entry.workloadCount,
      cpuCoresRequested: Math.round(entry.cpuCores * 1000) / 1000,
      ramGbRequested: Math.round(entry.ramGb * 100) / 100,
      dailyCost: cost.daily,
      monthlyCost: cost.monthly,
      percentageOfCluster: percentage,
    });
  }

  namespaceAllocations.sort((a, b) => b.monthlyCost - a.monthlyCost);
  workloadAllocations.sort((a, b) => b.monthlyCost - a.monthlyCost);

  return {
    workloadAllocations,
    namespaceAllocations,
    clusterSummary: {
      totalHourlyCost: clusterCost.hourly,
      totalDailyCost: clusterCost.daily,
      totalMonthlyCost: clusterCost.monthly,
      totalCpuCores: Math.round(totalCores * 1000) / 1000,
      totalRamGb: Math.round(totalRam * 100) / 100,
      currency: rates.currency,
      rates,
      provider: "local-estimation-engine",
      assumptions: COST_ASSUMPTIONS_DECLARATION,
    },
  };
}
