/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export interface RawProcessMetric {
  type: string;
  pid: number;
  cpu?: {
    percentCPUUsage?: number;
  };
  memory?: {
    workingSetSize?: number;
    peakWorkingSetSize?: number;
  };
}

export interface RawMainMemory {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
}

export interface ValidatedProcessBreakdown {
  main: {
    pid: number;
    workingSetMb: number;
    peakWorkingSetMb: number;
    cpuPercent: number;
  };
  renderer: {
    count: number;
    pids: number[];
    workingSetMb: number;
    peakWorkingSetMb: number;
    cpuPercent: number;
  };
  gpu: {
    count: number;
    pids: number[];
    workingSetMb: number;
    peakWorkingSetMb: number;
    cpuPercent: number;
  };
  utility: {
    count: number;
    pids: number[];
    workingSetMb: number;
    peakWorkingSetMb: number;
    cpuPercent: number;
  };
  totalCombinedWorkingSetMb: number;
  activeProcessesCount: number;
}

export interface ValidatedScannerStatus {
  isEnabled: boolean;
  activeWatchersCount: number;
  scope?: {
    clusterId?: string;
    namespace?: string;
  };
}

/**
 * Validates raw memoryUsage object from Node.js process.memoryUsage().
 * Rejects non-objects, non-finite numbers, and negative values fail-closed.
 */
export function validateMainMemory(mem: unknown): RawMainMemory {
  if (!mem || typeof mem !== "object") {
    throw new Error("METRICS_VALIDATION_ERROR: mainMem must be a valid non-null object");
  }

  const record = mem as Record<string, unknown>;
  const requiredFields = ["rss", "heapUsed", "heapTotal", "external"] as const;

  for (const field of requiredFields) {
    const val = record[field];
    if (typeof val !== "number" || !Number.isFinite(val) || val < 0) {
      throw new Error(`METRICS_VALIDATION_ERROR: mainMem.${field} must be a non-negative finite number, got: ${String(val)}`);
    }
  }

  return {
    rss: record.rss as number,
    heapUsed: record.heapUsed as number,
    heapTotal: record.heapTotal as number,
    external: record.external as number,
  };
}

/**
 * Aggregates and strictly validates raw process metrics from electron.app.getAppMetrics().
 * Rejects missing Main/Browser or Renderer/Tab processes, negative values, and NaN/Infinity.
 * Correctly accounts for multiple renderers and auxiliary processes.
 */
