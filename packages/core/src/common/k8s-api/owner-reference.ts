/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export interface OwnerReferenceLike {
  kind?: string;
  name: string;
  uid?: string;
  namespace?: string;
}

export interface OwnerCandidate {
  getId(): string;
  getName(): string;
  getNs(): string | undefined;
  kind?: string;
}

export type ResolvedOwnerReference<T extends OwnerCandidate> =
  | { state: "verified"; object: T }
  | { state: "stale"; current: T }
  | { state: "missing" };

/**
 * Resolves an ownerReference against the objects loaded for its kind.
 * Lookup is by UID first; a name match with a different UID means the owner was recreated.
 * Namespaced candidates must live in the reference's namespace (cluster-scoped ones have none).
 */
export function resolveOwnerReference<T extends OwnerCandidate>(
  ref: OwnerReferenceLike,
  candidates: readonly T[] | undefined,
): ResolvedOwnerReference<T> {
  const inScope = (item: T) => (
    (!ref.kind || !item.kind || item.kind === ref.kind)
    && (!item.getNs() || item.getNs() === ref.namespace)
  );
  const scoped = (candidates ?? []).filter(inScope);

  const verified = ref.uid ? scoped.find(item => item.getId() === ref.uid) : undefined;

  if (verified) {
    return { state: "verified", object: verified };
  }

  const current = scoped.find(item => item.getName() === ref.name);

  return current
    ? { state: "stale", current }
    : { state: "missing" };
}
