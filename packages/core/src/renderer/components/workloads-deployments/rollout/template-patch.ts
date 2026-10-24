/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { DeploymentLike, RolloutTemplate } from "./revisions";
import { POD_TEMPLATE_HASH_LABEL } from "./revisions";

export type JsonPatchOperation =
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: unknown }
  | { op: "test"; path: string; value: unknown };

export interface RollbackPatchPlan {
  patch: JsonPatchOperation[];
  templateOperations: JsonPatchOperation[];
  targetTemplate: RolloutTemplate;
}

export class RollbackPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RollbackPreconditionError";
  }
}

const CONTROLLER_METADATA_FIELDS = [
  "creationTimestamp",
  "resourceVersion",
  "uid",
  "selfLink",
  "generation",
  "managedFields",
  "ownerReferences",
];

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null));

const escapeJsonPointer = (token: string): string => token.replace(/~/g, "~0").replace(/\//g, "~1");

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();

    return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }

  return JSON.stringify(value);
};

const deepEqual = (a: unknown, b: unknown): boolean => stableStringify(a) === stableStringify(b);

export const sanitizeRollbackTemplate = (template: unknown): RolloutTemplate | undefined => {
  if (!isPlainObject(template)) {
    return undefined;
  }

  const sanitized = cloneJson(template) as RolloutTemplate;

  if (isPlainObject(sanitized.metadata)) {
    for (const field of CONTROLLER_METADATA_FIELDS) {
      delete sanitized.metadata[field];
    }

    if (isPlainObject(sanitized.metadata.labels)) {
      delete sanitized.metadata.labels[POD_TEMPLATE_HASH_LABEL];
    }
  }

  return sanitized;
};

export const sanitizeRollbackTemplateForDiff = (template: unknown, comparison: unknown): RolloutTemplate | undefined => {
  const sanitized = sanitizeRollbackTemplate(template);
  const other = sanitizeRollbackTemplate(comparison);

  if (!sanitized) {
    return undefined;
  }

  const otherSpec = other?.spec as Record<string, unknown> | undefined;
  const sanitizedSpec = sanitized.spec as Record<string, unknown> | undefined;

  for (const key of ["containers", "initContainers"]) {
    const containers = sanitizedSpec?.[key];
    const otherContainers = Array.isArray(otherSpec?.[key])
      ? otherSpec?.[key] as Array<Record<string, unknown>>
      : [];

    if (!Array.isArray(containers)) {
      continue;
    }

    for (const container of containers as Array<Record<string, unknown>>) {
      const otherContainer = otherContainers.find(candidate => candidate.name === container.name);
      const env = container.env;

      if (!Array.isArray(env)) {
        continue;
      }

      container.env = env.map((item: unknown) => {
        if (!isPlainObject(item) || typeof item.value !== "string") {
          return item;
        }

        const otherEnv = (otherContainer && Array.isArray(otherContainer.env))
          ? (otherContainer.env as Array<Record<string, unknown>>).find(candidate => candidate.name === item.name)
          : undefined;

        // Env literals can contain credentials regardless of their variable names.
        return { ...item, value: otherEnv?.value === item.value ? "<redacted>" : "<redacted (changed)>" };
      });
    }
  }

  return sanitized;
};

const buildDiff = (current: unknown, target: unknown, path: string, operations: JsonPatchOperation[]): void => {
  if (deepEqual(current, target)) {
    return;
  }

  const bothObjects = isPlainObject(current) && isPlainObject(target);

  if (!bothObjects) {
    if (current === undefined) {
      operations.push({ op: "add", path, value: target });
    } else if (target === undefined) {
      operations.push({ op: "remove", path });
    } else {
      operations.push({ op: "replace", path, value: target });
    }

    return;
  }

  const currentKeys = Object.keys(current);
  const targetKeys = Object.keys(target);
  const keys = [...new Set([...currentKeys, ...targetKeys])].sort();

  for (const key of keys) {
    const childPath = `${path}/${escapeJsonPointer(key)}`;
    const hasCurrent = Object.prototype.hasOwnProperty.call(current, key);
    const hasTarget = Object.prototype.hasOwnProperty.call(target, key);

    if (!hasTarget) {
      operations.push({ op: "remove", path: childPath });
    } else if (!hasCurrent) {
      operations.push({ op: "add", path: childPath, value: target[key] });
    } else {
      buildDiff(current[key], target[key], childPath, operations);
    }
  }
};

export const computePodTemplatePatch = (
  currentTemplate: unknown,
  targetTemplate: unknown,
): JsonPatchOperation[] => {
  const current = sanitizeRollbackTemplate(currentTemplate);
  const target = sanitizeRollbackTemplate(targetTemplate);
  const operations: JsonPatchOperation[] = [];

  if (!current || !target) {
    return operations;
  }

  buildDiff(current, target, "/spec/template", operations);

  return operations;
};