export function aggregateAndValidateAppMetrics(
  rawMetrics: unknown,
  mainMem: unknown,
): ValidatedProcessBreakdown {
  validateMainMemory(mainMem);

  if (!Array.isArray(rawMetrics) || rawMetrics.length === 0) {
    throw new Error("METRICS_VALIDATION_ERROR: rawMetrics must be a non-empty array of ProcessMetric objects");
  }

  let mainProcess: { pid: number; workingSetMb: number; peakWorkingSetMb: number; cpuPercent: number } | null = null;
  const renderers: Array<{ pid: number; workingSetMb: number; peakWorkingSetMb: number; cpuPercent: number }> = [];
  const gpus: Array<{ pid: number; workingSetMb: number; peakWorkingSetMb: number; cpuPercent: number }> = [];
  const utilities: Array<{ pid: number; workingSetMb: number; peakWorkingSetMb: number; cpuPercent: number }> = [];
  let totalCombinedWsKb = 0;

  for (const m of rawMetrics as RawProcessMetric[]) {
    if (!m || typeof m !== "object") {
      throw new Error("METRICS_VALIDATION_ERROR: Process metric entry is invalid or not an object");
    }

    const pid = m.pid;
    if (!Number.isInteger(pid) || pid <= 0) {
      throw new Error(`METRICS_VALIDATION_ERROR: Process pid must be a positive integer, got: ${String(pid)}`);
    }

    const wsKb = m.memory?.workingSetSize;
    const peakKb = m.memory?.peakWorkingSetSize;
    const cpu = m.cpu?.percentCPUUsage;

    if (typeof wsKb !== "number" || !Number.isFinite(wsKb) || wsKb < 0) {
      throw new Error(`METRICS_VALIDATION_ERROR: Process ${pid} (${m.type}) has invalid workingSetSize: ${String(wsKb)}`);
    }
    if (typeof peakKb !== "number" || !Number.isFinite(peakKb) || peakKb < 0) {
      throw new Error(`METRICS_VALIDATION_ERROR: Process ${pid} (${m.type}) has invalid peakWorkingSetSize: ${String(peakKb)}`);
    }
    if (typeof cpu !== "number" || !Number.isFinite(cpu) || cpu < 0) {
      throw new Error(`METRICS_VALIDATION_ERROR: Process ${pid} (${m.type}) has invalid percentCPUUsage: ${String(cpu)}`);
    }

    totalCombinedWsKb += wsKb;

    const entry = {
      pid,
      workingSetMb: wsKb / 1024,
      peakWorkingSetMb: peakKb / 1024,
      cpuPercent: cpu,
    };

    if (m.type === "Browser") {
      if (mainProcess !== null) {
        throw new Error(`METRICS_VALIDATION_ERROR: Multiple Browser (Main) processes found (pid ${mainProcess.pid} and pid ${pid})`);
      }
      mainProcess = entry;
    } else if (m.type === "Tab") {
      renderers.push(entry);
    } else if (m.type === "GPU") {
      gpus.push(entry);
    } else if (m.type === "Utility") {
      utilities.push(entry);
    }
  }

  // Strict check: Main (Browser) MUST be present with positive working set
  if (!mainProcess || mainProcess.workingSetMb <= 0) {
    throw new Error(`METRICS_VALIDATION_ERROR: Missing or zero-consumption Main (Browser) process. Found: ${JSON.stringify(mainProcess)}`);
  }

  // Strict check: At least one Renderer (Tab) MUST be present with positive aggregate working set
  if (renderers.length === 0) {
    throw new Error("METRICS_VALIDATION_ERROR: No Renderer (Tab) process found in rawMetrics");
  }

  const totalRendererWsMb = renderers.reduce((sum, r) => sum + r.workingSetMb, 0);
  const totalRendererPeakMb = renderers.reduce((sum, r) => sum + r.peakWorkingSetMb, 0);
  const totalRendererCpu = renderers.reduce((sum, r) => sum + r.cpuPercent, 0);

  if (totalRendererWsMb <= 0) {
    throw new Error(`METRICS_VALIDATION_ERROR: Aggregate Renderer working set must be positive, got: ${totalRendererWsMb}`);
  }

  const totalGpuWsMb = gpus.reduce((sum, g) => sum + g.workingSetMb, 0);
  const totalGpuPeakMb = gpus.reduce((sum, g) => sum + g.peakWorkingSetMb, 0);
  const totalGpuCpu = gpus.reduce((sum, g) => sum + g.cpuPercent, 0);

  const totalUtilityWsMb = utilities.reduce((sum, u) => sum + u.workingSetMb, 0);
  const totalUtilityPeakMb = utilities.reduce((sum, u) => sum + u.peakWorkingSetMb, 0);
  const totalUtilityCpu = utilities.reduce((sum, u) => sum + u.cpuPercent, 0);

  return {
    main: {
      pid: mainProcess.pid,
      workingSetMb: Number(mainProcess.workingSetMb.toFixed(2)),
      peakWorkingSetMb: Number(mainProcess.peakWorkingSetMb.toFixed(2)),
      cpuPercent: Number(mainProcess.cpuPercent.toFixed(2)),
    },
    renderer: {
      count: renderers.length,
      pids: renderers.map(r => r.pid),
      workingSetMb: Number(totalRendererWsMb.toFixed(2)),
      peakWorkingSetMb: Number(totalRendererPeakMb.toFixed(2)),
      cpuPercent: Number(totalRendererCpu.toFixed(2)),
    },
    gpu: {
      count: gpus.length,
      pids: gpus.map(g => g.pid),
      workingSetMb: Number(totalGpuWsMb.toFixed(2)),
      peakWorkingSetMb: Number(totalGpuPeakMb.toFixed(2)),
      cpuPercent: Number(totalGpuCpu.toFixed(2)),
    },
    utility: {
      count: utilities.length,
      pids: utilities.map(u => u.pid),
      workingSetMb: Number(totalUtilityWsMb.toFixed(2)),
      peakWorkingSetMb: Number(totalUtilityPeakMb.toFixed(2)),
      cpuPercent: Number(totalUtilityCpu.toFixed(2)),
    },
    totalCombinedWorkingSetMb: Number((totalCombinedWsKb / 1024).toFixed(2)),
    activeProcessesCount: (rawMetrics as RawProcessMetric[]).length,
  };
}

/**
 * Validates the scanner status payload received from IPC.
 * Never swallows IPC errors or returns fake success values (zero watchers / disabled).
 */
export function validateScannerStatusResponse(status: unknown): ValidatedScannerStatus {
  if (!status || typeof status !== "object") {
    throw new Error("TELEMETRY_IPC_FAILURE: Scanner status response is null or not an object");
  }

  const record = status as Record<string, unknown>;

  if (record.error) {
    throw new Error(`TELEMETRY_IPC_FAILURE: Scanner status returned error: ${String(record.error)}`);
  }

  if (typeof record.isEnabled !== "boolean") {
    throw new Error(`TELEMETRY_IPC_FAILURE: Scanner status 'isEnabled' must be a boolean, got: ${String(record.isEnabled)}`);
  }

  if (typeof record.activeWatchersCount !== "number" || !Number.isFinite(record.activeWatchersCount) || record.activeWatchersCount < 0) {
    throw new Error(
      `TELEMETRY_IPC_FAILURE: Scanner status 'activeWatchersCount' must be a non-negative finite integer, got: ${String(record.activeWatchersCount)}`,
    );
  }

  return {
    isEnabled: record.isEnabled,
    activeWatchersCount: record.activeWatchersCount,
    scope: record.scope as ValidatedScannerStatus["scope"],
  };
}
