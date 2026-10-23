/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { Deployment, ReplicaSet } from "@openlens/kube-object";
import type { DeploymentRevision, RolloutTemplate } from "./revisions";
import { getDeploymentRevisionAnnotation, getRevisionNumber } from "./revisions";
import type { JsonPatchOperation, RollbackPatchPlan, TemplateChangeCategory } from "./template-patch";
import {
  buildRollbackPatchPlan,
  describeTemplateChanges,
  getTemplateFingerprint,
  RollbackPreconditionError,
} from "./template-patch";
import { describeRolloutError, getHttpStatusCodeForRolloutError } from "./errors";

export type RollbackPreparationErrorKind =
  | "not-found"
  | "forbidden"
  | "pruned"
  | "deployment-replaced"
  | "revision-replaced"
  | "ownership-changed"
  | "revision-changed"
  | "paused"
  | "deleting"
  | "invalid-revision"
  | "no-template"
  | "precondition"
  | "unknown";

export interface RollbackPreparationError {
  kind: RollbackPreparationErrorKind;
  message: string;
}

export interface PreparedRollback {
  deployment: Deployment;
  targetReplicaSet: ReplicaSet;
  plan: RollbackPatchPlan;
  changes: TemplateChangeCategory[];
  sameTemplate: boolean;
  inProgress: boolean;
  fromRevision: number | null;
  toRevision: number;
  targetUid: string;
  targetName: string;
  createdAt?: string;
  changeCause?: string;
}

export type RollbackPreparationResult =
  | { status: "ready"; preparation: PreparedRollback }
  | { status: "error"; error: RollbackPreparationError };

export interface RollbackApiDependencies {
  deploymentApi: {
    get(params: { name: string; namespace: string }): Promise<Deployment | null>;
  };
  replicaSetApi: {
    get(params: { name: string; namespace: string }): Promise<ReplicaSet | null>;
  };
}

const failure = (kind: RollbackPreparationErrorKind, message: string): RollbackPreparationResult => ({
  status: "error",
  error: { kind, message },
});

const isRolloutInProgress = (deployment: Deployment): boolean => {
  const generation = deployment.metadata.generation;
  const observedGeneration = deployment.status?.observedGeneration;
  const desired = deployment.spec?.replicas ?? 0;
  const updated = deployment.status?.updatedReplicas ?? 0;

  if (typeof generation === "number" && typeof observedGeneration === "number" && observedGeneration < generation) {
    return true;
  }

  return desired > 0 && updated < desired;
};

