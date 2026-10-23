/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { DeploymentLike } from "./revisions";
import { classifyRollout, createRolloutObservationOutcome, isTerminalRolloutPhase } from "./rollout-progress";

const deployment = (overrides: Partial<DeploymentLike> = {}): DeploymentLike => ({
  kind: "Deployment",
  apiVersion: "apps/v1",
  metadata: {
    name: "web",
    namespace: "default",
    uid: "deployment-uid",
    resourceVersion: "42",
    generation: 5,
  },
  spec: { replicas: 3, template: { spec: { containers: [] }}},
  status: {
    observedGeneration: 5,
    replicas: 3,
    updatedReplicas: 3,
    readyReplicas: 3,
    availableReplicas: 3,
    unavailableReplicas: 0,
    conditions: [{ type: "Progressing", status: "True", reason: "NewReplicaSetAvailable" }],
  },
  ...overrides,
});

describe("classifyRollout", () => {
  it("reports completed when every replica is updated, ready and available", () => {
    const result = classifyRollout(deployment(), 0);

    expect(result.phase).toBe("completed");
    expect(result.desired).toBe(3);
    expect(result.updated).toBe(3);
  });

  it("reports accepted while the controller has not observed the generation", () => {
    const result = classifyRollout(deployment({
      status: { ...deployment().status, observedGeneration: 4 },
    }), 0);

    expect(result.phase).toBe("accepted");
  });

  it("reports progressing while replicas are being updated", () => {
    const result = classifyRollout(deployment({
      status: {
        ...deployment().status,
        updatedReplicas: 1,
        readyReplicas: 1,
        availableReplicas: 1,
        unavailableReplicas: 2,
      },
    }), 1000);

    expect(result.phase).toBe("progressing");
    expect(result.updated).toBe(1);
  });

  it("reports degraded when the progress deadline is exceeded", () => {
    const result = classifyRollout(deployment({
      status: {
        ...deployment().status,
        conditions: [{
          type: "Progressing",
          status: "False",
          reason: "ProgressDeadlineExceeded",
          message: "deadline exceeded",
        }],
      },
    }), 1000);

    expect(result.phase).toBe("degraded");
  });

  it("reports failed on a ReplicaFailure condition", () => {
    const result = classifyRollout(deployment({
      status: {
        ...deployment().status,
        conditions: [{ type: "ReplicaFailure", status: "True", message: "quota exceeded" }],
      },
    }), 1000);

    expect(result.phase).toBe("failed");
    expect(result.message).toContain("quota");
  });

  it("reports failed on a non-deadline Progressing=False condition", () => {
    const result = classifyRollout(deployment({
      status: {
        ...deployment().status,
        conditions: [{ type: "Progressing", status: "False", reason: "InvalidStrategy" }],
      },
    }), 1000);

    expect(result.phase).toBe("failed");
  });

  it("reports timed out when progress never completes", () => {
    const result = classifyRollout(deployment({
      status: {
        ...deployment().status,
        updatedReplicas: 1,
        readyReplicas: 1,
        availableReplicas: 1,
        unavailableReplicas: 2,
      },
    }), 10_000, 5_000);

    expect(result.phase).toBe("timedout");
    expect(result.message).toContain("API accepted the rollback");
    expect(result.message).toContain("may still be running");
  });

  it("represents observation failures as unverified, not rollback failures", () => {
    const result = createRolloutObservationOutcome(
      deployment(),
      "unverified",
      5_000,
      "Repeated API failures prevented verification.",
    );

    expect(result.phase).toBe("unverified");
    expect(isTerminalRolloutPhase(result.phase)).toBe(true);
    expect(result.message).toContain("verification");
  });

  it("treats a zero-replica deployment as completed once observed", () => {
    const result = classifyRollout(deployment({
      spec: { replicas: 0, template: { spec: { containers: [] }}},
      status: {
        observedGeneration: 5,
        replicas: 0,
        updatedReplicas: 0,
        readyReplicas: 0,
        availableReplicas: 0,
        unavailableReplicas: 0,
      },
    }), 0);

    expect(result.phase).toBe("completed");
  });
});

describe("isTerminalRolloutPhase", () => {
  it("distinguishes terminal phases from accepted/progressing", () => {
    expect(isTerminalRolloutPhase("completed")).toBe(true);
    expect(isTerminalRolloutPhase("failed")).toBe(true);
    expect(isTerminalRolloutPhase("degraded")).toBe(true);
    expect(isTerminalRolloutPhase("timedout")).toBe(true);
    expect(isTerminalRolloutPhase("unverified")).toBe(true);
    expect(isTerminalRolloutPhase("accepted")).toBe(false);
    expect(isTerminalRolloutPhase("progressing")).toBe(false);
  });
});