export const buildRollbackPatchPlan = (
  deployment: DeploymentLike,
  targetTemplate: unknown,
): RollbackPatchPlan => {
  const uid = deployment.metadata?.uid;
  const resourceVersion = deployment.metadata?.resourceVersion;

  if (!uid) {
    throw new RollbackPreconditionError("The Deployment has no UID; rollback cannot be executed safely.");
  }

  if (!resourceVersion) {
    throw new RollbackPreconditionError("The Deployment has no resourceVersion; rollback cannot be executed safely.");
  }

  const sanitizedTarget = sanitizeRollbackTemplate(targetTemplate);

  if (!sanitizedTarget) {
    throw new RollbackPreconditionError("The selected revision has no Pod template; rollback is unavailable.");
  }

  const templateOperations = computePodTemplatePatch(deployment.spec?.template, sanitizedTarget);
  const patch: JsonPatchOperation[] = [
    { op: "test", path: "/metadata/uid", value: uid },
    { op: "test", path: "/metadata/resourceVersion", value: resourceVersion },
    ...templateOperations,
  ];

  return { patch, templateOperations, targetTemplate: sanitizedTarget };
};

export const getTemplateFingerprint = (template: unknown): string => (
  stableStringify(sanitizeRollbackTemplate(template) ?? null)
);

export type TemplateChangeCategory =
  | "images"
  | "environment"
  | "command"
  | "probes"
  | "resources"
  | "volumes"
  | "metadata"
  | "serviceAccount"
  | "securityContext"
  | "other";

export const TEMPLATE_CHANGE_CATEGORIES: TemplateChangeCategory[] = [
  "images",
  "environment",
  "command",
  "probes",
  "resources",
  "volumes",
  "metadata",
  "serviceAccount",
  "securityContext",
  "other",
];

const CONTAINER_CATEGORY_FIELDS: Record<Exclude<TemplateChangeCategory, "metadata" | "volumes" | "other">, string[]> = {
  images: ["name", "image"],
  environment: ["name", "env", "envFrom"],
  command: ["name", "command", "args"],
  probes: ["name", "livenessProbe", "readinessProbe", "startupProbe"],
  resources: ["name", "resources"],
  serviceAccount: [],
  securityContext: ["name", "securityContext"],
};

const KNOWN_CONTAINER_FIELDS = new Set([
  "name",
  "image",
  "env",
  "envFrom",
  "command",
  "args",
  "livenessProbe",
  "readinessProbe",
  "startupProbe",
  "resources",
  "volumeMounts",
  "securityContext",
]);

const KNOWN_SPEC_FIELDS = new Set([
  "containers",
  "initContainers",
  "volumes",
  "serviceAccountName",
  "serviceAccount",
  "automountServiceAccountToken",
  "securityContext",
]);

const getContainers = (template: RolloutTemplate | undefined): Array<Record<string, unknown>> => {
  const spec = template?.spec as Record<string, unknown> | undefined;
  const containers = Array.isArray(spec?.containers) ? spec?.containers as Array<Record<string, unknown>> : [];
  const initContainers = Array.isArray(spec?.initContainers) ? spec?.initContainers as Array<Record<string, unknown>> : [];

  return [...containers, ...initContainers];
};

const pickContainerFields = (containers: Array<Record<string, unknown>>, fields: string[]) => (
  containers.map(container => Object.fromEntries(fields.map(field => [field, container[field]])))
);

const podSpecOf = (template: RolloutTemplate | undefined): Record<string, unknown> => (
  isPlainObject(template?.spec) ? template?.spec as Record<string, unknown> : {}
);

export const describeTemplateChanges = (
  currentTemplate: unknown,
  targetTemplate: unknown,
): TemplateChangeCategory[] => {
  const current = sanitizeRollbackTemplate(currentTemplate);
  const target = sanitizeRollbackTemplate(targetTemplate);

  if (!current || !target) {
    return [];
  }

  const currentContainers = getContainers(current);
  const targetContainers = getContainers(target);
  const currentSpec = podSpecOf(current);
  const targetSpec = podSpecOf(target);
  const categories = new Set<TemplateChangeCategory>();

  for (const category of ["images", "environment", "command", "probes", "resources", "securityContext"] as const) {
    if (!deepEqual(
      pickContainerFields(currentContainers, CONTAINER_CATEGORY_FIELDS[category]),
      pickContainerFields(targetContainers, CONTAINER_CATEGORY_FIELDS[category]),
    )) {
      categories.add(category);
    }
  }

  if (!deepEqual(
    [currentSpec.volumes, pickContainerFields(currentContainers, ["name", "volumeMounts"])],
    [targetSpec.volumes, pickContainerFields(targetContainers, ["name", "volumeMounts"])],
  )) {
    categories.add("volumes");
  }

  if (!deepEqual(current.metadata, target.metadata)) {
    categories.add("metadata");
  }

  if (!deepEqual(
    [currentSpec.serviceAccountName, currentSpec.serviceAccount, currentSpec.automountServiceAccountToken],
    [targetSpec.serviceAccountName, targetSpec.serviceAccount, targetSpec.automountServiceAccountToken],
  )) {
    categories.add("serviceAccount");
  }

  const residualOf = (spec: Record<string, unknown>, containers: Array<Record<string, unknown>>) => ({
    spec: Object.fromEntries(Object.entries(spec).filter(([key]) => !KNOWN_SPEC_FIELDS.has(key))),
    containers: containers.map(container => Object.fromEntries(
      Object.entries(container).filter(([key]) => !KNOWN_CONTAINER_FIELDS.has(key)),
    )),
  });

  if (!deepEqual(residualOf(currentSpec, currentContainers), residualOf(targetSpec, targetContainers))) {
    categories.add("other");
  }

  return TEMPLATE_CHANGE_CATEGORIES.filter(category => categories.has(category));
};
