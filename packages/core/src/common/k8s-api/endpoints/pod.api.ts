/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type {
  DeleteResourceDescriptor,
  DerivedKubeApiOptions,
  KubeApiDependencies,
  ResourceDescriptor,
} from "../kube-api";
import { KubeApi } from "../kube-api";
import type { KubeStatusData, PodLogsQuery } from "@openlens/kube-object";
import { isKubeStatusData, KubeStatus, Pod } from "@openlens/kube-object";
import type { RequestInit, Response } from "@openlens/node-fetch";


export interface EphemeralContainerOptions {
  name: string;
  image: string;
  command?: string[];
  args?: string[];
  stdin?: boolean;
  tty?: boolean;
  targetContainerName?: string;
  [key: string]: any;
}

export interface AttachEphemeralContainerOptions {
  resourceVersion?: string;
  signal?: AbortSignal;
  isCancelled?: () => boolean;
  generation?: number;
  getCurrentGeneration?: () => number;
  clusterId?: string;
  getCurrentClusterId?: () => string | undefined;
  isClusterHealthy?: () => boolean;
  expectedPodUid?: string;
  expectedName?: string;
  expectedNamespace?: string;
  validateContext?: (freshPod: Pod) => boolean | string;
}

export class PodApi extends KubeApi<Pod> {
  constructor(deps: KubeApiDependencies, opts?: DerivedKubeApiOptions) {
    super(deps, {
      ...opts ?? {},
      objectConstructor: Pod,
    });
  }

  async evict(resource: DeleteResourceDescriptor) {
    await this.checkPreferredVersion();
    const apiUrl = this.formatUrlForNotListing(resource);
    let response: KubeStatusData;

    try {
      response = await this.request.post<KubeStatusData>(`${apiUrl}/eviction`, {
        data: {
          apiVersion: "policy/v1",
          kind: "Eviction",
          metadata: {
            ...resource,
          },
        },
      });
    } catch (err) {
      response = err as KubeStatusData;
    }

    if (isKubeStatusData(response)) {
      const status = new KubeStatus(response);

      if (status.code >= 200 && status.code < 300) {
        return status.getExplanation();
      } else {
        throw status.getExplanation();
      }
    }

    return response;
  }

  async getLogs(params: ResourceDescriptor, query?: PodLogsQuery): Promise<string> {
    const path = `${this.getUrl(params)}/log`;

    const logs = await this.request.get(path, { query });

    if (typeof logs !== "string") {
      return "";
    }

    return logs;
  }

  async getLogsStream(
    params: ResourceDescriptor,
    query?: PodLogsQuery,
    reqInit?: RequestInit,
  ): Promise<Response> {
    const path = `${this.getUrl(params)}/log`;

    return this.request.getResponse(path, { query }, reqInit);
  }