export const prepareRollback = async (
  request: { deployment: Deployment; revision: DeploymentRevision },
  deps: RollbackApiDependencies,
): Promise<RollbackPreparationResult> => {
  const { deployment: requestedDeployment, revision } = request;
  const namespace = requestedDeployment.getNs();
  const name = requestedDeployment.getName();

  if (!revision.valid || revision.revision === null) {
    return failure("invalid-revision", revision.invalidReason ?? "The selected revision is not valid.");
  }

  if (!revision.uid || !revision.name) {
    return failure("invalid-revision", "The selected revision is missing its ReplicaSet identity.");
  }

  const selectedDeploymentUid = requestedDeployment.metadata.uid;

  if (!selectedDeploymentUid || revision.namespace !== namespace) {
    return failure("invalid-revision", "The selected revision does not have a verifiable Deployment identity.");
  }

  const selectedOwner = revision.raw?.metadata?.ownerReferences?.find(reference => reference.controller === true);

  if (
    revision.raw?.apiVersion !== "apps/v1"
    || revision.raw?.kind !== "ReplicaSet"
    || revision.raw?.metadata?.name !== revision.name
    || revision.raw?.metadata?.namespace !== namespace
    || revision.raw?.metadata?.uid !== revision.uid
    || !selectedOwner
    || selectedOwner.apiVersion !== "apps/v1"
    || selectedOwner.kind !== "Deployment"
    || selectedOwner.name !== name
    || selectedOwner.uid !== selectedDeploymentUid
  ) {
    return failure("invalid-revision", "The selected revision is not controlled by the selected Deployment.");
  }

  let deployment: Deployment | null;
  let targetReplicaSet: ReplicaSet | null;

  try {
    deployment = await deps.deploymentApi.get({ name, namespace });
  } catch (err) {
    const statusCode = getHttpStatusCodeForRolloutError(err);

    if (statusCode === 403) {
      return failure("forbidden", "You do not have permission to read this Deployment (RBAC 403).");
    }

    if (statusCode === 404) {
      return failure("not-found", "The Deployment no longer exists (404).");
    }

    return failure("unknown", "Failed to load the Deployment. Check cluster connectivity and try again.");
  }

  if (!deployment) {
    return failure("not-found", "The Deployment no longer exists.");
  }

  if (
    deployment.apiVersion !== "apps/v1"
    || deployment.kind !== "Deployment"
    || deployment.getName() !== name
    || deployment.getNs() !== namespace
    || deployment.metadata.uid !== selectedDeploymentUid
  ) {
    return failure("deployment-replaced", "The Deployment identity changed. Refresh the history before rolling back.");
  }

  if (deployment.metadata.deletionTimestamp) {
    return failure("deleting", "The Deployment is being deleted; rollback is unavailable.");
  }

  if (deployment.spec?.paused) {
    return failure("paused", "The Deployment is paused. Resume the rollout before rolling back.");
  }

  try {
    targetReplicaSet = await deps.replicaSetApi.get({ name: revision.name, namespace });
  } catch (err) {
    const statusCode = getHttpStatusCodeForRolloutError(err);

    if (statusCode === 403) {
      return failure("forbidden", "You do not have permission to read the revision ReplicaSet (RBAC 403).");
    }

    if (statusCode === 404) {
      return failure("pruned", "The revision ReplicaSet no longer exists; it may have been pruned.");
    }

    return failure("unknown", "Failed to load the revision ReplicaSet. Check cluster connectivity and try again.");
  }

  if (!targetReplicaSet) {
    return failure("pruned", "The revision ReplicaSet no longer exists; it may have been pruned.");
  }

  const deploymentUid = deployment.metadata.uid;
  const owner = (targetReplicaSet.metadata.ownerReferences ?? []).find(reference => reference.controller === true);

  if (
    targetReplicaSet.apiVersion !== "apps/v1"
    || targetReplicaSet.kind !== "ReplicaSet"
    || !deploymentUid
    || targetReplicaSet.getName() !== revision.name
    || targetReplicaSet.getNs() !== namespace
    || targetReplicaSet.metadata.uid !== revision.uid
  ) {
    return failure("revision-replaced", "The selected ReplicaSet was replaced. Refresh the history before rolling back.");
  }

  if (
    !owner
    || owner.apiVersion !== "apps/v1"
    || owner.kind !== "Deployment"
    || owner.name !== name
    || owner.uid !== deploymentUid
    || owner.uid !== selectedDeploymentUid
  ) {
    return failure(
      "ownership-changed",
      "The selected ReplicaSet no longer belongs to this Deployment. Refresh the history and try again.",
    );
  }

  const freshRevision = getRevisionNumber(targetReplicaSet);

  if (freshRevision !== revision.revision) {
    return failure(
      "revision-changed",
      `The selected ReplicaSet revision changed from #${revision.revision} to ${freshRevision === null ? "unknown" : `#${freshRevision}`}. Refresh the history and try again.`,
    );
  }

  const targetTemplate = targetReplicaSet.spec?.template as RolloutTemplate | undefined;

  if (!targetTemplate) {
    return failure("no-template", "The selected revision has no Pod template; rollback is unavailable.");
  }

  let plan: RollbackPatchPlan;

  try {
    plan = buildRollbackPatchPlan(deployment, targetTemplate);
  } catch (err) {
    if (err instanceof RollbackPreconditionError) {
      return failure("precondition", err.message);
    }

    return failure("precondition", "Rollback preconditions could not be verified. Refresh the history and try again.");
  }

  if (plan.templateOperations.length === 0) {
    return {
      status: "ready",
      preparation: {
        deployment,
        targetReplicaSet,
        plan,
        changes: [],
        sameTemplate: true,
        inProgress: isRolloutInProgress(deployment),
        fromRevision: getDeploymentRevisionAnnotation(deployment),
        toRevision: revision.revision,
        targetUid: revision.uid,
        targetName: revision.name,
        createdAt: revision.createdAt,
        changeCause: revision.changeCause,
      },
    };
  }

  return {
    status: "ready",
    preparation: {
      deployment,
      targetReplicaSet,
      plan,
      changes: describeTemplateChanges(deployment.spec?.template, targetTemplate),
      sameTemplate: getTemplateFingerprint(deployment.spec?.template) === getTemplateFingerprint(targetTemplate),
      inProgress: isRolloutInProgress(deployment),
      fromRevision: getDeploymentRevisionAnnotation(deployment),
      toRevision: revision.revision,
      targetUid: revision.uid,
      targetName: revision.name,
      createdAt: revision.createdAt,
      changeCause: revision.changeCause,
    },
  };
};

export type RollbackPatchMode = "dry-run" | "execute";

export interface RollbackPatchResult {
  ok: boolean;
  operationCount: number;
  statusCode?: number;
  message?: string;
  causes?: Array<{ field?: string; message: string }>;
}

export interface RollbackPatchDependencies {
  deploymentApi: {
    patch(
      params: { name: string; namespace: string },
      patch: JsonPatchOperation[],
      strategy: "json",
      opts?: { dryRun?: "All" },
    ): Promise<unknown>;
  };
}

/**
 * Applies the prepared JSON Patch. In dry-run mode the Kubernetes API server
 * validates the whole request (including admission and `test` preconditions)
 * and returns without mutating the Deployment.
 */
export const applyRollbackPatch = async (
  deps: RollbackPatchDependencies,
  deployment: Deployment,
  plan: RollbackPatchPlan,
  mode: RollbackPatchMode,
): Promise<RollbackPatchResult> => {
  try {
    await deps.deploymentApi.patch(
      { name: deployment.getName(), namespace: deployment.getNs() },
      plan.patch,
      "json",
      mode === "dry-run" ? { dryRun: "All" } : undefined,
    );

    return { ok: true, operationCount: plan.patch.length };
  } catch (err) {
    const causeList = getCauses(err);

    return {
      ok: false,
      operationCount: plan.patch.length,
      statusCode: getHttpStatusCodeForRolloutError(err),
      message: describeRolloutError(err),
      causes: causeList,
    };
  }
};

const getCauses = (err: unknown): Array<{ field?: string; message: string }> => {
  const causes = (err as { error?: { details?: { causes?: Array<{ field?: string; message?: string }> }}})
    ?.error?.details?.causes;

  if (!Array.isArray(causes)) {
    return [];
  }

  return causes
    .filter(cause => typeof cause?.field === "string")
    .map(cause => ({ field: cause.field as string, message: "Validation failed." }));
};
