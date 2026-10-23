/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { DeploymentLike } from "./revisions";

export type RolloutPhase = "accepted" | "progressing" | "completed" | "degraded" | "timedout" | "unverified" | "failed";

export interface RolloutCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
}

export interface RolloutObservation {
  phase: RolloutPhase;
  message: string;
  desired: number;
  updated: number;
  ready: number;
  available: number;
  unavailable: number;
  generation: number;
  observedGeneration: number;
  conditions: RolloutCondition[];
  elapsedMs: number;
}

export const DEFAULT_ROLLOUT_TIMEOUT_MS = 120_000;
export const DEFAULT_ROLLOUT_POLL_INTERVAL_MS = 2_000;
export const MAX_CONSECUTIVE_ROLLOUT_OBSERVATION_ERRORS = 3;

const getConditions = (deployment: DeploymentLike): RolloutCondition[] => (
  (deployment.status?.conditions ?? [])
    .filter(condition => typeof condition?.type === "string" && typeof condition?.status === "string")
    .map(condition => ({
      type: condition.type as string,
      status: condition.status as string,
      reason: condition.reason,
      message: condition.message,
    }))
);

const findCondition = (conditions: RolloutCondition[], type: string): RolloutCondition | undefined => (
  conditions.find(condition => condition.type === type)
);

export const classifyRollout = (
  deployment: DeploymentLike,
  elapsedMs: number,
  timeoutMs = DEFAULT_ROLLOUT_TIMEOUT_MS,
): RolloutObservation => {
  const desired = deployment.spec?.replicas ?? 0;
  const updated = deployment.status?.updatedReplicas ?? 0;
  const ready = deployment.status?.readyReplicas ?? 0;
  const available = deployment.status?.availableReplicas ?? 0;
  const unavailable = deployment.status?.unavailableReplicas ?? 0;
  const generation = deployment.metadata?.generation ?? 0;
  const observedGeneration = deployment.status?.observedGeneration ?? 0;
  const conditions = getConditions(deployment);
  const base = {
    desired,
    updated,
    ready,
    available,
    unavailable,
    generation,
    observedGeneration,
    conditions,
    elapsedMs,
  };

  const replicaFailure = findCondition(conditions, "ReplicaFailure");

  if (replicaFailure?.status === "True") {
    return {
      ...base,
      phase: "failed",
      message: replicaFailure.message ?? "The ReplicaSet controller reported a failure.",
    };
  }

  const progressing = findCondition(conditions, "Progressing");

  if (progressing?.status === "False") {
    if (progressing.reason === "ProgressDeadlineExceeded") {
      return {
        ...base,
        phase: "degraded",
        message: progressing.message ?? "The rollout exceeded its progress deadline.",
      };
    }

    return {
      ...base,
      phase: "failed",
      message: progressing.message ?? `The rollout stopped progressing (${progressing.reason ?? "unknown reason"}).`,
    };
  }

  const observed = generation === 0 || observedGeneration >= generation;
  const completed = observed
    && updated === desired
    && ready >= desired
    && available >= desired
    && unavailable === 0;

  if (completed) {
    return {
      ...base,
      phase: "completed",
      message: desired === 0
        ? "The Deployment is scaled to zero; no Pods remain."
        : "All replicas are updated, ready and available.",
    };
  }

  if (elapsedMs >= timeoutMs) {
    return {
      ...base,
      phase: "timedout",
      message: `The API accepted the rollback, but its progress could not be verified within ${Math.round(timeoutMs / 1000)}s. It may still be running.`,
    };
  }

  if (!observed) {
    return {
      ...base,
      phase: "accepted",
      message: "The API server accepted the rollback; the Deployment controller has not observed the new generation yet.",
    };
  }

  return {
    ...base,
    phase: "progressing",
    message: `${updated}/${desired} replicas updated, ${ready} ready, ${available} available.`,
  };
};

export const createRolloutObservationOutcome = (
  deployment: DeploymentLike,
  phase: "timedout" | "unverified",
  elapsedMs: number,
  message: string,
): RolloutObservation => ({
  phase,
  message,
  desired: deployment.spec?.replicas ?? 0,
  updated: deployment.status?.updatedReplicas ?? 0,
  ready: deployment.status?.readyReplicas ?? 0,
  available: deployment.status?.availableReplicas ?? 0,
  unavailable: deployment.status?.unavailableReplicas ?? 0,
  generation: deployment.metadata?.generation ?? 0,
  observedGeneration: deployment.status?.observedGeneration ?? 0,
  conditions: getConditions(deployment),
  elapsedMs,
});

export const isTerminalRolloutPhase = (phase: RolloutPhase): boolean => (
  phase === "completed" || phase === "failed" || phase === "degraded" || phase === "timedout" || phase === "unverified"
);