  async attachEphemeralContainer(
    resource: ResourceDescriptor,
    container: EphemeralContainerOptions,
    options?: AttachEphemeralContainerOptions,
  ): Promise<Pod> {
    const checkPreconditions = (freshPod?: Pod) => {
      // 1. AbortSignal check
      if (options?.signal?.aborted) {
        const error: any = new Error("Operation aborted");

        error.name = "AbortError";
        error.statusCode = 499;
        error.code = 499;
        throw error;
      }

      // 2. Explicit cancellation check
      if (options?.isCancelled?.()) {
        const error: any = new Error("Operation cancelled");

        error.name = "AbortError";
        error.statusCode = 499;
        error.code = 499;
        throw error;
      }

      // 3. Monotonic generation token check (superseded by newer operation)
      if (
        options?.generation !== undefined &&
        options.getCurrentGeneration &&
        options.getCurrentGeneration() !== options.generation
      ) {
        const error: any = new Error("Operation superseded by a newer generation");

        error.name = "AbortError";
        error.statusCode = 499;
        error.code = 499;
        throw error;
      }

      // 4. Cluster identity and effective context check
      if (
        options?.clusterId &&
        options.getCurrentClusterId &&
        options.getCurrentClusterId() !== options.clusterId
      ) {
        const error: any = new Error(`Cluster context changed (expected "${options.clusterId}", current "${options.getCurrentClusterId()}")`);

        error.name = "AbortError";
        error.statusCode = 499;
        error.code = 499;
        throw error;
      }

      // 5. Cluster connection health check
      if (options?.isClusterHealthy && !options.isClusterHealthy()) {
        const error: any = new Error("Cluster connection is disconnected or unhealthy");

        error.name = "AbortError";
        error.statusCode = 499;
        error.code = 499;
        throw error;
      }

      // 6. Name and namespace pre-checks on descriptor
      if (options?.expectedName && resource.name !== options.expectedName) {
        const error: any = new Error(`Target pod name mismatch (expected "${options.expectedName}", current "${resource.name}")`);

        error.name = "AbortError";
        error.statusCode = 412;
        error.code = 412;
        throw error;
      }

      if (options?.expectedNamespace && resource.namespace !== options.expectedNamespace) {
        const error: any = new Error(`Target pod namespace mismatch (expected "${options.expectedNamespace}", current "${resource.namespace}")`);

        error.name = "AbortError";
        error.statusCode = 412;
        error.code = 412;
        throw error;
      }

      // 7. Post-GET validations on actual Pod returned from Kubernetes
      if (freshPod) {
        // UID check: pod deleted and recreated with same name
        if (options?.expectedPodUid && freshPod.getId() !== options.expectedPodUid) {
          const error: any = new Error(
            `Pod UID mismatch: expected "${options.expectedPodUid}" but server returned "${freshPod.getId()}" (Pod was deleted/recreated)`,
          );

          error.name = "AbortError";
          error.statusCode = 412;
          error.code = 412;
          throw error;
        }

        if (options?.expectedName && freshPod.getName() !== options.expectedName) {
          const error: any = new Error(`Pod name mismatch: expected "${options.expectedName}", server returned "${freshPod.getName()}"`);

          error.name = "AbortError";
          error.statusCode = 412;
          error.code = 412;
          throw error;
        }

        if (options?.expectedNamespace && freshPod.getNs() !== options.expectedNamespace) {
          const error: any = new Error(`Pod namespace mismatch: expected "${options.expectedNamespace}", server returned "${freshPod.getNs()}"`);

          error.name = "AbortError";
          error.statusCode = 412;
          error.code = 412;
          throw error;
        }

        // Custom context validator (e.g., transition to PRODUCTION without dual confirmation)
        if (options?.validateContext) {
          const validationResult = options.validateContext(freshPod);

          if (validationResult !== true) {
            const msg = typeof validationResult === "string" ? validationResult : "Context validation failed before PATCH mutation";
            const error: any = new Error(msg);

            error.name = "AbortError";
            error.statusCode = 412;
            error.code = 412;
            throw error;
          }
        }
      }
    };

    checkPreconditions();

    await this.checkPreferredVersion();
    const apiUrl = this.formatUrlForNotListing(resource);
    const subresourceEndpoint = `${apiUrl}/ephemeralcontainers`;

    // Pre-GET check
    checkPreconditions();

    // 1. Fetch current Pod to preserve existing ephemeralContainers and verify resourceVersion
    const currentPod = await this.get(resource);

    // CRITICAL CHECK: Preconditions immediately after GET resolution
    // If context changed or user cancelled while GET was in flight, abort before PATCH!
    checkPreconditions();

    if (!currentPod) {
      const error: any = new Error(`Pod "${resource.name}" in namespace "${resource.namespace}" not found`);

      error.statusCode = 404;
      error.code = 404;
      throw error;
    }

    // Validate pod-specific preconditions (UID, name, namespace, validateContext) on fresh Pod
    checkPreconditions(currentPod);

    const targetResourceVersion = options?.resourceVersion ?? currentPod.getResourceVersion();

    // 2. Validate resourceVersion if provided to protect against concurrent modifications (HTTP 409)
    if (options?.resourceVersion && currentPod.getResourceVersion() !== options.resourceVersion) {
      const error: any = new Error(`Conflict: Pod resourceVersion mismatch (expected ${options.resourceVersion}, found ${currentPod.getResourceVersion()})`);

      error.statusCode = 409;
      error.code = 409;
      throw error;
    }

    const existingEphemeral = (currentPod.spec as any)?.ephemeralContainers ?? [];

    // 3. Ensure unique container name
    if (existingEphemeral.some((c: any) => c.name === container.name)) {
      const error: any = new Error(`An ephemeral container named "${container.name}" already exists in pod "${resource.name}"`);

      error.statusCode = 422;
      error.code = 422;
      throw error;
    }

    // 4. Preserve existing ephemeral containers and append the new one
    const updatedContainers = [...existingEphemeral, container];

    const patchPayload = {
      metadata: {
        resourceVersion: targetResourceVersion,
      },
      spec: {
        ephemeralContainers: updatedContainers,
      },
    };

    // Pre-PATCH check: Final safeguard immediately before touching the network
    checkPreconditions(currentPod);

    const res = await this.request.patch<any>(subresourceEndpoint, {
      data: patchPayload,
    }, {
      headers: {
        "content-type": "application/strategic-merge-patch+json",
      },
    });

    // Post-PATCH check: verify cancellation / precondition state before parsing/returning
    checkPreconditions(currentPod);

    const parsed = this.parseResponse(res);

    if (Array.isArray(parsed)) {
      throw new Error(`PATCH request to ${subresourceEndpoint} returned an array`);
    }

    return parsed as Pod;
  }
}
