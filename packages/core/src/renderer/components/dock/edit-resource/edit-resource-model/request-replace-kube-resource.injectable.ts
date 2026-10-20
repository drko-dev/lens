/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { JsonApiErrorParsed } from "@openlens/json-api";
import type { RawKubeObject } from "@openlens/kube-object";
import { getErrorMessage } from "../../../../../common/utils/get-error-message";
import apiKubeInjectable from "../../../../k8s/api-kube.injectable";

export type ReplaceKubeResourceResult =
  | { callWasSuccessful: true }
  | { callWasSuccessful: false; error: string; isConflict: boolean };

export type RequestReplaceKubeResource = (selfLink: string, object: RawKubeObject) => Promise<ReplaceKubeResourceResult>;

export const isConflictError = (error: unknown) => (
  error instanceof JsonApiErrorParsed
  && (error.error as { code?: unknown } | undefined)?.code === 409
);

const requestReplaceKubeResourceInjectable = getInjectable({
  id: "request-replace-kube-resource",
  instantiate: (di): RequestReplaceKubeResource => {
    const apiKube = di.inject(apiKubeInjectable);

    return async (selfLink, object) => {
      try {
        await apiKube.put(selfLink, { data: object });

        return { callWasSuccessful: true };
      } catch (e) {
        return {
          callWasSuccessful: false,
          error: getErrorMessage(e),
          isConflict: isConflictError(e),
        };
      }
    };
  },
});

export default requestReplaceKubeResourceInjectable;
