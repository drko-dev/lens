/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { JsonApiErrorParsed } from "@openlens/json-api";
import type { JsonPatch } from "../../../../../common/k8s-api/kube-object.store";
import { getErrorMessage } from "../../../../../common/utils/get-error-message";
import { patchTypeHeaders } from "../../../../../common/k8s-api/kube-api";
import type { KubeApiDryRunOptions } from "../../../../../common/k8s-api/kube-api";
import apiKubePatchInjectable from "../../../../k8s/api-kube-patch.injectable";

export type RequestPatchKubeResource = (
  selfLink: string,
  patch: JsonPatch,
  opts?: KubeApiDryRunOptions,
) => Promise<
  | { callWasSuccessful: true; response: { name: string; kind: string }}
  | { callWasSuccessful: false; error: string; isConflict: boolean; errorPayload?: unknown }
>;

/**
 * Kubernetes normally returns 409 for a failed resourceVersion precondition.
 * Some API-server/JSON Patch combinations return 422 with a specific test
 * failure message. Other 422 validation errors must not be misclassified.
 */
export const isPatchConflictError = (error: unknown): boolean => {
  if (!(error instanceof JsonApiErrorParsed)) {
    return false;
  }

  const payload = error.error as { code?: unknown; message?: unknown };

  return payload.code === 409 || (
    payload.code === 422
    && typeof payload.message === "string"
    && /json.?patch.{0,60}test|test operation|test failed/i.test(payload.message)
  );
};

const requestPatchKubeResourceInjectable = getInjectable({
  id: "request-patch-kube-resource",
  instantiate: (di): RequestPatchKubeResource => {
    const apiKubePatch = di.inject(apiKubePatchInjectable);

    return async (selfLink, patch, opts) => {
      try {
        const { metadata, kind } = await apiKubePatch(selfLink, {
          data: patch,
          ...(opts?.dryRun === "All" ? { query: { dryRun: "All" as const }} : {}),
        }, {
          headers: {
            "content-type": patchTypeHeaders.json,
          },
        });

        return {
          callWasSuccessful: true,
          response: { name: metadata.name, kind },
        };
      } catch (e) {
        return {
          callWasSuccessful: false,
          error: getErrorMessage(e),
          isConflict: isPatchConflictError(e),
          ...(e instanceof JsonApiErrorParsed ? { errorPayload: e.error } : {}),
        };
      }
    };
  },
});

export default requestPatchKubeResourceInjectable;
