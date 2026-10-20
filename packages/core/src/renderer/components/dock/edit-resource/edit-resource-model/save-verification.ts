/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { Operation } from "rfc6902";
import { createPatch } from "rfc6902";
import { isEqual } from "lodash";
import { base64 } from "@openlens/utilities";
import type { RawKubeObject } from "@openlens/kube-object";

/**
 * Paths that the API server owns. Changes to them are never treated as user edits.
 */
const serverManagedPath = /^\/(status|metadata\/(resourceVersion|managedFields|generation|selfLink|uid|creationTimestamp))(\/|$)/;

/**
 * Kinds that are saved with a full replace (PUT) guarded by the originally loaded `resourceVersion`.
 *
 * They have no controller-written spec or status, so a conflict really means a concurrent edit.
 * Other kinds (Deployments, StatefulSets, CRDs, ...) keep the minimal JSON Patch so that fields
 * written by controllers are not overwritten, and status updates do not cause spurious conflicts.
 */
export const usesOptimisticReplace = (object: Pick<RawKubeObject, "apiVersion" | "kind">) => (
  object.apiVersion === "v1" && (object.kind === "ConfigMap" || object.kind === "Secret")
);

export const getUserChanges = (original: object, edited: object): Operation[] => (
  createPatch(original, edited).filter(op => !serverManagedPath.test(op.path))
);

/**
 * Builds the PUT body: the edited object pinned to the `resourceVersion` that was loaded.
 * The edited `resourceVersion` is ignored on purpose, so a concurrent change results in a 409.
 */
export const prepareForReplace = (edited: RawKubeObject, originalResourceVersion: string): RawKubeObject => {
  const body = JSON.parse(JSON.stringify(edited)) as RawKubeObject;
  const metadata = body.metadata as { selfLink?: string; resourceVersion?: string };

  metadata.resourceVersion = originalResourceVersion;
  delete metadata.selfLink; // client-side only, see request-kube-resource

  return body;
};

const decodeToken = (token: string) => token.replace(/~1/g, "/").replace(/~0/g, "~");

const getAt = (object: unknown, tokens: string[]): { found: boolean; value?: unknown } => {
  let current = object;

  for (const token of tokens) {
    if (current === null || typeof current !== "object" || !(token in current)) {
      return { found: false };
    }

    current = (current as Record<string, unknown>)[token];
  }

  return { found: true, value: current };
};

/**
 * Array edits are compared as whole arrays, since JSON Patch indexes are positional.
 */
const getComparableTokens = (path: string, edited: unknown) => {
  const tokens = path.split("/").slice(1).map(decodeToken);
  const last = tokens[tokens.length - 1];

  if (last === "-" || (/^\d+$/.test(last ?? "") && Array.isArray(getAt(edited, tokens.slice(0, -1)).value))) {
    return tokens.slice(0, -1);
  }

  return tokens;
};

const verifyStringData = (tokens: string[], edited: unknown, persisted: unknown): boolean => {
  // `stringData` is write-only: the API server merges it into `data` as base64
  const value = getAt(edited, tokens).value;
  const entries = tokens.length === 1
    ? Object.entries((value ?? {}) as Record<string, unknown>)
    : [[tokens[1], value] as const];

  return entries.every(([key, plain]) => (
    getAt(persisted, ["data", key]).value === base64.encode(String(plain))
  ));
};

/**
 * Compares the user's edits with the object read back from the cluster.
 *
 * @returns The JSON pointer paths that were not persisted as requested. Never values.
 */
export const findUnpersistedChanges = (edited: unknown, persisted: unknown, userChanges: Operation[]): string[] => {
  const mismatches = new Set<string>();

  for (const op of userChanges) {
    const tokens = getComparableTokens(op.path, edited);
    const path = `/${tokens.join("/")}`;

    if (tokens[0] === "stringData") {
      if (!verifyStringData(tokens, edited, persisted)) {
        mismatches.add(path);
      }

      continue;
    }

    const expected = getAt(edited, tokens);
    const actual = getAt(persisted, tokens);

    if (expected.found !== actual.found || !isEqual(expected.value, actual.value)) {
      mismatches.add(path);
    }
  }

  return [...mismatches];
};

export interface SaveConflict {
  localChangedPaths: string[];
  /**
   * `undefined` when the current cluster version could not be read.
   */
  remoteChangedPaths: string[] | undefined;
  overlappingPaths: string[];
}

export const describeConflict = (original: object, edited: object, remote: object | undefined): SaveConflict => {
  const localChangedPaths = [...new Set(getUserChanges(original, edited).map(op => op.path))];
  const remoteChangedPaths = remote
    ? [...new Set(getUserChanges(original, remote).map(op => op.path))]
    : undefined;
  const overlappingPaths = localChangedPaths.filter(local => remoteChangedPaths?.some(remote => (
    local === remote || local.startsWith(`${remote}/`) || remote.startsWith(`${local}/`)
  )));

  return { localChangedPaths, remoteChangedPaths, overlappingPaths };
};
