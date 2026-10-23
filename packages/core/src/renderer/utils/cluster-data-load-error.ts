/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export interface ClusterDataLoadErrorOptions {
  /** True when some namespaces loaded but at least one required query failed. */
  partial: boolean;
  errors?: unknown[];
}

/**
 * Distinguishes a complete cluster-wide load from an incomplete one.
 *
 * A successful but empty result is never represented by this error: zero items is a valid complete
 * outcome. The error exists only when a required query could not be completed.
 */
export class ClusterDataLoadError extends Error {
  readonly resource: string;
  readonly partial: boolean;
  readonly errors: unknown[];

  constructor(resource: string, { partial, errors = [] }: ClusterDataLoadErrorOptions) {
    super(`${resource} load ${partial ? "is incomplete (partial failure)" : "failed"}`);

    this.name = "ClusterDataLoadError";
    this.resource = resource;
    this.partial = partial;
    this.errors = errors;
  }
}
