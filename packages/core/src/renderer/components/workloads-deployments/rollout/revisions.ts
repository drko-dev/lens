/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export const DEPLOYMENT_REVISION_ANNOTATION = "deployment.kubernetes.io/revision";
export const CHANGE_CAUSE_ANNOTATION = "kubernetes.io/change-cause";
export const POD_TEMPLATE_HASH_LABEL = "pod-template-hash";

export interface RolloutOwnerReference {
  apiVersion?: string;
  kind?: string;
  name?: string;
  uid?: string;
  controller?: boolean;
}

export interface RolloutContainer {
  name?: string;
  image?: string;
  [key: string]: unknown;
}

export interface RolloutTemplate {
  metadata?: {
    labels?: Partial<Record<string, string>>;
    annotations?: Partial<Record<string, string>>;
    [key: string]: unknown;
  };
  spec?: {
    containers?: RolloutContainer[];
    initContainers?: RolloutContainer[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface RolloutMetadata {
  name?: string;
  namespace?: string;
  uid?: string;
  resourceVersion?: string;
  selfLink?: string;
  generation?: number;
  creationTimestamp?: string;
  deletionTimestamp?: string;
  labels?: Partial<Record<string, string>>;
  annotations?: Partial<Record<string, string>>;
  ownerReferences?: RolloutOwnerReference[];
}

export interface DeploymentLike {
  apiVersion?: string;
  kind?: string;
  metadata: RolloutMetadata;
  spec?: {
    replicas?: number;
    revisionHistoryLimit?: number;
    paused?: boolean;
    template?: unknown;
  };
  status?: {
    observedGeneration?: number;
    replicas?: number;
    updatedReplicas?: number;
    readyReplicas?: number;
    availableReplicas?: number;
    unavailableReplicas?: number;
    conditions?: Array<{
      type?: string;
      status?: string;
      reason?: string;
      message?: string;
      lastTransitionTime?: string;
    }>;
  };
}

export interface ReplicaSetLike {
  apiVersion?: string;
  kind?: string;
  metadata: RolloutMetadata;
  spec?: {
    replicas?: number;
    template?: unknown;
  };
  status?: {
    replicas?: number;
    readyReplicas?: number;
    availableReplicas?: number;
  };
}

export type RevisionAvailability = "current" | "active" | "historical";

export interface RevisionImage {
  container: string;
  image: string;
  init: boolean;
}

export interface DeploymentRevision {
  uid: string;
  name: string;
  namespace: string;
  revision: number | null;
  revisionLabel: string;
  createdAt?: string;
  images: RevisionImage[];
  replicas: number;
  changeCause?: string;
  template?: RolloutTemplate;
  availability: RevisionAvailability;
  valid: boolean;
  invalidReason?: string;
  duplicate: boolean;
  raw: ReplicaSetLike;
}

export interface DeploymentRevisionHistory {
  revisions: DeploymentRevision[];
  currentRevision: number | null;
  currentRevisionSource: "annotation" | "inferred" | "none";
  ownerUid?: string;
  foreignReplicaSets: number;
  orphanReplicaSets: number;
  invalidReplicaSets: number;
  duplicateRevisions: number[];
  missingRevisions: number[];
  historyIncomplete: boolean;
  revisionHistoryLimit: number;
  revisionHistoryLimitIsDefault: boolean;
  fatalReason?: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

const parsePositiveInteger = (value: unknown): number | null => {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
    return null;
  }

  const parsed = Number.parseInt(value.trim(), 10);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

export const getDeploymentRevisionAnnotation = (deployment: DeploymentLike): number | null => (
  parsePositiveInteger(deployment.metadata?.annotations?.[DEPLOYMENT_REVISION_ANNOTATION])
);

export const getRevisionNumber = (replicaSet: ReplicaSetLike): number | null => (
  parsePositiveInteger(replicaSet.metadata?.annotations?.[DEPLOYMENT_REVISION_ANNOTATION])
);

export const getChangeCause = (replicaSet: ReplicaSetLike): string | undefined => {
  const value = replicaSet.metadata?.annotations?.[CHANGE_CAUSE_ANNOTATION];

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed === "" ? undefined : trimmed;
};

export const getRevisionImages = (template: unknown): RevisionImage[] => {
  const spec = isPlainObject(template) && isPlainObject(template.spec) ? template.spec : {};
  const containers = (Array.isArray(spec.containers) ? spec.containers : []) as RolloutContainer[];
  const initContainers = (Array.isArray(spec.initContainers) ? spec.initContainers : []) as RolloutContainer[];
  const images: RevisionImage[] = [];
  const seen = new Set<string>();

  const collect = (items: RolloutContainer[], init: boolean) => {
    for (const container of items) {
      if (typeof container?.image !== "string" || container.image === "") {
        continue;
      }

      const name = typeof container.name === "string" ? container.name : "";
      const key = `${init ? "init" : "app"}/${name}/${container.image}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      images.push({ container: name, image: container.image, init });
    }
  };

  collect(containers, false);
  collect(initContainers, true);

  return images;
};

const getOwnerDeploymentRef = (replicaSet: ReplicaSetLike): RolloutOwnerReference | undefined => (
  (replicaSet.metadata?.ownerReferences ?? [])
    .filter(ref => ref?.kind === "Deployment")
    .find(ref => ref?.controller !== false)
);

const countReplicas = (replicaSet: ReplicaSetLike): number => (
  replicaSet.status?.replicas
  ?? replicaSet.spec?.replicas
  ?? 0
);

export const buildDeploymentRevisionHistory = (
  deployment: DeploymentLike,
  replicaSets: ReplicaSetLike[],
): DeploymentRevisionHistory => {
  const ownerUid = deployment.metadata?.uid;
  const namespace = deployment.metadata?.namespace ?? "";
  const revisionHistoryLimit = deployment.spec?.revisionHistoryLimit ?? 10;
  const revisionHistoryLimitIsDefault = deployment.spec?.revisionHistoryLimit === undefined;

  const base: DeploymentRevisionHistory = {
    revisions: [],
    currentRevision: null,
    currentRevisionSource: "none",
    ownerUid,
    foreignReplicaSets: 0,
    orphanReplicaSets: 0,
    invalidReplicaSets: 0,
    duplicateRevisions: [],
    missingRevisions: [],
    historyIncomplete: false,
    revisionHistoryLimit,
    revisionHistoryLimitIsDefault,
  };

  if (!ownerUid) {
    return {
      ...base,
      fatalReason: "The Deployment has no UID; revision ownership cannot be verified safely.",
    };
  }

  if (!deployment.spec?.template) {
    return {
      ...base,
      fatalReason: "The Deployment has no Pod template; revision history is unavailable.",
    };
  }

  const candidates: DeploymentRevision[] = [];

  for (const replicaSet of replicaSets ?? []) {
    if (!replicaSet || typeof replicaSet !== "object" || !replicaSet.metadata) {
      base.invalidReplicaSets++;
      continue;
    }

    const metadata = replicaSet.metadata;

    if ((metadata.namespace ?? "") !== namespace) {
      base.foreignReplicaSets++;
      continue;
    }

    const ownerRefs = metadata.ownerReferences ?? [];

    if (ownerRefs.length === 0) {
      base.orphanReplicaSets++;
      continue;
    }

    const owner = getOwnerDeploymentRef(replicaSet);

    if (!owner || owner.uid !== ownerUid) {
      base.foreignReplicaSets++;
      continue;
    }

    const revision = getRevisionNumber(replicaSet);
    const template = replicaSet.spec?.template;
    const uid = metadata.uid;
    const name = metadata.name;
    const invalidReasons: string[] = [];

    if (!uid) {
      invalidReasons.push("missing ReplicaSet UID");
    }

    if (!name) {
      invalidReasons.push("missing ReplicaSet name");
    }

    if (revision === null) {
      invalidReasons.push("missing or invalid revision annotation");
    }

    if (!isPlainObject(template) || !isPlainObject(template.spec)) {
      invalidReasons.push("missing Pod template");
    }

    candidates.push({
      uid: uid ?? "",
      name: name ?? "",
      namespace,
      revision,
      revisionLabel: revision === null ? "unknown" : `#${revision}`,
      createdAt: metadata.creationTimestamp,
      images: getRevisionImages(template),
      replicas: countReplicas(replicaSet),
      changeCause: getChangeCause(replicaSet),
      template: template as RolloutTemplate,
      availability: "historical",
      valid: invalidReasons.length === 0,
      invalidReason: invalidReasons.length > 0 ? invalidReasons.join("; ") : undefined,
      duplicate: false,
      raw: replicaSet,
    });
  }

  const validRevisions = candidates.filter(entry => entry.valid && entry.revision !== null);
  const byNumber = new Map<number, DeploymentRevision[]>();

  for (const entry of validRevisions) {
    const number = entry.revision as number;
    const bucket = byNumber.get(number) ?? [];

    bucket.push(entry);
    byNumber.set(number, bucket);
  }

  const duplicateRevisions = [...byNumber.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([number]) => number)
    .sort((a, b) => a - b);

  for (const entry of candidates) {
    if (!entry.valid || entry.revision === null) {
      continue;
    }

    const bucket = byNumber.get(entry.revision);

    if ((bucket?.length ?? 0) > 1) {
      entry.valid = false;
      entry.duplicate = true;
      entry.invalidReason = "duplicate revision number for this Deployment";
    }
  }

  const usable = candidates.filter(entry => entry.valid && entry.revision !== null);
  const annotatedCurrent = getDeploymentRevisionAnnotation(deployment);
  const inferredCurrent = usable.length > 0
    ? Math.max(...usable.map(entry => entry.revision as number))
    : null;
  const currentRevision = annotatedCurrent ?? inferredCurrent;
  const currentRevisionSource: DeploymentRevisionHistory["currentRevisionSource"] = annotatedCurrent !== null
    ? "annotation"
    : inferredCurrent !== null ? "inferred" : "none";

  for (const entry of candidates) {
    if (!entry.valid || entry.revision === null) {
      continue;
    }

    if (entry.revision === currentRevision) {
      entry.availability = "current";
    } else if (entry.replicas > 0) {
      entry.availability = "active";
    }
  }

  const allParsed = candidates
    .map(entry => entry.revision)
    .filter((revision): revision is number => revision !== null);

  const missingRevisions: number[] = [];

  if (allParsed.length > 0) {
    const present = new Set(allParsed);
    const min = Math.min(...allParsed);
    const max = Math.max(...allParsed);

    for (let revision = min; revision <= max; revision++) {
      if (!present.has(revision)) {
        missingRevisions.push(revision);
      }
    }
  }

  const sorted = [...candidates].sort((a, b) => {
    if (a.valid !== b.valid) {
      return a.valid ? -1 : 1;
    }

    if (a.valid && b.valid && a.revision !== b.revision) {
      return (b.revision as number) - (a.revision as number);
    }

    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });

  const minRevision = allParsed.length > 0 ? Math.min(...allParsed) : 0;

  return {
    ...base,
    revisions: sorted,
    currentRevision,
    currentRevisionSource,
    invalidReplicaSets: candidates.filter(entry => !entry.valid).length,
    duplicateRevisions,
    missingRevisions,
    historyIncomplete: minRevision > 1 || missingRevisions.length > 0,
  };
};
