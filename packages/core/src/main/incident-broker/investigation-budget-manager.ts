/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export interface InvestigationBudgetLimit {
  maxToolCalls: number;
  maxK8sRequests: number;
  maxLogLines: number;
  maxBytes: number;
  maxDurationMs: number;
  maxConcurrent: number;
}

export interface InvestigationBudgetUsage {
  usedToolCalls: number;
  usedK8sRequests: number;
  usedLogLines: number;
  usedBytes: number;
  activeConcurrent: number;
  startedAt: number;
  isExhausted: boolean;
  exhaustedReason?: string;
}

export const DEFAULT_INVESTIGATION_BUDGET: InvestigationBudgetLimit = {
  maxToolCalls: 20,
  maxK8sRequests: 50,
  maxLogLines: 500,
  maxBytes: 1024 * 1024, // 1 MiB
  maxDurationMs: 5 * 60 * 1000, // 5 minutes
  maxConcurrent: 2,
};

export class BudgetExhaustedError extends Error {
  constructor(readonly reason: string, readonly usage: InvestigationBudgetUsage) {
    super(`Investigation budget exhausted: ${reason}. Explicit operator authorization required to expand.`);
    this.name = "BudgetExhaustedError";
  }
}

export class InvestigationBudgetManager {
  private readonly limitsByIncident = new Map<string, InvestigationBudgetLimit>();
  private readonly usageByIncident = new Map<string, InvestigationBudgetUsage>();

  public getLimits(incidentId: string): InvestigationBudgetLimit {
    return this.limitsByIncident.get(incidentId) || { ...DEFAULT_INVESTIGATION_BUDGET };
  }

  public setLimits(incidentId: string, limits: Partial<InvestigationBudgetLimit>): void {
    const current = this.getLimits(incidentId);

    this.limitsByIncident.set(incidentId, {
      ...current,
      ...limits,
    });
  }

  public getUsage(incidentId: string): InvestigationBudgetUsage {
    let usage = this.usageByIncident.get(incidentId);

    if (!usage) {
      usage = {
        usedToolCalls: 0,
        usedK8sRequests: 0,
        usedLogLines: 0,
        usedBytes: 0,
        activeConcurrent: 0,
        startedAt: Date.now(),
        isExhausted: false,
      };
      this.usageByIncident.set(incidentId, usage);
    }

    return usage;
  }

  /**
   * Acquires a concurrency slot and checks whether the budget has been exceeded.
   * Throws BudgetExhaustedError if budget limit reached.
   */
  public acquireExecutionSlot(incidentId: string): void {
    const limits = this.getLimits(incidentId);
    const usage = this.getUsage(incidentId);

    if (usage.isExhausted) {
      throw new BudgetExhaustedError(usage.exhaustedReason || "Budget previously exhausted.", usage);
    }

    // Check time duration
    const elapsed = Date.now() - usage.startedAt;

    if (elapsed > limits.maxDurationMs) {
      usage.isExhausted = true;
      usage.exhaustedReason = `Execution time limit exceeded (${Math.round(elapsed / 1000)}s > ${limits.maxDurationMs / 1000}s).`;
      throw new BudgetExhaustedError(usage.exhaustedReason, usage);
    }

    // Check tool call count
    if (usage.usedToolCalls >= limits.maxToolCalls) {
      usage.isExhausted = true;
      usage.exhaustedReason = `Maximum tool calls limit reached (${usage.usedToolCalls}/${limits.maxToolCalls}).`;
      throw new BudgetExhaustedError(usage.exhaustedReason, usage);
    }

    // Check concurrency
    if (usage.activeConcurrent >= limits.maxConcurrent) {
      throw new Error(`Concurrency limit reached (${usage.activeConcurrent}/${limits.maxConcurrent} active). Retry after in-flight call completes.`);
    }

    usage.activeConcurrent += 1;
    usage.usedToolCalls += 1;
  }

  /**
   * Releases an active concurrency slot.
   */
  public releaseExecutionSlot(incidentId: string): void {
    const usage = this.usageByIncident.get(incidentId);

    if (usage && usage.activeConcurrent > 0) {
      usage.activeConcurrent -= 1;
    }
  }

  /**
   * Records resource consumption (K8s requests, log lines, bytes) and flags exhaustion.
   */
  public recordUsage(
    incidentId: string,
    delta: {
      k8sRequests?: number;
      logLines?: number;
      bytes?: number;
    },
  ): void {
    const limits = this.getLimits(incidentId);
    const usage = this.getUsage(incidentId);

    if (delta.k8sRequests) usage.usedK8sRequests += delta.k8sRequests;
    if (delta.logLines) usage.usedLogLines += delta.logLines;
    if (delta.bytes) usage.usedBytes += delta.bytes;

    if (usage.usedK8sRequests > limits.maxK8sRequests) {
      usage.isExhausted = true;
      usage.exhaustedReason = `Kubernetes requests limit exceeded (${usage.usedK8sRequests}/${limits.maxK8sRequests}).`;
    } else if (usage.usedLogLines > limits.maxLogLines) {
      usage.isExhausted = true;
      usage.exhaustedReason = `Log lines limit exceeded (${usage.usedLogLines}/${limits.maxLogLines}).`;
    } else if (usage.usedBytes > limits.maxBytes) {
      usage.isExhausted = true;
      usage.exhaustedReason = `Data transfer limit exceeded (${usage.usedBytes}/${limits.maxBytes} bytes).`;
    }
  }

  /**
   * Expands the budget with explicit human operator authorization.
   */
  public expandBudget(incidentId: string, extension: Partial<InvestigationBudgetLimit>): void {
    const currentLimits = this.getLimits(incidentId);
    const currentUsage = this.getUsage(incidentId);

    this.limitsByIncident.set(incidentId, {
      maxToolCalls: currentLimits.maxToolCalls + (extension.maxToolCalls ?? 10),
      maxK8sRequests: currentLimits.maxK8sRequests + (extension.maxK8sRequests ?? 25),
      maxLogLines: currentLimits.maxLogLines + (extension.maxLogLines ?? 250),
      maxBytes: currentLimits.maxBytes + (extension.maxBytes ?? 512 * 1024),
      maxDurationMs: currentLimits.maxDurationMs + (extension.maxDurationMs ?? 5 * 60 * 1000),
      maxConcurrent: extension.maxConcurrent ?? currentLimits.maxConcurrent,
    });

    currentUsage.isExhausted = false;
    currentUsage.exhaustedReason = undefined;
  }

  public resetBudget(incidentId: string): void {
    this.usageByIncident.delete(incidentId);
    this.limitsByIncident.delete(incidentId);
  }
}
